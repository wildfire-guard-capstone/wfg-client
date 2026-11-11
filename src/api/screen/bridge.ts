import type * as C from '../contracts.ts';
import type { ApiDataSource, IncidentData } from '../data-source.ts';
import type {
  AppState,
  IncidentState,
  ProposalRun,
  ModalAction,
} from '../../types/domain.ts';
import type { Scenario, Account, Ring } from '../../types/scenario.ts';
import { createIdempotencyKey } from '../client.ts';
import { waitForOperation, validateOperation } from '../operations.ts';
import { remote } from '../data-source.ts';
import { incidentDetailsView, incidentListRow } from './incidents.ts';
import { validateAssistant } from './assistant.ts';
import {
  NULL_TEXT,
  UI_TO_API_ITEM,
  accountView,
  displayRing,
  emptyIncident,
  numberText,
  proposalView,
  resourceCounts,
  resourceViews,
  riskView,
  roleToApi,
  submissionGeometry,
  text,
  versionView,
} from './adapters.ts';

export interface ScreenHost {
  S: Scenario;
  state: AppState;
  IS: (id?: string) => IncidentState;
  refresh: () => void;
  enter: (account: Account) => void;
  leave: (reason?: string) => void;
  selected: (id: string, fly?: boolean) => void;
  reportForm: (id: string | null) => void;
  admin: () => void;
  notice: (message: string) => void;
  loginError: (message: string) => void;
  loginBusy: (busy: boolean) => void;
  baseAt: (at: string) => void;
  busy: (busy: boolean) => void;
  predictionReady: () => void;
  chatBusy: (busy: boolean) => void;
  message: (kind: string, text: string) => void;
  answer: (message: C.QaMessage) => void;
  preview: (preview: C.CorrectionPreview, confirm: () => void) => void;
  modal: (title: string, body: string, actions: ModalAction[]) => void;
  diff: (before: ProposalRun, after: ProposalRun) => void;
  issued: (account: Account, password: string) => void;
  proposalSelected?: () => void;
}
const input = (id: string) =>
  (document.getElementById(id) as HTMLInputElement).value.trim();
const escaped = (value: unknown) =>
  text(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

/** Only request orchestration and data assignment. It does not create screens,
 * change CSS, initialize maps, or select a different rendering implementation. */
export function createScreenBridge(
  source: ApiDataSource,
  host: ScreenHost,
  options: { accountAdminAreaId?: string } = {},
) {
  const { S, state, IS } = host;
  const origin: [number, number] = [...S.incidents[0]!.ignition];
  const raw = new Map<string, C.Incident>();
  const snapshot = new Map<string, IncidentData>();
  const versions = new Map<string, C.ProposalVersion[]>();
  const predictionOperations = new Map<string, C.Operation>();
  let proposalTicket = 0;
  let chatTicket = 0;
  const requests = new Set<AbortController>();
  const incidentSummaries = new Map<string, C.IncidentSummary>();
  let listStatus: 'not-requested' | 'loading' | 'ready' | 'error' =
    'not-requested';
  let listError: unknown;
  let selectionRequest: AbortController | null = null;
  let pendingIncident: string | null = null;
  let ending = false;
  let generation = 0,
    selection = 0,
    disposed = false,
    loading = false,
    loggingOut = false,
    chatting = false,
    saving = false,
    issuing = false;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const confirming = new Set<string>();
  const savedConfirmations = new Set<string>();
  const regenerating = new Set<string>();
  let counts = resourceCounts(null);
  let currentWeather: C.WeatherNow | null = null;
  let currentUser: C.User | null = null;
  const missingRing = displayRing({ type: 'MultiPolygon', coordinates: [] });
  const errors = new Map<string, unknown>();
  const alive = (epoch: number) => !disposed && epoch === generation;
  const error = (cause: unknown) =>
    cause instanceof Error ? cause.message : String(cause);
  async function task<T>(
    fn: (signal: AbortSignal, epoch: number) => Promise<T>,
    controller = new AbortController(),
  ): Promise<T | undefined> {
    const epoch = generation;
    requests.add(controller);
    try {
      return await fn(controller.signal, epoch);
    } catch (cause) {
      if (!controller.signal.aborted && alive(epoch)) host.notice(error(cause));
      return undefined;
    } finally {
      requests.delete(controller);
    }
  }
  function reset() {
    generation++;
    selection++;
    proposalTicket++;
    chatTicket++;
    for (const c of requests) c.abort();
    requests.clear();
    selectionRequest?.abort();
    selectionRequest = null;
    pendingIncident = null;
    incidentSummaries.clear();
    listStatus = 'not-requested';
    listError = undefined;
    raw.clear();
    snapshot.clear();
    versions.clear();
    predictionOperations.clear();
    confirming.clear();
    savedConfirmations.clear();
    regenerating.clear();
    errors.clear();
    currentWeather = null;
    counts = resourceCounts(null);
    currentUser = null;
    clearTimeout(expiryTimer);
    expiryTimer = undefined;
    loading = false;
    host.loginBusy(false);
    chatting = false;
    host.busy(false);
    host.chatBusy(false);
  }
  function expire(reason = '인증 토큰 만료') {
    const hadSession = currentUser !== null || loading || state.role !== null;
    source.client.clearSession();
    reset();
    if (hadSession && !disposed) host.leave(reason);
  }
  function scheduleExpiry(expiresIn: number) {
    clearTimeout(expiryTimer);
    const expiresAt = Date.now() + expiresIn * 1000;
    const check = () => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) expire();
      else expiryTimer = setTimeout(check, Math.min(remaining, 2_147_483_647));
    };
    check();
  }
  async function resources(
    incidentId: string | undefined,
    signal: AbortSignal,
    epoch: number,
  ) {
    const result = await source.resources(incidentId, signal);
    if (
      !alive(epoch) ||
      signal.aborted ||
      (incidentId !== undefined && state.incId !== incidentId)
    )
      return;
    counts = resourceCounts(
      result.summary.status === 'ready' ? result.summary.data : null,
    );
    S.resources =
      result.list.status === 'ready'
        ? resourceViews(
            result.list.data,
            result.bases.status === 'ready' ? result.bases.data : [],
          )
        : [];
    S.resources_fetch_status = 'ready';
    for (const [name, response] of Object.entries(result))
      if (response.status === 'error')
        errors.set(`resources.${name}`, response.error);
  }
  function install(data: IncidentData) {
    raw.set(data.incident.id, data.incident);
    snapshot.set(data.incident.id, data);
    const old = S.incidents.findIndex((i) => i.id === data.incident.id);
    const view = incidentDetailsView(
      data.incident,
      data.perimeters.status === 'ready' ? data.perimeters.data : [],
    );
    if (old < 0) S.incidents.push(view);
    else S.incidents[old] = view;
    const st = IS(view.id);
    st.stale = data.incident.needs_reprediction || (data.prediction.status === 'ready' && (data.prediction.data.perimeter_id !== data.incident.current_perimeter_id || data.prediction.data.id !== data.incident.latest_prediction_id));
    st.predicted = data.prediction.status === 'ready' && data.slices.status === 'ready' && data.slices.data.features.length > 0;
    st.predictFailed = data.prediction.status === 'error' || data.slices.status === 'error';
    st.proposalFailed = data.proposal.status === 'error';
    st.latestRisk = riskView(
      data.risk.status === 'ready' ? data.risk.data : null,
      S,
    );
    st.riskStatus = data.risk.status === 'error' ? 'failed' : 'ready';
    S.weather.fetch_status = data.now.status === 'error' ? 'failed' : 'ready';
    st.predPerim = null;
    if (data.prediction.status === 'ready') {
      const p = data.prediction.data;
      const perim =
        data.perimeters.status === 'ready'
          ? data.perimeters.data.find((row) => row.id === p.perimeter_id)
          : undefined;
      st.predPerim = {
        version: p.perimeter_version,
        area: perim?.area_ha ?? null,
        at: p.base_at,
      };
      st.slices = Array.from({ length: 8 }, (_, i) => {
        const feature =
          data.slices.status === 'ready'
            ? data.slices.data.features.find((f) => f.properties.hour === i + 1)
            : undefined;
        return feature
          ? displayRing(feature.geometry, feature.properties.area_ha)
          : displayRing({ type: 'MultiPolygon', coordinates: [] });
      });
    } else st.slices = [];
    st.t = 0;
    const proposal =
      data.proposal.status === 'ready' ? data.proposal.data : null;
    const run = proposalView(
      proposal,
      S,
      proposal &&
        data.prediction.status === 'ready' &&
        proposal.prediction_id === data.prediction.data.id
        ? st.predPerim
        : null,
    );
    st.currentRun = st.predicted || proposal ? run : null;
    st.viewRun = st.currentRun;
    st.runs = proposal ? [run] : [];
    for (const [name, response] of Object.entries(data))
      if (
        response &&
        typeof response === 'object' &&
        'status' in response &&
        response.status === 'error'
      )
        errors.set(`${view.id}.${name}`, response.error);
  }
  async function histories(
    incidentId: string,
    signal: AbortSignal,
    epoch: number,
  ) {
    const messageTicket = chatTicket;
    const [props, logs, corrections, messages] = await Promise.all([
      state.role === 'commander'
        ? remote(() => source.proposalVersions(incidentId, signal))
        : Promise.resolve(null),
      remote(() => source.events(incidentId, signal)),
      state.role === 'commander'
        ? remote(() => source.corrections(incidentId, signal))
        : Promise.resolve(null),
      state.role === 'commander'
        ? remote(() => source.messages(incidentId, signal))
        : Promise.resolve(null),
    ]);
    if (!alive(epoch) || signal.aborted || state.incId !== incidentId) return;
    if (props?.status === 'ready') {
      versions.set(incidentId, props.data);
      const st = IS(incidentId),
        latest = st.currentRun;
      st.runs = props.data
        .slice()
        .reverse()
        .map((v) => (v.id === latest?.apiId ? latest : versionView(v, S)));
      if (latest?.apiId && !st.runs.some((run) => run.apiId === latest.apiId))
        st.runs.push(latest);
    }
    if (logs.status === 'ready')
      state.events = logs.data
        .map((log) => ({
          t: new Date(log.created_at).toLocaleTimeString('ko-KR', {
            hour12: false,
            timeZone: 'Asia/Seoul',
          }),
          kind: log.action,
          text: log.details ? JSON.stringify(log.details) : NULL_TEXT,
          inc: log.incident_id,
          user: log.user_id,
        }))
        .reverse();
    if (corrections?.status === 'ready')
      for (const row of corrections.data)
        if (!state.events.some((e) => e.text.includes(`COR-${row.id}`)))
          state.events.push({
            t: new Date(row.created_at).toLocaleTimeString('ko-KR', {
              hour12: false,
              timeZone: 'Asia/Seoul',
            }),
            kind: '정정',
            text: `COR-${row.id} ${row.input_text}`,
            inc: row.incident_id,
            user: row.user_id,
          });
    if (messages?.status === 'ready' && messageTicket === chatTicket) {
      const log = document.getElementById('chat-log')!;
      log.textContent = '';
      for (const message of messages.data.slice().reverse()) {
        host.message('user', message.question);
        host.answer(message);
      }
    }
    for (const [name, result] of Object.entries({
      props,
      logs,
      corrections,
      messages,
    }))
      if (result?.status === 'error')
        errors.set(`${incidentId}.${name}`, result.error);
  }
  async function select(id: string, fly = false, resultPredictionId?: string, resultProposalId?: string) {
    if (pendingIncident === id || disposed) return;
    const ticket = ++selection;
    selectionRequest?.abort();
    selectionRequest = new AbortController();
    pendingIncident = id;
    host.refresh();
    let applied = false;
    await task(async (signal, epoch) => {
      const data = await source.loadIncident(
        id,
        roleToApi(state.role!),
        signal,
        undefined,
        resultPredictionId,
        resultProposalId,
      );
      if (!alive(epoch) || ticket !== selection || signal.aborted) return;
      install(data);
      if (state.incId !== id) {
        chatTicket++;
        chatting = false;
        state.chatCtx = null;
        host.chatBusy(false);
        document.getElementById('chat-log')!.textContent = '';
      }
      state.incId = id;
      pendingIncident = null;
      currentWeather = data.now.status === 'ready' ? data.now.data : null;
      if (data.prediction.status === 'ready')
        host.baseAt(data.prediction.data.base_at);
      // Commit the selected identity and detail together before related panels load.
      host.selected(id, fly);
      if (state.role === 'reporter') host.reportForm(id);
      applied = true;
      await Promise.all([
        resources(id, signal, epoch),
        histories(id, signal, epoch),
      ]);
      if (!alive(epoch) || ticket !== selection || state.incId !== id) return;
      host.refresh();
    }, selectionRequest);
    if (!disposed && ticket === selection) {
      pendingIncident = null;
      selectionRequest = null;
      if (!applied && state.role === 'reporter')
        host.reportForm(raw.has(state.incId) ? state.incId : null);
      host.refresh();
    }
  }
  async function retryIncidents() {
    if (listStatus !== 'error' || disposed) return;
    listStatus = 'loading';
    host.refresh();
    await task(async (signal, epoch) => {
      try {
        const directory = await source.incidentDirectory(signal);
        if (!alive(epoch)) return;
        incidentSummaries.clear();
        for (const row of directory.items) incidentSummaries.set(row.id, row);
        for (const [id, detail] of directory.details)
          if (detail.status === 'ready') {
            raw.set(id, detail.data);
            const index = S.incidents.findIndex((row) => row.id === id);
            if (index < 0)
              S.incidents.push(incidentDetailsView(detail.data, []));
            else if (id !== state.incId)
              S.incidents[index] = incidentDetailsView(detail.data, []);
          }
        listStatus = 'ready';
        listError = undefined;
        if (!raw.has(state.incId)) {
          const first = directory.items.find((row) => raw.has(row.id));
          if (first) await select(first.id);
        }
        if (alive(epoch)) host.refresh();
      } catch (cause) {
        if (alive(epoch)) {
          listStatus = 'error';
          listError = cause;
          host.refresh();
        }
        throw cause;
      }
    });
  }
  async function login() {
    if (loading || loggingOut || disposed) return;
    const body: C.LoginRequest = {
      login_id: input('login-id'),
      // A password is opaque: leading/trailing whitespace is significant.
      password: (document.getElementById('login-pw') as HTMLInputElement).value,
      role: roleToApi(input('login-role')),
    };
    if (!body.login_id || !body.password) {
      host.loginError(
        !body.login_id ? '아이디를 입력하십시오.' : '비밀번호를 입력하십시오.',
      );
      return;
    }
    loading = true;
    const loginEpoch = generation;
    host.loginBusy(true);
    host.loginError('');
    try {
      await task(async (signal, epoch) => {
        try {
          const result = await source.api.auth.login({
            body,
            signal,
          });
          if (!alive(epoch)) return;
          scheduleExpiry(result.expires_in);
          const user = await source.api.auth.me({ signal });
          if (!alive(epoch)) return;
          if (
            user.id !== result.user.id ||
            user.role !== result.user.role ||
            user.role !== body.role
          )
            throw new Error('로그인 계정의 권한이 선택한 역할과 다릅니다.');
          currentUser = user;
          if (user.role === 'ADMIN') {
            const [users] = await Promise.all([
              source.users(signal),
              resources(undefined, signal, epoch),
            ]);
            if (!alive(epoch)) return;
            S.accounts = users.map(accountView);
            host.enter(accountView(user));
            bindAdmin();
            return;
          }
          listStatus = 'loading';
          const directory = await remote(() =>
            source.incidentDirectory(signal),
          );
          if (!alive(epoch)) return;
          const list = directory.status === 'ready' ? directory.data.items : [];
          listStatus = directory.status === 'ready' ? 'ready' : 'error';
          listError =
            directory.status === 'error' ? directory.error : undefined;
          incidentSummaries.clear();
          for (const row of list) incidentSummaries.set(row.id, row);
          S.incidents = [];
          if (directory.status === 'ready')
            for (const [id, detail] of directory.data.details) {
              if (detail.status === 'ready') {
                raw.set(id, detail.data);
                S.incidents.push(incidentDetailsView(detail.data, []));
              } else if (detail.status === 'error')
                errors.set(`${id}.incident`, detail.error);
            }
          state.inc = {};
          state.events = [];
          state.incId =
            list.find((i) => i.status === 'IN_PROGRESS' && raw.has(i.id))?.id ??
            list.find((i) => raw.has(i.id))?.id ??
            '__NULL__';
          if (raw.has(state.incId)) {
            const data = await source.loadIncident(
              state.incId,
              user.role,
              signal,
              raw.get(state.incId),
            );
            if (!alive(epoch)) return;
            install(data);
            currentWeather = data.now.status === 'ready' ? data.now.data : null;
            if (data.prediction.status === 'ready')
              host.baseAt(data.prediction.data.base_at);
          }
          if (!S.incidents.length) S.incidents = [emptyIncident(origin)];
          host.enter(accountView(user));
          if (!raw.has(state.incId) && user.role === 'REPORTER')
            host.reportForm(null);
          if (listError)
            host.notice(`산불 목록을 불러오지 못했습니다. ${error(listError)}`);
          if (raw.has(state.incId)) {
            await Promise.all([
              resources(state.incId, signal, epoch),
              histories(state.incId, signal, epoch),
            ]);
            if (!alive(epoch)) return;
            host.refresh();
          }
        } catch (cause) {
          if (alive(epoch) && !signal.aborted) {
            source.client.clearSession();
            clearTimeout(expiryTimer);
            expiryTimer = undefined;
            const authenticated = currentUser !== null;
            currentUser = null;
            host.loginError(
              authenticated
                ? `인증은 확인했지만 초기 데이터를 불러오지 못했습니다. ${error(cause)}`
                : error(cause),
            );
          }
        }
      });
    } finally {
      if (alive(loginEpoch)) {
        loading = false;
        host.loginBusy(false);
      }
    }
  }
  async function logout() {
    if (loggingOut || disposed) return;
    loggingOut = true;
    const token = source.client.getAccessToken();
    reset();
    // Capture the current Bearer header, then leave locally even if logging fails.
    const pending = token ? source.api.auth.logout() : Promise.resolve();
    source.client.clearSession();
    host.leave();
    host.loginBusy(true);
    try {
      await pending;
    } catch (cause) {
      if (!disposed)
        host.notice(`로그아웃 기록을 전송하지 못했습니다. ${error(cause)}`);
    } finally {
      loggingOut = false;
      if (!disposed) host.loginBusy(false);
    }
  }
  async function predict() {
    const incident = raw.get(state.incId);
    if (
      !incident ||
      state.role !== 'commander' ||
      state.predicting ||
      pendingIncident ||
      incident.status === 'ENDED'
    ) {
      host.notice(`${NULL_TEXT} 예측할 산불 정보가 없습니다.`);
      return;
    }
    const id = incident.id;
    errors.delete(`${id}.predict`);
    host.busy(true);
    await task(async (signal, epoch) => {
      try {
        const saved = predictionOperations.get(id);
        const resumeId = saved && ['QUEUED', 'RUNNING'].includes(saved.status) ? saved.id : saved?.id === incident.running_operation_id ? null : incident.running_operation_id;
        const onUpdate = (operation: C.Operation) => {
          if (!alive(epoch) || signal.aborted) return;
          predictionOperations.set(id, operation);
          if (state.incId === id) host.refresh();
        };
        const operation = resumeId
          ? await waitForOperation(
              source.client,
              { incident_id: id, operation_id: resumeId },
              { signal, onUpdate },
            )
          : await source.predict(incident, signal, onUpdate);
        if (operation.status === 'FAILED')
          throw new Error(
            `${operation.error?.code ?? '[필요한 정보: 실패 작업 error.code]'}: ${operation.error?.message ?? '예측 작업이 실패했습니다.'}`,
          );
        if (!operation.result?.prediction_id) throw new Error('[필요한 정보: 성공한 예측 작업의 result.prediction_id]');
        if (!alive(epoch) || state.incId !== id || pendingIncident) return;
        await select(id, false, operation.result.prediction_id);
        if (!alive(epoch) || state.incId !== id || pendingIncident) return;
        const result = snapshot.get(id)?.prediction;
        if (result?.status !== 'ready' || result.data.id !== operation.result.prediction_id) throw new Error('예측 작업은 완료됐지만 해당 결과를 불러오지 못했습니다.');
        if (!IS(id).predicted) throw new Error('[필요한 정보: 성공한 예측의 시간별 GeoJSON 도형]');
        host.predictionReady();
      } catch (cause) {
        if (alive(epoch)) {
          IS(id).predictFailed = true;
          errors.set(`${id}.predict`, cause);
          host.refresh();
        }
        throw cause;
      } finally {
        if (alive(epoch)) host.busy(false);
      }
    });
  }
  async function end() {
    const incident = raw.get(state.incId);
    if (
      !incident ||
      ending ||
      pendingIncident ||
      state.role !== 'commander' ||
      incident.status !== 'IN_PROGRESS'
    )
      return;
    ending = true;
    try {
      await task(async (signal, epoch) => {
        const ended = await source.api.incidents.end({
          path: { incident_id: incident.id },
          body: { expected_perimeter_id: incident.current_perimeter_id },
          signal,
        });
        if (alive(epoch)) {
          raw.set(ended.id, ended);
          const previous = snapshot.get(ended.id);
          const index = S.incidents.findIndex((row) => row.id === ended.id);
          if (index >= 0)
            S.incidents[index] = incidentDetailsView(
              ended,
              previous?.perimeters.status === 'ready'
                ? previous.perimeters.data
                : [],
            );
          if (state.incId === ended.id) await select(ended.id);
          else host.refresh();
          host.notice('산불을 종료 상태로 바꿨습니다.');
        }
      });
    } finally {
      ending = false;
    }
  }
  async function viewVersion(version: string) {
    if (pendingIncident || state.role !== 'commander') return;
    const run = IS().runs.find((r) => r.id === version);
    if (!run?.apiId) return;
    const id = state.incId;
    const ticket = ++proposalTicket, selected = selection;
    await task(async (signal, epoch) => {
      const proposal = await source.proposal(id, run.apiId!, signal);
      const prediction = await remote(() =>
        source.api.predictions.get({
          path: { incident_id: id, prediction_id: proposal.prediction_id },
          signal,
        }),
      );
      if (alive(epoch) && state.incId === id && selection === selected && ticket === proposalTicket && !pendingIncident) {
        const p = prediction.status === 'ready' ? prediction.data : null;
        const loaded = proposalView(
          proposal,
          S,
          p
            ? { version: p.perimeter_version, area: null, at: p.base_at }
            : null,
          run.seq,
        );
        Object.assign(run, loaded);
        IS().viewRun = run;
        host.refresh();
        host.proposalSelected?.();
      }
    });
  }
  async function compare(run: ProposalRun) {
    if (!run.apiId || pendingIncident || state.role !== 'commander') return;
    const id = state.incId;
    const ticket = ++proposalTicket, selected = selection;
    await task(async (signal, epoch) => {
      const diff = await source.api.proposals.diff({
        path: { incident_id: id, proposal_id: run.apiId! },
        signal,
      });
      if (diff.version !== run.id) throw new Error('[필요한 정보: 선택한 제안 버전과 일치하는 비교 응답]');
      const previous = versions
        .get(id)
        ?.find((v) => v.version === diff.previous_version);
      if (!previous) {
        if (alive(epoch) && ticket === proposalTicket && selection === selected && state.incId === id) host.notice('비교할 이전 버전이 없습니다.');
        return;
      }
      const [before, after] = await Promise.all([
        source.proposal(id, previous.id, signal),
        source.proposal(id, run.apiId!, signal),
      ]);
      if (!alive(epoch) || state.incId !== id || selection !== selected || ticket !== proposalTicket || pendingIncident) return;
      const a = proposalView(before, S, null),
        b = proposalView(after, S, null);
      b.changed = Object.entries(UI_TO_API_ITEM)
        .filter(([, apiId]) =>
          diff.items.some((item) => item.item_code === apiId),
        )
        .map(([uiId]) => uiId);
      host.diff(a, b);
    });
  }
  async function regenerationResult(id: string, initial: C.Operation, signal: AbortSignal) {
    validateOperation(initial);
    if (initial.kind !== 'PROPOSAL_REGENERATION') throw new Error('[필요한 정보: 제안 재생성 작업 종류]');
    const result = ['SUCCEEDED', 'FAILED'].includes(initial.status) ? initial : await waitForOperation(source.client, { incident_id: id, operation_id: initial.id }, { signal });
    if (result.kind !== 'PROPOSAL_REGENERATION') throw new Error('[필요한 정보: 제안 재생성 완료 작업 종류]');
    if (result.status === 'FAILED') throw new Error(`${result.error?.code ?? 'REGENERATION_FAILED'}: ${result.error?.message ?? '제안 재생성 실패'}`);
    if (!result.result?.proposal_id) throw new Error('[필요한 정보: 재생성 성공 작업의 result.proposal_id]');
    return result;
  }
  async function regenerate(incident: C.Incident, revision: string, signal: AbortSignal) {
    if (!incident.latest_prediction_id) throw new Error('[필요한 정보: 제안 재생성에 사용할 최신 예측 ID]');
    const operation = await source.api.proposals.regenerate({
      path: { incident_id: incident.id },
      body: { expected_prediction_id: incident.latest_prediction_id, situation_revision: revision },
      idempotencyKey: createIdempotencyKey(), signal,
    });
    return regenerationResult(incident.id, operation, signal);
  }
  async function confirm(preview: C.CorrectionPreview, id: string, selected = selection) {
    if (confirming.has(preview.confirmation_token) || savedConfirmations.has(preview.confirmation_token)) return;
    if (state.role !== 'commander' || state.incId !== id || pendingIncident || selection !== selected) {
      host.notice('산불 선택이 변경되었습니다. 현재 산불에서 정정 확인안을 다시 요청하십시오.'); return;
    }
    if (Date.parse(preview.expires_at) <= Date.now() || raw.get(id)?.situation_revision !== preview.situation_revision) {
      host.notice('정정 확인안이 만료되었거나 상황이 바뀌었습니다. 확인안을 다시 요청하십시오.'); return;
    }
    confirming.add(preview.confirmation_token);
    const current = () => state.incId === id && selection === selected && !pendingIncident;
    try {
      await task(async (signal, epoch) => {
        const saved = await source.api.corrections.confirm({
          path: { incident_id: id }, body: { confirmation_token: preview.confirmation_token },
          idempotencyKey: createIdempotencyKey(), signal,
        });
        if (!alive(epoch)) return;
        savedConfirmations.add(preview.confirmation_token);
        if (saved.correction?.incident_id !== id || typeof saved.situation_revision !== 'string') throw new Error('[필요한 정보: 저장된 정정의 산불 ID·상황 버전]');
        if (current()) host.message('sys', '상황 정정을 저장했습니다.');
        let proposalId: string | undefined;
        try {
          if (saved.proposal_operation) proposalId = (await regenerationResult(id, saved.proposal_operation, signal)).result!.proposal_id;
          else if (saved.proposal_stale) throw new Error('정정은 저장됐지만 제안 재생성이 시작되지 않았습니다.');
        } catch (cause) {
          errors.set(`${id}.regeneration`, cause);
          if (!signal.aborted && alive(epoch) && current()) host.modal(
            '제안 재생성 실패', escaped(`정정은 저장됐습니다. ${error(cause)}`), [
              { label: '닫기' },
              { label: '재생성 재시도', cls: 'primary', onClick: () => {
                if (regenerating.has(id) || state.role !== 'commander' || state.incId !== id || pendingIncident) return;
                regenerating.add(id);
                const retrySelection = selection;
                return task(async (retrySignal, retryEpoch) => {
                  try {
                    const incident = await source.api.incidents.get({ path: { incident_id: id }, signal: retrySignal });
                    if (incident.id !== id) throw new Error('[필요한 정보: 요청한 산불 ID와 일치하는 현황 응답]');
                    const result = await regenerate(incident, saved.situation_revision, retrySignal);
                    if (alive(retryEpoch) && state.incId === id && selection === retrySelection && !pendingIncident) await select(id, false, undefined, result.result!.proposal_id);
                  } finally { regenerating.delete(id); }
                });
              } },
            ],
          );
        }
        if (alive(epoch) && current()) await select(id, false, undefined, proposalId);
      });
    } finally { confirming.delete(preview.confirmation_token); }
  }
  async function sendChat() {
    const q = input('chat-input');
    if (chatting || !q || pendingIncident) return;
    if (!raw.has(state.incId) || state.role !== 'commander') {
      host.notice(`${NULL_TEXT} 질문할 산불이 없습니다.`);
      return;
    }
    const ticket = ++chatTicket, selected = selection;
    chatting = true;
    host.chatBusy(true);
    host.message('user', q);
    (document.getElementById('chat-input') as HTMLInputElement).value = '';
    const id = state.incId,
      run = IS().viewRun;
    await task(async (signal, epoch) => {
      try {
        const item = state.chatCtx ? UI_TO_API_ITEM[state.chatCtx] : undefined;
        if (state.chatCtx && !item) {
          host.message(
            'bot',
            `${NULL_TEXT} 이 화면 항목과 API 제안 항목의 매핑 확인 대기 중입니다.`,
          );
          return;
        }
        const response = validateAssistant(await source.api.assistant.send({
          path: { incident_id: id },
          body: {
            input_text: q,
            proposal_id: run?.apiId ?? null,
            item_code: item ?? null,
          },
          signal,
        }), id);
        if (!alive(epoch) || id !== state.incId || ticket !== chatTicket || selected !== selection || pendingIncident) return;
        if (response.type === 'ANSWER') host.answer(response.message);
        else if (response.type === 'UNSUPPORTED')
          host.message('bot', response.reason);
        else host.preview(response, () => confirm(response, id, selected));
      } catch (cause) {
        if (alive(epoch)) errors.set(`${id}.messages.send`, cause);
        if (alive(epoch) && id === state.incId && ticket === chatTicket && selected === selection)
          host.message('bot', `질의응답 실패${cause instanceof Error && 'status' in cause ? ` (HTTP ${cause.status})` : ''}: ${error(cause)}`);
      } finally {
        if (alive(epoch) && ticket === chatTicket) {
          chatting = false;
          host.chatBusy(false);
        }
      }
    });
  }
  async function saveReport() {
    if (saving || pendingIncident) return;
    const rp = state.rep,
      existing = rp.editingId ? raw.get(rp.editingId) : undefined;
    if (rp.drawMode) {
      host.notice('그리기를 끝낸 뒤 저장하십시오.');
      return;
    }
    saving = true;
    (document.getElementById('rep-save') as HTMLButtonElement).disabled = true;
    try {
      await task(async (signal, epoch) => {
        let id: string;
        if (existing) {
          if (!rp.ring) {
            host.notice(
              `${NULL_TEXT} 발화 정보 수정 API는 현재 명세에 없습니다. 실측 화선만 제출할 수 있습니다.`,
            );
            return;
          }
          const localInputDate = (s: string | null) =>
            s
              ? new Date(
                  Date.parse(s) - new Date(s).getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16)
              : '';
          const displayed = incidentDetailsView(existing, []);
          const changed =
            rp.intake.length > 0 ||
            input('rep-start') !== localInputDate(existing.started_at) ||
            input('rep-report') !== localInputDate(existing.reported_at) ||
            input('rep-name') !== existing.name ||
            input('rep-addr') !== existing.address ||
            input('rep-text') !== displayed.report_text ||
            input('rep-corg') !== displayed.caller.org ||
            input('rep-cname') !== displayed.caller.name ||
            input('rep-cphone') !== displayed.caller.phone ||
            Number(input('rep-lng')) !==
              existing.ignition_point.coordinates[0] ||
            Number(input('rep-lat')) !== existing.ignition_point.coordinates[1];
          if (changed) {
            host.notice(
              `${NULL_TEXT} 발화 정보 수정은 명세에 없어 저장하지 않았습니다. 원래 값을 불러온 뒤 화선만 수정해주세요.`,
            );
            return;
          }
          const body = {
            geometry: submissionGeometry(rp.ring),
            observed_at: new Date().toISOString(),
          };
          if (rp.perimMode === 'correct')
            await source.api.perimeters.correct({
              path: {
                incident_id: existing.id,
                perimeter_id: existing.current_perimeter_id,
              },
              body,
              idempotencyKey: createIdempotencyKey(),
              signal,
            });
          else
            await source.api.perimeters.report({
              path: { incident_id: existing.id },
              body: {
                ...body,
                expected_perimeter_id: existing.current_perimeter_id,
              },
              idempotencyKey: createIdempotencyKey(),
              signal,
            });
          id = existing.id;
        } else {
          if (rp.intake.length)
            throw new Error(
              '기관별 접수 기록은 현재 명세에 없습니다. 접수 기록 입력을 지운 뒤 보고해주세요.',
            );
          const lng = Number(input('rep-lng')),
            lat = Number(input('rep-lat'));
          if (
            !input('rep-lng') ||
            !input('rep-lat') ||
            !Number.isFinite(lng) ||
            !Number.isFinite(lat) ||
            lng < 124 ||
            lng > 132 ||
            lat < 33 ||
            lat > 39
          )
            throw new Error('국내 발화 위치 좌표를 입력해주세요.');
          if (
            !input('rep-addr') ||
            !input('rep-report') ||
            !input('rep-cname') ||
            !input('rep-cphone')
          )
            throw new Error(
              '발생 장소·접수 일시·신고자 성명·연락처가 필요합니다.',
            );
          const response = await source.api.incidents.report({
            body: {
              ignition_point: { type: 'Point', coordinates: [lng, lat] },
              address: input('rep-addr'),
              reported_at: new Date(input('rep-report')).toISOString(),
              started_at: input('rep-start')
                ? new Date(input('rep-start')).toISOString()
                : null,
              report_text: input('rep-text') || null,
              reporter_org: input('rep-corg') || null,
              reporter_name: input('rep-cname'),
              reporter_phone: input('rep-cphone'),
              ...(rp.ring
                ? {
                    initial_perimeter: {
                      geometry: submissionGeometry(rp.ring),
                      observed_at: new Date().toISOString(),
                    },
                  }
                : {}),
            },
            idempotencyKey: createIdempotencyKey(),
            signal,
          });
          incidentSummaries.set(response.id, response);
          id = response.id;
        }
        if (!alive(epoch)) return;
        const data = await source.loadIncident(
          id,
          roleToApi(state.role!),
          signal,
        );
        if (!alive(epoch)) return;
        install(data);
        state.incId = id;
        host.selected(id);
        host.reportForm(id);
        host.notice(
          '서버 응답으로 보고 내용을 갱신했습니다. 산불명은 서버가 생성하며 접수 기록은 전송하지 않습니다.',
        );
      });
    } finally {
      saving = false;
      (document.getElementById('rep-save') as HTMLButtonElement).disabled =
        !!raw.get(state.rep.editingId ?? '')?.ended_at;
    }
  }
  function bindAdmin() {
    if (state.role !== 'admin') return;
    const pending = (label: string) => {
      host.notice(`${NULL_TEXT} ${label}: 검토 중인 API 명세 대기 중`);
      host.admin();
    };
    for (const selector of [
      '[data-role]',
      '[data-revoke]',
      '[data-reissue]',
      '[data-unlock]',
      '[data-del]',
      '[data-rsave]',
      '[data-rdel]',
      '#rs-add',
    ])
      for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        if (el.tagName === 'SELECT')
          el.onchange = () => pending('계정 정보·권한 변경');
        else el.onclick = () => pending('계정·자원 관리');
      }
    const add = document.getElementById('ac-add');
    if (add)
      add.onclick = () => {
        if (issuing) return;
        issuing = true;
        void task(async (signal, epoch) => {
          const role = roleToApi(input('ac-role'));
          if (
            !['COMMANDER', 'VIEWER', 'REPORTER'].includes(role) ||
            !input('ac-name') ||
            !input('ac-org')
          )
            throw new Error('이름·소속·권한을 입력해주세요.');
          if (!options.accountAdminAreaId) {
            host.notice(
              `${NULL_TEXT} 계정 발급은 확정됐지만 관할 admin_area_id 제공 방식 확인 대기 중입니다.`,
            );
            return;
          }
          const prefix = { COMMANDER: 'cmd', VIEWER: 'view', REPORTER: 'rep' }[
            role as 'COMMANDER'
          ];
          let n = 1;
          while (
            S.accounts.some(
              (a) => a.id === `${prefix}${String(n).padStart(2, '0')}`,
            )
          )
            n++;
          const result = await source.api.users.create({
            body: {
              login_id: `${prefix}${String(n).padStart(2, '0')}`,
              name: input('ac-name'),
              organization: input('ac-org'),
              role,
              admin_area_id: options.accountAdminAreaId,
            },
            signal,
          });
          const users = await source.users(signal);
          if (!alive(epoch)) return;
          S.accounts = users.map(accountView);
          host.admin();
          host.issued(accountView(result.user), result.temporary_password);
        }).finally(() => {
          issuing = false;
        });
      };
  }
  return {
    login,
    logout,
    expire,
    select,
    retryIncidents,
    predict,
    end,
    viewVersion,
    compare,
    sendChat,
    saveReport,
    bindAdmin,
    counts: () => counts,
    incidentRows: () =>
      [...incidentSummaries.values()].map((row) =>
        incidentListRow(row, raw.get(row.id)),
      ),
    incidentListStatus: () => listStatus,
    incidentListError: () => (listError ? error(listError) : ''),
    pendingIncident: () => pendingIncident,
    weather: () => currentWeather,
    predictionOperation: () => predictionOperations.get(state.incId),
    predictionFailure: () => errors.get(`${state.incId}.predict`),
    proposalStale: () => {
      const data = snapshot.get(state.incId);
      return !!data && (data.incident.proposal_stale || (data.proposal.status === 'ready' && !!data.proposal.data && data.proposal.data.prediction_id !== (data.prediction.status === 'ready' ? data.prediction.data.id : data.incident.latest_prediction_id)));
    },
    predictionAt: (hour: number) => {
      const data = snapshot.get(state.incId);
      if (data?.prediction.status !== 'ready') return null;
      if (hour === 0) return data.prediction.data.base_at;
      return (data.slices.status === 'ready' ? data.slices.data.features.find(f => f.properties.hour === hour)?.properties.at : null) ?? data.prediction.data.slices.find(s => s.hour === hour)?.at ?? null;
    },
    predictionWeather: () => {
      const data = snapshot.get(state.incId)?.weather;
      return data?.status === 'ready' ? data.data : null;
    },
    predictionWeatherFailure: () => {
      const data = snapshot.get(state.incId)?.weather;
      return data?.status === 'error' ? data.error : null;
    },
    predictionId: () => {
      const data = snapshot.get(state.incId)?.prediction;
      return data?.status === 'ready' ? data.data.id : null;
    },
    riskData: () => {
      const data = snapshot.get(state.incId)?.risk;
      return data?.status === 'ready' ? data.data : null;
    },
    errors,
    current: (id = state.incId) => raw.get(id),
    empty: () => !raw.has(state.incId),
    ring: (id: string): Ring => {
      const incident = S.incidents.find((i) => i.id === id);
      return (
        incident?.perimeters.filter((p) => p.status === '유효').at(-1)?.ring ??
        missingRing
      );
    },
    dispose() {
      disposed = true;
      reset();
      source.client.clearSession();
    },
  };
}
export type ScreenBridge = ReturnType<typeof createScreenBridge>;
