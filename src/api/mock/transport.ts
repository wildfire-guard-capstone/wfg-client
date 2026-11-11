import type * as C from '../contracts.ts';
import { API_IDS, endpoints } from '../endpoints.ts';
import type { ApiId, Endpoint, ResponseMap } from '../endpoints.ts';
import type { Fetcher } from '../client.ts';
import { isRecord } from '../errors.ts';
import { delay, abortReason } from '../async.ts';
import {
  createFixtures,
  MOCK_ACCOUNTS,
  MOCK_PASSWORD,
  MOCK_TIME,
  mockPolygon,
  page,
} from './fixtures.ts';

export type MockScenario =
  | 'success'
  | 'empty'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'validation-error'
  | 'conflict'
  | 'unavailable'
  | 'server-error'
  | 'network-error'
  | 'timeout'
  | 'operation-failed'
  | 'assistant-answer'
  | 'assistant-preview'
  | 'assistant-unsupported';
export interface MockOptions {
  scenario?: MockScenario;
  scenarios?: Partial<Record<ApiId, MockScenario>>;
  latencyMs?: number;
  overrides?: Partial<ResponseMap>;
  fixtures?: Partial<ResponseMap>;
  seed?: {
    incidents: C.Incident[];
    perimeters: C.Perimeter[];
    accounts: { user: C.User; password: string }[];
  };
  predictionSlices?: (
    incident: C.Incident,
    prediction: C.Prediction,
    perimeter: C.Perimeter,
  ) => C.PredictionSlices;
}
interface Route {
  id: ApiId;
  endpoint: Endpoint;
  regex: RegExp;
  keys: string[];
}
const routes: Route[] = API_IDS.map((id) => {
  const endpoint: Endpoint = endpoints[id];
  const keys: string[] = [];
  const pattern = endpoint.path.replace(/\{(\w+)\}/g, (_, key: string) => {
    keys.push(key);
    return '([^/]+)';
  });
  return { id, endpoint, regex: new RegExp(`^/api/v1${pattern}$`), keys };
}).sort((a, b) => a.keys.length - b.keys.length);

class MockFailure extends Error {
  status: number;
  code: string;
  fields: C.FieldError[];
  constructor(
    status: number,
    code: string,
    message: string,
    fields: C.FieldError[] = [],
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}
function fail(
  status: number,
  code: string,
  message: string,
  fields?: C.FieldError[],
): never {
  throw new MockFailure(status, code, message, fields);
}
function invalid(field: string, reason: string): never {
  return fail(422, 'VALIDATION_ERROR', '입력값을 확인해주세요.', [
    { field, reason },
  ]);
}
const requiredString = (body: Record<string, unknown>, key: string): string => {
  const value = body[key];
  return typeof value === 'string' && value.trim()
    ? value
    : invalid(key, '비어 있지 않은 문자열이 필요합니다.');
};
function dateTime(body: Record<string, unknown>, key: string): string {
  const value = requiredString(body, key);
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
    ? value
    : invalid(key, '타임존이 포함된 ISO8601 시각이 필요합니다.');
}
function geometry(value: unknown): C.InitialPerimeter['geometry'] {
  if (
    !isRecord(value) ||
    !['Polygon', 'MultiPolygon'].includes(String(value.type)) ||
    !Array.isArray(value.coordinates)
  )
    invalid('geometry', 'Polygon 또는 MultiPolygon이 필요합니다.');
  const result = value as unknown as C.InitialPerimeter['geometry'];
  return result.type === 'Polygon'
    ? { type: 'MultiPolygon', coordinates: [result.coordinates] }
    : result;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function paginate<T>(
  items: T[],
  query: URLSearchParams,
  maximum = 100,
): C.Page<T> {
  const limit = Number(query.get('limit') ?? (maximum === 1000 ? 500 : 20));
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum)
    invalid('limit', `1~${maximum}의 정수가 필요합니다.`);
  const cursor = query.get('cursor');
  if (cursor !== null && !/^mock:\d+$/.test(cursor))
    invalid('cursor', '목업이 반환한 커서를 사용해주세요.');
  const start = cursor === null ? 0 : Number(cursor.slice(5));
  const selected = items.slice(start, start + limit);
  const more = start + limit < items.length;
  return {
    items: selected,
    next_cursor: more ? `mock:${start + limit}` : null,
    has_more: more,
  };
}

/** Isolated fetch-compatible mock. It never patches global fetch and never contacts a server. */
export function createMockFetch(options: MockOptions = {}): Fetcher {
  const fixture = { ...createFixtures(), ...options.fixtures };
  const latency = options.latencyMs ?? 100;
  if (!Number.isFinite(latency) || latency < 0)
    throw new Error('목업 latencyMs는 0 이상이어야 합니다.');
  const incidents = new Map<string, C.Incident>([
    ['100', structuredClone(fixture['INC-03'])],
  ]);
  if (options.seed) {
    incidents.clear();
    for (const i of options.seed.incidents)
      incidents.set(i.id, structuredClone(i));
  }
  const perimeters = new Map<string, C.Perimeter[]>([
    ['100', structuredClone(fixture['PER-01'].items)],
  ]);
  if (options.seed) {
    perimeters.clear();
    for (const i of options.seed.incidents)
      perimeters.set(
        i.id,
        structuredClone(
          options.seed.perimeters.filter((p) => p.incident_id === i.id),
        ),
      );
  }
  const predictions = new Map<string, C.Prediction>([
    ['41', structuredClone(fixture['PRED-02'])],
  ]);
  const proposals = new Map<string, C.Proposal>([
    [
      '70',
      { ...structuredClone(fixture['PROP-03']), id: '70', version: 'v1.0' },
    ],
    ['71', structuredClone(fixture['PROP-03'])],
  ]);
  if (options.seed) {
    predictions.clear();
    proposals.clear();
  }
  const accounts = new Map(
    MOCK_ACCOUNTS.map((u) => [
      u.login_id,
      { user: structuredClone(u), password: MOCK_PASSWORD },
    ]),
  );
  if (options.seed) {
    accounts.clear();
    for (const account of options.seed.accounts)
      accounts.set(account.user.login_id, structuredClone(account));
  }
  const tokens = new Map<string, C.User>();
  const users = structuredClone(fixture['USR-01'].items);
  const messages = options.seed ? [] : structuredClone(fixture['AI-02'].items);
  const corrections: C.Correction[] = [];
  const previews = new Map<
    string,
    { preview: C.CorrectionPreview; incident: string; user: string }
  >();
  const reports = new Map<string, { body: string; data: C.Incident }>();
  interface Job {
    operation: C.Operation;
    incident: string;
    polls: number;
    perimeter: string;
    revision: string;
    fail: boolean;
  }
  const jobs = new Map<string, Job>();
  let sequence = 1000;
  let requestSequence = 0;
  const next = () => String(++sequence);
  const incidentOf = (id: string): C.Incident =>
    incidents.get(id) ?? fail(404, 'NOT_FOUND', '목업 산불을 찾지 못했습니다.');
  const openIncident = (id: string) => {
    const incident = incidentOf(id);
    if (incident.status === 'ENDED')
      fail(409, 'INCIDENT_ENDED', '종료된 산불입니다.');
    return incident;
  };
  const currentPerimeter = (incident: C.Incident) =>
    perimeters
      .get(incident.id)
      ?.find((p) => p.id === incident.current_perimeter_id) ??
    fail(404, 'NOT_FOUND', '현재 화선이 없습니다.');
  const startJob = (
    incident: C.Incident,
    kind: C.Operation['kind'],
  ): C.Operation => {
    if (incident.running_operation_id)
      fail(409, 'PREDICTION_RUNNING', '진행 중인 작업이 있습니다.');
    const operation: C.Operation = {
      id: `mock-operation-${next()}`,
      kind,
      status: 'QUEUED',
      stage: null,
      result: null,
      error: null,
    };
    jobs.set(operation.id, {
      operation,
      incident: incident.id,
      polls: 0,
      perimeter: incident.current_perimeter_id,
      revision: incident.situation_revision,
      fail:
        (options.scenarios?.['PRED-05'] ?? options.scenario) ===
        'operation-failed',
    });
    incident.running_operation_id = operation.id;
    return operation;
  };
  const pollJob = (id: string, incident: C.Incident): C.Operation => {
    const job = jobs.get(id);
    if (!job || job.incident !== incident.id)
      return fail(404, 'NOT_FOUND', '목업 작업을 찾지 못했습니다.');
    if (
      job.operation.status === 'SUCCEEDED' ||
      job.operation.status === 'FAILED'
    )
      return job.operation;
    job.polls++;
    if (job.polls < 3) {
      job.operation.status = 'RUNNING';
      job.operation.stage =
        job.polls === 1 && job.operation.kind === 'PREDICTION'
          ? 'SPREAD'
          : 'PROPOSAL_GENERATION';
      return job.operation;
    }
    const code =
      incident.status === 'ENDED'
        ? 'INCIDENT_ENDED'
        : job.perimeter !== incident.current_perimeter_id
          ? 'STALE_PERIMETER'
          : job.revision !== incident.situation_revision
            ? 'STALE_SITUATION'
            : job.fail
              ? 'PROPOSAL_FAILED'
              : null;
    incident.running_operation_id = null;
    if (code) {
      job.operation.status = 'FAILED';
      job.operation.error = {
        code,
        message: '목업 작업 실패 예시입니다. 이전 성공 결과는 유지됩니다.',
      };
      return job.operation;
    }
    let predictionId = incident.latest_prediction_id;
    if (job.operation.kind === 'PREDICTION') {
      const perimeter = currentPerimeter(incident);
      const prediction: C.Prediction = {
        ...structuredClone(fixture['PRED-02']),
        id: next(),
        incident_id: incident.id,
        perimeter_id: perimeter.id,
        perimeter_version: perimeter.version_no,
        base_at: perimeter.observed_at,
        slices: fixture['PRED-02'].slices.map((s) => ({
          ...s,
          at: new Date(
            Date.parse(perimeter.observed_at) + s.hour * 3600000,
          ).toISOString(),
        })),
      };
      if (options.predictionSlices)
        prediction.slices = options
          .predictionSlices(incident, prediction, perimeter)
          .features.map((f) => ({
            hour: f.properties.hour,
            at: f.properties.at,
            area_ha: f.properties.area_ha,
          }));
      predictions.set(prediction.id, prediction);
      predictionId = prediction.id;
      incident.latest_prediction_id = prediction.id;
      incident.needs_reprediction = false;
    }
    if (!predictionId)
      return fail(409, 'PREDICTION_REQUIRED', '성공 예측이 필요합니다.');
    const proposal: C.Proposal = {
      ...structuredClone(fixture['PROP-03']),
      id: next(),
      version: `v${incident.current_perimeter_version}.${sequence}`,
      prediction_id: predictionId,
      base_at: predictions.get(predictionId)!.base_at,
      trigger:
        job.operation.kind === 'PREDICTION' ? 'PREDICTION' : 'CORRECTION',
    };
    proposals.set(proposal.id, proposal);
    incident.latest_proposal_id = proposal.id;
    incident.proposal_stale = false;
    job.operation.status = 'SUCCEEDED';
    job.operation.stage = 'COMMIT';
    job.operation.result = {
      prediction_id: predictionId,
      proposal_id: proposal.id,
    };
    return job.operation;
  };

  return async (input, init) => {
    const request =
      input instanceof Request
        ? new Request(input, init)
        : new Request(new URL(String(input), 'http://mock.invalid'), init);
    const url = new URL(request.url);
    const path = url.pathname.slice(url.pathname.indexOf('/api/v1'));
    const route = routes.find(
      (r) => r.endpoint.method === request.method && r.regex.test(path),
    );
    const requestId = `mock-request-${++requestSequence}`;
    const reply = (
      data: unknown,
      status = route?.endpoint.status ?? 200,
    ): Response =>
      status === 204
        ? new Response(null, { status, headers: { 'X-Request-ID': requestId } })
        : Response.json(
            { data, meta: { request_id: requestId } },
            { status, headers: { 'X-Request-ID': requestId } },
          );
    const error = (
      status: number,
      code: string,
      message: string,
      fields: C.FieldError[] = [],
    ) =>
      Response.json(
        { error: { code, message, fields }, meta: { request_id: requestId } },
        { status, headers: { 'X-Request-ID': requestId } },
      );
    if (!route)
      return error(
        404,
        'NOT_FOUND',
        '지원하는 34개 명세에 없는 목업 경로입니다.',
      );
    const scenario =
      options.scenarios?.[route.id] ?? options.scenario ?? 'success';
    await delay(latency, request.signal);
    if (scenario === 'network-error')
      throw new TypeError('목업 네트워크 연결 실패');
    if (scenario === 'timeout')
      return new Promise<Response>((_, reject) => {
        if (request.signal.aborted) {
          reject(abortReason(request.signal));
          return;
        }
        request.signal.addEventListener(
          'abort',
          () => reject(abortReason(request.signal)),
          { once: true },
        );
      });
    const failures: Partial<Record<MockScenario, [number, string, string]>> = {
      unauthorized: [401, 'TOKEN_EXPIRED', '목업 토큰 만료 예시입니다.'],
      forbidden: [403, 'FORBIDDEN', '목업 접근 제한 예시입니다.'],
      'not-found': [404, 'NOT_FOUND', '목업 대상 없음 예시입니다.'],
      'validation-error': [
        422,
        'VALIDATION_ERROR',
        '목업 입력 오류 예시입니다.',
      ],
      conflict: [
        409,
        route.id === 'PRED-01' ? 'PREDICTION_RUNNING' : 'STALE_PERIMETER',
        '목업 충돌 예시입니다.',
      ],
      unavailable: [
        503,
        route.id.startsWith('AI-')
          ? 'AI_UNAVAILABLE'
          : ['WTH-01', 'PRED-01', 'PRED-04'].includes(route.id)
            ? 'WEATHER_UNAVAILABLE'
            : 'SERVICE_UNAVAILABLE',
        '목업 외부 서비스 실패 예시입니다.',
      ],
      'server-error': [500, 'INTERNAL_ERROR', '목업 서버 오류 예시입니다.'],
    };
    const forced = failures[scenario];
    if (forced)
      return error(
        ...forced,
        scenario === 'validation-error'
          ? [{ field: 'body', reason: '목업에서 지정한 필드 오류' }]
          : [],
      );
    try {
      const match = route.regex.exec(path)!;
      const params: Record<string, string> = {};
      route.keys.forEach((key, i) => {
        params[key] = decodeURIComponent(match[i + 1]!);
      });
      const authorization = request.headers.get('Authorization') ?? '';
      const user = tokens.get(authorization.replace(/^Bearer /, ''));
      if (route.id !== 'AUTH-01') {
        if (!user)
          fail(401, 'INVALID_TOKEN', '목업 계정으로 먼저 로그인해주세요.');
        if (!route.endpoint.roles.includes(user.role))
          fail(403, 'FORBIDDEN', '해당 역할로 호출할 수 없는 API입니다.');
      }
      let body: Record<string, unknown> = {};
      if (route.endpoint.body) {
        let parsed: unknown;
        try {
          parsed = await request.json();
        } catch {
          return error(400, 'INVALID_JSON', 'JSON 요청 본문이 필요합니다.');
        }
        if (!isRecord(parsed)) invalid('body', 'JSON 객체가 필요합니다.');
        body = parsed;
      }
      const allowedKeys: Partial<Record<ApiId, string[]>> = {
        'AUTH-01': ['login_id', 'password', 'role'],
        'INC-02': [
          'ignition_point',
          'address',
          'reported_at',
          'reporter_name',
          'reporter_phone',
          'started_at',
          'report_text',
          'reporter_org',
          'initial_perimeter',
        ],
        'INC-04': ['expected_perimeter_id'],
        'PER-02': ['geometry', 'observed_at', 'expected_perimeter_id'],
        'PER-03': ['geometry', 'observed_at'],
        'PRED-01': ['expected_perimeter_id'],
        'PROP-05': ['expected_prediction_id', 'situation_revision'],
        'AI-01': ['input_text', 'proposal_id', 'item_code'],
        'COR-01': ['confirmation_token'],
        'USR-02': ['login_id', 'name', 'organization', 'role', 'admin_area_id'],
      };
      for (const key of Object.keys(body))
        if (!allowedKeys[route.id]?.includes(key))
          invalid(key, '명세에 없는 요청 필드입니다.');
      if (
        route.endpoint.idempotent &&
        !request.headers.get('Idempotency-Key')?.trim()
      )
        invalid('Idempotency-Key', '중복 요청 구분 키가 필요합니다.');
      const incident = params.incident_id
        ? incidentOf(params.incident_id)
        : undefined;
      const query = url.searchParams;
      if (
        ['RES-01', 'RES-02', 'BASE-01', 'LOG-01'].includes(route.id) &&
        user?.role !== 'ADMIN' &&
        !query.get('incident_id')
      )
        invalid('incident_id', '이 역할에는 산불 문맥이 필요합니다.');
      if (query.has('incident_id')) incidentOf(query.get('incident_id')!);
      const prediction = params.prediction_id
        ? predictions.get(params.prediction_id)
        : undefined;
      if (
        params.prediction_id &&
        (!prediction || prediction.incident_id !== incident?.id)
      )
        fail(404, 'NOT_FOUND', '산불에 속한 예측이 없습니다.');
      const proposal = params.proposal_id
        ? proposals.get(params.proposal_id)
        : undefined;
      if (
        params.proposal_id &&
        (!proposal ||
          predictions.get(proposal.prediction_id)?.incident_id !== incident?.id)
      )
        fail(404, 'NOT_FOUND', '산불에 속한 제안서가 없습니다.');
      if (
        Object.prototype.hasOwnProperty.call(options.overrides ?? {}, route.id)
      )
        return reply(structuredClone(options.overrides?.[route.id]));
      if (scenario === 'empty') {
        const empty: Partial<ResponseMap> = {
          'INC-01': page([]),
          'PER-01': page([]),
          'MAP-01': [],
          'MAP-04': page([]),
          'MAP-02': {
            type: 'FeatureCollection',
            features: [],
            next_cursor: null,
            has_more: false,
          },
          'PRED-03': { type: 'FeatureCollection', features: [] },
          'RISK-01': null,
          'RES-01': page([]),
          'RES-02': {
            bases: [],
            incident_deployed: null,
            incident_linked: null,
          },
          'BASE-01': page([]),
          'PROP-01': page([]),
          'PROP-02': null,
          'AI-02': page([]),
          'COR-02': page([]),
          'LOG-01': page([]),
          'USR-01': page([]),
          'WTH-01': {
            ...fixture['WTH-01'],
            wind_dir: null,
            wind_dir_name: null,
            wind_speed: null,
            temp: null,
            humidity: null,
            precip: null,
            stale: true,
          },
        };
        if (Object.prototype.hasOwnProperty.call(empty, route.id))
          return reply(empty[route.id]);
        if (['INC-03', 'PRED-02', 'PROP-03', 'PROP-04'].includes(route.id))
          fail(404, 'NOT_FOUND', '빈 화면 점검용 대상 없음 응답입니다.');
      }
      let data: unknown;
      switch (route.id) {
        case 'AUTH-01': {
          const login = requiredString(body, 'login_id').toLowerCase();
          const password = requiredString(body, 'password');
          const role = requiredString(body, 'role');
          const account = accounts.get(login);
          if (!MOCK_ACCOUNTS.some((u) => u.role === role))
            invalid('role', '사용자 역할 코드가 올바르지 않습니다.');
          if (!account || account.password !== password)
            fail(
              401,
              'INVALID_CREDENTIALS',
              '목업 아이디 또는 비밀번호가 올바르지 않습니다.',
            );
          if (account.user.role !== role)
            fail(403, 'ROLE_MISMATCH', '계정 역할과 선택한 역할이 다릅니다.');
          const token = `mock-only-${role}-${next()}`;
          tokens.set(token, account.user);
          data = {
            access_token: token,
            token_type: 'bearer',
            expires_in: 1800,
            user: account.user,
          } satisfies C.AuthToken;
          break;
        }
        case 'AUTH-02':
          data = user!;
          break;
        case 'AUTH-03':
          return reply(undefined);
        case 'INC-01':
          data = paginate(
            [...incidents.values()]
              .filter(
                (i) => !query.has('status') || i.status === query.get('status'),
              )
              .map((i) => ({
                id: i.id,
                name: i.name,
                status: i.status,
                admin_area_id: i.admin_area_id,
                reported_at: i.reported_at,
                current_stage: i.current_stage,
                current_perimeter_version: i.current_perimeter_version,
                needs_reprediction: i.needs_reprediction,
                proposal_stale: i.proposal_stale,
              })),
            query,
          );
          break;
        case 'INC-02': {
          const reportKey = `${user!.id}:${request.headers.get('Idempotency-Key')}`;
          const previous = reports.get(reportKey);
          if (previous) {
            if (previous.body !== canonical(body))
              fail(
                409,
                'IDEMPOTENCY_KEY_REUSED',
                '다른 본문에 같은 키를 사용했습니다.',
              );
            data = previous.data;
            break;
          }
          const point = body.ignition_point;
          if (
            !isRecord(point) ||
            point.type !== 'Point' ||
            !Array.isArray(point.coordinates) ||
            point.coordinates.length !== 2 ||
            !point.coordinates.every(
              (n) => typeof n === 'number' && Number.isFinite(n),
            )
          )
            invalid('ignition_point', '경도·위도의 Point가 필요합니다.');
          if (
            Math.abs(point.coordinates[0] as number) > 180 ||
            Math.abs(point.coordinates[1] as number) > 90
          )
            invalid('ignition_point', '경도·위도 범위를 확인해주세요.');
          const created: C.Incident = {
            ...structuredClone(fixture['INC-03']),
            id: next(),
            name: '새 목업 산불',
            ignition_point: point as unknown as C.Incident['ignition_point'],
            address: requiredString(body, 'address'),
            reported_at: dateTime(body, 'reported_at'),
            reporter_name: requiredString(body, 'reporter_name'),
            reporter_phone: requiredString(body, 'reporter_phone'),
            started_at:
              body.started_at == null ? null : dateTime(body, 'started_at'),
            report_text:
              typeof body.report_text === 'string' ? body.report_text : null,
            reporter_org:
              typeof body.reporter_org === 'string' ? body.reporter_org : null,
            reported_by: user!.id,
            current_perimeter_id: next(),
            current_perimeter_version: 0,
            latest_prediction_id: null,
            latest_proposal_id: null,
            needs_reprediction: true,
            situation: {},
            situation_revision: 'rev-0',
          };
          const initial: C.Perimeter = {
            ...structuredClone(fixture['PER-02']),
            id: created.current_perimeter_id,
            incident_id: created.id,
            version_no: 0,
            geometry: created.ignition_point,
            observed_at: created.started_at ?? created.reported_at,
            reported_by: user!.id,
            area_ha: 0,
          };
          if (body.initial_perimeter != null) {
            if (!isRecord(body.initial_perimeter))
              invalid('initial_perimeter', '화선 객체가 필요합니다.');
            initial.geometry = geometry(
              body.initial_perimeter.geometry,
            ) as C.Perimeter['geometry'];
            initial.observed_at = dateTime(
              body.initial_perimeter,
              'observed_at',
            );
            initial.version_no = 1;
            initial.area_ha = 10;
            created.current_perimeter_version = 1;
          }
          incidents.set(created.id, created);
          perimeters.set(created.id, [initial]);
          reports.set(reportKey, {
            body: canonical(body),
            data: structuredClone(created),
          });
          data = created;
          break;
        }
        case 'INC-03':
          data = incident!;
          break;
        case 'INC-04': {
          const i = openIncident(incident!.id);
          if (
            requiredString(body, 'expected_perimeter_id') !==
            i.current_perimeter_id
          )
            fail(409, 'STALE_PERIMETER', '현재 화선이 변경되었습니다.');
          i.status = 'ENDED';
          i.ended_at = new Date().toISOString();
          i.ended_by = user!.id;
          data = i;
          break;
        }
        case 'PER-01':
          data = paginate(perimeters.get(incident!.id) ?? [], query);
          break;
        case 'PER-02':
        case 'PER-03': {
          const i = openIncident(incident!.id),
            current = currentPerimeter(i);
          if (
            (route.id === 'PER-02'
              ? requiredString(body, 'expected_perimeter_id')
              : params.perimeter_id) !== current.id
          )
            fail(409, 'STALE_PERIMETER', '현재 화선이 변경되었습니다.');
          const observed = dateTime(body, 'observed_at');
          if (Date.parse(observed) < Date.parse(current.observed_at))
            fail(
              422,
              'INVALID_OBSERVED_AT',
              '현재 화선보다 앞선 관측시각입니다.',
            );
          const reported: C.Perimeter = {
            ...current,
            id: next(),
            version_no: current.version_no + 1,
            geometry: geometry(body.geometry) as C.Perimeter['geometry'],
            observed_at: observed,
            reported_by: user!.id,
            created_at: new Date().toISOString(),
            corrected_at: null,
          };
          if (route.id === 'PER-03') current.corrected_at = reported.created_at;
          perimeters.get(i.id)!.unshift(reported);
          i.current_perimeter_id = reported.id;
          i.current_perimeter_version = reported.version_no;
          i.needs_reprediction = true;
          data = reported;
          break;
        }
        case 'PRED-01': {
          const i = openIncident(incident!.id);
          if (
            requiredString(body, 'expected_perimeter_id') !==
            i.current_perimeter_id
          )
            fail(409, 'STALE_PERIMETER', '현재 화선이 변경되었습니다.');
          data = startJob(i, 'PREDICTION');
          break;
        }
        case 'PRED-02':
          data = prediction!;
          break;
        case 'PRED-03': {
          const hour = query.has('hour') ? Number(query.get('hour')) : null;
          if (
            hour !== null &&
            (!Number.isInteger(hour) || hour < 1 || hour > 8)
          )
            invalid('hour', '1~8의 시간이 필요합니다.');
          const predictionPerimeter = perimeters
            .get(incident!.id)
            ?.find((p) => p.id === prediction!.perimeter_id);
          const seeded =
            options.predictionSlices && predictionPerimeter
              ? options.predictionSlices(
                  incident!,
                  prediction!,
                  predictionPerimeter,
                )
              : undefined;
          data = seeded
            ? {
                ...seeded,
                features: seeded.features.filter(
                  (f) => hour === null || f.properties.hour === hour,
                ),
              }
            : ({
                type: 'FeatureCollection',
                features: prediction!.slices
                  .filter((s) => hour === null || s.hour === hour)
                  .map((s) => ({
                    type: 'Feature',
                    geometry: mockPolygon(s.hour + 1),
                    properties: { ...s, prediction_id: prediction!.id },
                  })),
              } satisfies C.PredictionSlices);
          break;
        }
        case 'PRED-04': {
          const start =
            Math.floor(Date.parse(prediction!.base_at) / 3600000) * 3600000;
          data = {
            ...fixture['PRED-04'],
            hours: fixture['PRED-04'].hours.map((h, index) => ({
              ...h,
              at: new Date(start + index * 3600000).toISOString(),
            })),
          };
          break;
        }
        case 'PRED-05':
          data = pollJob(params.operation_id!, incident!);
          break;
        case 'RISK-01':
          data = { ...fixture['RISK-01']!, prediction_id: prediction!.id };
          break;
        case 'WTH-01':
          data = fixture['WTH-01'];
          break;
        case 'MAP-01':
          data = fixture['MAP-01'];
          break;
        case 'MAP-02': {
          if (!fixture['MAP-01'].some((l) => l.id === params.layer_id))
            fail(422, 'UNKNOWN_LAYER', '알 수 없는 목업 레이어입니다.');
          const bbox = (query.get('bbox') ?? '').split(',').map(Number);
          if (
            bbox.length !== 4 ||
            !bbox.every(Number.isFinite) ||
            bbox[0]! >= bbox[2]! ||
            bbox[1]! >= bbox[3]! ||
            bbox[0]! < -180 ||
            bbox[2]! > 180 ||
            bbox[1]! < -90 ||
            bbox[3]! > 90
          )
            fail(422, 'INVALID_BBOX', '경도·위도 범위를 확인해주세요.');
          const features = structuredClone(fixture['MAP-02'].features);
          if (params.layer_id !== 'villages')
            features.forEach((f) => {
              f.id = 'mock-feature-1';
              f.geometry = { type: 'Point', coordinates: [128.6, 36.37] };
              f.properties =
                params.layer_id === 'admin_areas'
                  ? {
                      id: '11',
                      level: 'EMD',
                      code: '0000000000',
                      name: '목업 행정구역',
                      parent_id: '10',
                      neighbor_ids: [],
                    }
                  : params.layer_id === 'facilities'
                    ? {
                        id: 'mock-feature-1',
                        type: 'SHELTER',
                        subtype: '목업',
                        name: '목업 대피 시설',
                        capacity: null,
                        capacity_unit: null,
                        address: null,
                        phone: null,
                        village_id: '1024',
                        sigungu_id: '10',
                        attrs: { tier: null },
                      }
                    : {
                        id: 'mock-feature-1',
                        kind: params.layer_id!,
                        name: null,
                        attrs: {},
                      };
            });
          const p = paginate(
            features.filter(
              () =>
                bbox[0]! <= 128.6 &&
                bbox[2]! >= 128.6 &&
                bbox[1]! <= 36.37 &&
                bbox[3]! >= 36.37,
            ),
            query,
            1000,
          );
          data = {
            type: 'FeatureCollection',
            features: p.items,
            next_cursor: p.next_cursor,
            has_more: p.has_more,
          };
          break;
        }
        case 'MAP-03': {
          if (!['village', 'facility', 'map_feature', 'resource_base', 'admin_area'].includes(params.entity_type!)) fail(422, 'UNKNOWN_ENTITY_TYPE', '알 수 없는 지도 대상 종류');
          if (user?.role === 'REPORTER' && params.entity_type === 'resource_base') fail(403, 'FORBIDDEN_ROLE', '기지 조회 권한이 없습니다.');
          data = { ...fixture['MAP-03'], entity_type: params.entity_type, entity: { ...fixture['MAP-03'].entity, id: params.entity_id } };
          break;
        }
        case 'MAP-04':
          data = paginate(fixture['MAP-04'].items.filter((area) => (!query.has('level') || area.level === query.get('level')) && (!query.has('parent_id') || area.parent_id === query.get('parent_id')) && (!query.has('q') || area.name.includes(query.get('q')!))), query);
          break;
        case 'RES-01':
          data = paginate(
            fixture['RES-01'].items.filter(
              (r) =>
                (!query.has('kind') || r.kind === query.get('kind')) &&
                (!query.has('status') || r.status === query.get('status')) &&
                (!query.has('base_id') || r.base_id === query.get('base_id')),
            ),
            query,
          );
          break;
        case 'RES-02':
          data = {
            ...fixture['RES-02'],
            incident_deployed: query.has('incident_id')
              ? (incidentOf(query.get('incident_id')!).situation.deployed ??
                null)
              : null,
            incident_linked: query.has('incident_id')
              ? fixture['RES-02'].incident_linked
              : null,
            bases: fixture['RES-02'].bases.filter(
              (r) =>
                (!query.has('kind') || r.kind === query.get('kind')) &&
                (!query.has('base_id') || r.base_id === query.get('base_id')),
            ),
          };
          break;
        case 'BASE-01':
          data = paginate(
            fixture['BASE-01'].items
              .filter(
                (b) =>
                  !query.has('org_type') ||
                  b.org_type === query.get('org_type'),
              )
              .map((b) => ({
                ...b,
                distance_km: query.has('incident_id') ? b.distance_km : null,
                jurisdiction: query.has('incident_id') ? b.jurisdiction : null,
              })),
            query,
          );
          break;
        case 'PROP-01':
          data = paginate(
            [...proposals.values()]
              .filter(
                (p) =>
                  predictions.get(p.prediction_id)?.incident_id ===
                  incident!.id,
              )
              .reverse()
              .map((p) => ({
                ...fixture['PROP-01'].items[0]!,
                id: p.id,
                version: p.version,
                trigger: p.trigger,
                created_at: p.created_at,
              })),
            query,
          );
          break;
        case 'PROP-02':
          data = incident!.latest_proposal_id
            ? (proposals.get(incident!.latest_proposal_id) ?? null)
            : null;
          break;
        case 'PROP-03':
          data = proposal!;
          break;
        case 'PROP-04':
          if (options.seed) {
            const siblings = [...proposals.values()].filter(
              (p) =>
                predictions.get(p.prediction_id)?.incident_id === incident!.id,
            );
            const previous =
              siblings[siblings.findIndex((p) => p.id === proposal!.id) - 1];
            data = {
              ...fixture['PROP-04'],
              version: proposal!.version,
              previous_version: previous?.version ?? null,
              trigger: proposal!.trigger,
              items: previous ? fixture['PROP-04'].items : [],
              counts: previous ? fixture['PROP-04'].counts : null,
            };
            break;
          }
          data =
            proposal!.version === 'v1.0'
              ? {
                  ...fixture['PROP-04'],
                  version: 'v1.0',
                  previous_version: null,
                  cause: null,
                  counts: null,
                  items: [],
                  same_items: [],
                }
              : {
                  ...fixture['PROP-04'],
                  version: proposal!.version,
                  trigger: proposal!.trigger,
                };
          break;
        case 'PROP-05': {
          const i = openIncident(incident!.id);
          if (
            requiredString(body, 'expected_prediction_id') !==
            i.latest_prediction_id
          )
            fail(409, 'STALE_PREDICTION', '현재 예측이 변경되었습니다.');
          if (
            requiredString(body, 'situation_revision') !== i.situation_revision
          )
            fail(409, 'STALE_SITUATION', '현재 상황이 변경되었습니다.');
          if (!i.proposal_stale)
            fail(409, 'REGENERATION_NOT_NEEDED', '미반영 정정이 없습니다.');
          data = startJob(i, 'PROPOSAL_REGENERATION');
          break;
        }
        case 'AI-01': {
          const inputText = requiredString(body, 'input_text');
          if (inputText.length > 2000)
            invalid('input_text', '2000자 이하여야 합니다.');
          if (scenario === 'assistant-unsupported') {
            data = {
              type: 'UNSUPPORTED',
              reason: '목업 처리 불가 예시',
              ignored: [
                { text: inputText, reason: '목업에서 지원하지 않는 입력' },
              ],
            } satisfies C.AssistantResponse;
            break;
          }
          if (scenario === 'assistant-preview') {
            openIncident(incident!.id);
            const deployed = incident!.situation.deployed?.helicopter ?? {
              total: 0,
            };
            const before =
              deployed.unknown ??
              deployed.total -
                (deployed.forest ?? 0) -
                (deployed.local ?? 0) -
                (deployed.fire ?? 0) -
                (deployed.military ?? 0) -
                (deployed.police ?? 0);
            const changes: C.CorrectionChange[] = [
              {
                target: 'deployed',
                item: 'helicopter.unknown',
                before,
                after: before + 2,
                label: `목업 미상 헬기 ${before} → ${before + 2}대`,
              },
              {
                target: 'deployed',
                item: 'helicopter.total',
                before: deployed.total,
                after: deployed.total + 2,
                label: `목업 헬기 합계 ${deployed.total} → ${deployed.total + 2}대`,
              },
            ];
            const preview: C.CorrectionPreview = {
              type: 'CORRECTION_PREVIEW',
              confirmation_token: `mock-preview-${next()}`,
              expires_at: new Date(Date.now() + 600000).toISOString(),
              situation_revision: incident!.situation_revision,
              input_text: inputText,
              changes,
              ignored: [],
              notes: [
                '문장 해석 없이 미리 정한 +2대 변경안을 보여주는 UI 목업입니다.',
              ],
              summary: '목업 변경안을 확인해주세요.',
              proposal_regenerates: incident!.latest_prediction_id !== null,
            };
            previews.set(preview.confirmation_token, {
              preview,
              incident: incident!.id,
              user: user!.id,
            });
            data = preview;
            break;
          }
          const message: C.QaMessage = {
            ...structuredClone(fixture['AI-02'].items[0]!),
            id: next(),
            incident_id: incident!.id,
            user_id: user!.id,
            proposal_id:
              typeof body.proposal_id === 'string'
                ? body.proposal_id
                : incident!.latest_proposal_id,
            item_code:
              typeof body.item_code === 'string' ? body.item_code : null,
            question: inputText,
            answer: '목업 질의응답 예시입니다.',
            sentences: [
              {
                text: '목업 질의응답 예시입니다.',
                citations: [],
                data_refs: [
                  { ref: 'mock', label: 'UI 테스트', value: '합성 응답' },
                ],
              },
            ],
          };
          messages.push(message);
          data = { type: 'ANSWER', message } satisfies C.AssistantResponse;
          break;
        }
        case 'AI-02':
          data = paginate(
            messages
              .filter((m) => m.incident_id === incident!.id)
              .slice()
              .reverse(),
            query,
          );
          break;
        case 'COR-01': {
          const i = openIncident(incident!.id),
            token = requiredString(body, 'confirmation_token'),
            stored = previews.get(token);
          if (!stored || stored.incident !== i.id || stored.user !== user!.id)
            fail(
              422,
              'INVALID_CONFIRMATION_TOKEN',
              '확인안 토큰이 올바르지 않습니다.',
            );
          if (Date.parse(stored.preview.expires_at) < Date.now())
            fail(422, 'EXPIRED_CONFIRMATION_TOKEN', '확인안이 만료되었습니다.');
          if (stored.preview.situation_revision !== i.situation_revision)
            fail(409, 'STALE_SITUATION', '확인안 이후 상황이 변경되었습니다.');
          const correction: C.Correction = {
            id: next(),
            incident_id: i.id,
            user_id: user!.id,
            input_text: stored.preview.input_text,
            changes: structuredClone(stored.preview.changes),
            created_at: new Date().toISOString(),
          };
          const helicopter = {
            ...i.situation.deployed?.helicopter,
            total: i.situation.deployed?.helicopter?.total ?? 0,
          };
          for (const change of correction.changes)
            if (change.target === 'deployed') {
              if (change.item === 'helicopter.total')
                helicopter.total = change.after;
              if (change.item === 'helicopter.unknown')
                helicopter.unknown = change.after;
            }
          i.situation.deployed = { ...i.situation.deployed, helicopter };
          i.situation_revision = `rev-${correction.id}`;
          i.proposal_stale = i.latest_prediction_id !== null;
          corrections.push(correction);
          // Like the server contract, a queued/failed regeneration does not roll back the saved correction.
          const proposalOperation =
            i.latest_prediction_id && !i.running_operation_id
              ? startJob(i, 'PROPOSAL_REGENERATION')
              : null;
          data = {
            correction,
            situation_revision: i.situation_revision,
            proposal_stale: i.proposal_stale,
            proposal_operation: proposalOperation,
          } satisfies C.CorrectionSaved;
          break;
        }
        case 'COR-02':
          data = paginate(
            corrections
              .filter((c) => c.incident_id === incident!.id)
              .slice()
              .reverse(),
            query,
          );
          break;
        case 'LOG-01':
          data = paginate(
            fixture['LOG-01'].items.filter(
              (e) =>
                (!query.has('incident_id') ||
                  e.incident_id === query.get('incident_id')) &&
                (!query.has('action') || e.action === query.get('action')) &&
                (!query.has('user_id') || e.user_id === query.get('user_id')) &&
                (!query.has('from_at') ||
                  Date.parse(e.created_at) >=
                    Date.parse(query.get('from_at')!)) &&
                (!query.has('to_at') ||
                  Date.parse(e.created_at) <= Date.parse(query.get('to_at')!)),
            ),
            query,
          );
          break;
        case 'USR-01':
          data = paginate(
            users.filter(
              (u) =>
                (!query.has('role') || u.role === query.get('role')) &&
                (!query.has('admin_area_id') ||
                  u.admin_area_id === query.get('admin_area_id')) &&
                (query.get('include_deleted') === 'true' ||
                  u.deleted_at === null),
            ),
            query,
          );
          break;
        case 'USR-02': {
          const loginId = requiredString(body, 'login_id'),
            role = requiredString(body, 'role');
          if (!MOCK_ACCOUNTS.some((u) => u.role === role))
            invalid('role', '사용자 역할 코드가 올바르지 않습니다.');
          if (accounts.has(loginId.toLowerCase()))
            fail(409, 'DUPLICATE_LOGIN_ID', '이미 있는 목업 계정입니다.');
          if (
            role === 'ADMIN'
              ? body.admin_area_id !== null
              : typeof body.admin_area_id !== 'string'
          )
            invalid(
              'admin_area_id',
              'ADMIN은 null, 다른 역할은 시군구 ID가 필요합니다.',
            );
          const created: C.AdminUser = {
            id: next(),
            login_id: loginId,
            name: requiredString(body, 'name'),
            organization: requiredString(body, 'organization'),
            role: role as C.UserRole,
            admin_area_id: body.admin_area_id as string | null,
            failed_login_count: 0,
            created_at: MOCK_TIME,
            updated_at: MOCK_TIME,
            deleted_at: null,
          };
          users.push(created);
          accounts.set(loginId.toLowerCase(), {
            user: created,
            password: 'mock-temporary-password',
          });
          data = {
            user: created,
            temporary_password: 'mock-temporary-password',
          } satisfies C.UserCreated;
          break;
        }
      }
      return reply(data);
    } catch (cause) {
      if (cause instanceof MockFailure)
        return error(cause.status, cause.code, cause.message, cause.fields);
      throw cause;
    }
  };
}
