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
import { waitForOperation } from '../operations.ts';
import { remote } from '../data-source.ts';
import {
  NULL_TEXT,
  UI_TO_API_ITEM,
  accountView,
  displayRing,
  emptyIncident,
  incidentView,
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
  const requests = new Set<AbortController>();
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
  ): Promise<T | undefined> {
    const controller = new AbortController(),
      epoch = generation;
    requests.add(controller);
    try {
      return await fn(controller.signal, epoch);
    } catch (cause) {
      if (!controller.signal.aborted && alive(epoch))
        host.notice(`${NULL_TEXT} ${error(cause)}`);
      return undefined;
    } finally {
      requests.delete(controller);
    }
  }
  function reset() {
    generation++;
    selection++;
    for (const c of requests) c.abort();
    requests.clear();
    raw.clear();
    snapshot.clear();
    versions.clear();
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
    const view = incidentView(
      data.incident,
      data.perimeters.status === 'ready' ? data.perimeters.data : [],
    );
    if (old < 0) S.incidents.push(view);
    else S.incidents[old] = view;
    const st = IS(view.id);
    st.stale = data.incident.needs_reprediction;
    st.predicted = data.prediction.status === 'ready';
    st.predictFailed = data.prediction.status === 'error';
    st.proposalFailed = data.proposal.status === 'error';
    st.latestRisk = riskView(
      data.risk.status === 'ready' ? data.risk.data : null,
      S,
    );
    st.riskStatus = 'ready';
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
    if (!alive(epoch) || state.incId !== incidentId) return;
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
    if (messages?.status === 'ready') {
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
  async function select(id: string, fly = false) {
    const ticket = ++selection;
    let applied = false;
    await task(async (signal, epoch) => {
      const data = await source.loadIncident(
        id,
        roleToApi(state.role!),
        signal,
      );
      if (!alive(epoch) || ticket !== selection || state.incId !== id) return;
      install(data);
      currentWeather = data.now.status === 'ready' ? data.now.data : null;
      if (data.prediction.status === 'ready')
        host.baseAt(data.prediction.data.base_at);
      await Promise.all([
        resources(id, signal, epoch),
        histories(id, signal, epoch),
      ]);
      if (!alive(epoch) || ticket !== selection || state.incId !== id) return;
      applied = true;
      host.selected(id, fly);
      if (state.role === 'reporter') host.reportForm(id);
    });
    if (!applied && !disposed && state.incId === id) host.refresh();
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
          const list = await source.listIncidents(signal);
          if (!alive(epoch)) return;
          S.incidents = list.map((row) =>
            incidentView(
              {
                id: row.id,
                name: row.name,
                address: NULL_TEXT,
                status: row.status,
                ignition_point: { type: 'Point', coordinates: origin },
                started_at: null,
                reported_at: row.reported_at,
                report_text: null,
                reporter_org: null,
                reporter_name: null,
                reporter_phone: null,
                reported_by: NULL_TEXT,
                admin_area_id: row.admin_area_id,
                current_stage: row.current_stage,
                situation: {},
                created_at: row.reported_at,
                ended_at: null,
                ended_by: null,
                current_perimeter_id: '',
                current_perimeter_version: row.current_perimeter_version,
                latest_prediction_id: null,
                latest_proposal_id: null,
                needs_reprediction: row.needs_reprediction,
                proposal_stale: row.proposal_stale,
                situation_revision: '',
                running_operation_id: null,
              },
              [],
            ),
          );
          state.inc = {};
          state.events = [];
          state.incId =
            list.find((i) => i.status === 'IN_PROGRESS')?.id ??
            list[0]?.id ??
            '__NULL__';
          if (list.length) {
            const data = await source.loadIncident(
              state.incId,
              user.role,
              signal,
            );
            if (!alive(epoch)) return;
            install(data);
            currentWeather = data.now.status === 'ready' ? data.now.data : null;
            if (data.prediction.status === 'ready')
              host.baseAt(data.prediction.data.base_at);
          } else S.incidents = [emptyIncident(origin)];
          host.enter(accountView(user));
          if (!list.length && user.role === 'REPORTER') host.reportForm(null);
          if (list.length) {
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
      incident.status === 'ENDED'
    ) {
      host.notice(`${NULL_TEXT} 예측할 산불 정보가 없습니다.`);
      return;
    }
    const id = incident.id;
    host.busy(true);
    await task(async (signal, epoch) => {
      try {
        const operation = incident.running_operation_id
          ? await waitForOperation(
              source.client,
              { incident_id: id, operation_id: incident.running_operation_id },
              { signal },
            )
          : await source.predict(incident, signal);
        if (operation.status === 'FAILED')
          throw new Error(
            operation.error?.message ?? '예측 작업이 실패했습니다.',
          );
        if (!alive(epoch)) return;
        await select(id);
        if (alive(epoch) && state.incId === id) host.predictionReady();
      } catch (cause) {
        if (alive(epoch)) {
          IS(id).predictFailed = true;
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
    if (!incident) return;
    await task(async (signal, epoch) => {
      await source.api.incidents.end({
        path: { incident_id: incident.id },
        body: { expected_perimeter_id: incident.current_perimeter_id },
        signal,
      });
      if (alive(epoch)) {
        await select(incident.id);
        host.notice('산불을 종료 상태로 바꿨습니다.');
      }
    });
  }
  async function viewVersion(version: string) {
    const run = IS().runs.find((r) => r.id === version);
    if (!run?.apiId) return;
    const id = state.incId;
    await task(async (signal, epoch) => {
      const proposal = await source.api.proposals.get({
        path: { incident_id: id, proposal_id: run.apiId! },
        signal,
      });
      const prediction = await remote(() =>
        source.api.predictions.get({
          path: { incident_id: id, prediction_id: proposal.prediction_id },
          signal,
        }),
      );
      if (alive(epoch) && state.incId === id) {
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
      }
    });
  }
  async function compare(run: ProposalRun) {
    if (!run.apiId) return;
    const id = state.incId;
    await task(async (signal, epoch) => {
      const diff = await source.api.proposals.diff({
        path: { incident_id: id, proposal_id: run.apiId! },
        signal,
      });
      const previous = versions
        .get(id)
        ?.find((v) => v.version === diff.previous_version);
      if (!previous) {
        host.notice(`${NULL_TEXT} 비교할 이전 버전이 없습니다.`);
        return;
      }
      const [before, after] = await Promise.all([
        source.api.proposals.get({
          path: { incident_id: id, proposal_id: previous.id },
          signal,
        }),
        source.api.proposals.get({
          path: { incident_id: id, proposal_id: run.apiId! },
          signal,
        }),
      ]);
      if (!alive(epoch) || state.incId !== id) return;
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
  async function regenerate(
    incident: C.Incident,
    revision: string,
    signal: AbortSignal,
  ) {
    if (!incident.latest_prediction_id)
      throw new Error('제안 재생성에 필요한 예측 ID가 없습니다.');
    const operation = await source.api.proposals.regenerate({
      path: { incident_id: incident.id },
      body: {
        expected_prediction_id: incident.latest_prediction_id,
        situation_revision: revision,
      },
      idempotencyKey: createIdempotencyKey(),
      signal,
    });
    return waitForOperation(
      source.client,
      { incident_id: incident.id, operation_id: operation.id },
      { signal },
    );
  }
  async function confirm(preview: C.CorrectionPreview, id: string) {
    if (confirming.has(preview.confirmation_token)) return;
    confirming.add(preview.confirmation_token);
    try {
      await task(async (signal, epoch) => {
        const saved = await source.api.corrections.confirm({
          path: { incident_id: id },
          body: { confirmation_token: preview.confirmation_token },
          idempotencyKey: createIdempotencyKey(),
          signal,
        });
        if (!alive(epoch)) return;
        host.message('sys', '상황 정정을 저장했습니다.');
        try {
          const operation = saved.proposal_operation
            ? await waitForOperation(
                source.client,
                { incident_id: id, operation_id: saved.proposal_operation.id },
                { signal },
              )
            : null;
          if (operation?.status === 'FAILED')
            throw new Error(operation.error?.message ?? '제안 재생성 실패');
        } catch (cause) {
          if (!signal.aborted && alive(epoch))
            host.modal(
              '제안 재생성 실패',
              escaped(`정정은 저장됐습니다. ${error(cause)}`),
              [
                { label: '닫기' },
                {
                  label: '재생성 재시도',
                  cls: 'primary',
                  onClick: () =>
                    void task(async (retrySignal, retryEpoch) => {
                      const incident = await source.api.incidents.get({
                        path: { incident_id: id },
                        signal: retrySignal,
                      });
                      const result = await regenerate(
                        incident,
                        saved.situation_revision,
                        retrySignal,
                      );
                      if (result.status === 'FAILED')
                        throw new Error(
                          result.error?.message ?? '제안 재생성 실패',
                        );
                      if (alive(retryEpoch)) await select(id);
                    }),
                },
              ],
            );
        }
        if (alive(epoch)) await select(id);
      });
    } finally {
      confirming.delete(preview.confirmation_token);
    }
  }
  async function sendChat() {
    const q = input('chat-input');
    if (chatting || !q) return;
    if (!raw.has(state.incId) || state.role !== 'commander') {
      host.notice(`${NULL_TEXT} 질문할 산불이 없습니다.`);
      return;
    }
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
        const response = await source.api.assistant.send({
          path: { incident_id: id },
          body: {
            input_text: q,
            proposal_id: run?.apiId ?? null,
            item_code: item ?? null,
          },
          signal,
        });
        if (!alive(epoch) || id !== state.incId) return;
        if (response.type === 'ANSWER') host.answer(response.message);
        else if (response.type === 'UNSUPPORTED')
          host.message('bot', `${NULL_TEXT} ${response.reason}`);
        else host.preview(response, () => void confirm(response, id));
      } finally {
        if (alive(epoch)) {
          chatting = false;
          host.chatBusy(false);
        }
      }
    });
  }
  async function saveReport() {
    if (saving) return;
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
          const changed =
            rp.intake.length > 0 ||
            input('rep-start') !== localInputDate(existing.started_at) ||
            input('rep-report') !== localInputDate(existing.reported_at) ||
            input('rep-name') !== existing.name ||
            input('rep-addr') !== existing.address ||
            input('rep-text') !== text(existing.report_text) ||
            input('rep-corg') !== text(existing.reporter_org) ||
            input('rep-cname') !== text(existing.reporter_name) ||
            input('rep-cphone') !== text(existing.reporter_phone) ||
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
    predict,
    end,
    viewVersion,
    compare,
    sendChat,
    saveReport,
    bindAdmin,
    counts: () => counts,
    weather: () => currentWeather,
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
