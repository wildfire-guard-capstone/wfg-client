import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createApiClient,
  createApiServices,
  createApiClientFromEnv,
  createMemoryTokenStore,
  createSessionTokenStore,
  createIdempotencyKey,
  ApiError,
  API_IDS,
  endpoints,
  createFixtures,
} from '../src/api/index.ts';

const path = { incident_id: '100' };
const prediction = { ...path, prediction_id: '41' };
const proposal = { ...path, proposal_id: '71' };
const shape = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [128, 36],
        [129, 36],
        [129, 37],
        [128, 36],
      ],
    ],
  ],
};
const idempotencyKey = 'one-action';
const report = {
  ignition_point: { type: 'Point', coordinates: [128.6, 36.37] },
  address: '가상 장소',
  reported_at: '2026-11-10T12:00:00+09:00',
  reporter_name: '목업 보고자',
  reporter_phone: 'MOCK-NOT-A-PHONE',
};
const requests = {
  'AUTH-01': {
    body: {
      login_id: 'mock-commander',
      password: 'mock-password',
      role: 'COMMANDER',
    },
  },
  'AUTH-02': {},
  'AUTH-03': {},
  'INC-01': { query: { limit: 1, status: 'IN_PROGRESS' } },
  'INC-02': { body: report, idempotencyKey },
  'INC-03': { path },
  'INC-04': { path, body: { expected_perimeter_id: '21' } },
  'PER-01': { path },
  'PER-02': {
    path,
    body: {
      geometry: shape,
      observed_at: report.reported_at,
      expected_perimeter_id: '21',
    },
    idempotencyKey,
  },
  'PER-03': {
    path: { ...path, perimeter_id: '21' },
    body: { geometry: shape, observed_at: report.reported_at },
    idempotencyKey,
  },
  'PRED-01': { path, body: { expected_perimeter_id: '21' }, idempotencyKey },
  'PRED-02': { path: prediction },
  'PRED-03': { path: prediction, query: { hour: 5 } },
  'PRED-04': { path: prediction },
  'PRED-05': { path: { ...path, operation_id: 'mock-job-1' } },
  'RISK-01': { path: prediction },
  'WTH-01': { path },
  'MAP-01': {},
  'MAP-03': { path: { entity_type: 'village', entity_id: '1024' } },
  'MAP-04': { query: { q: '목업', level: 'EMD' } },
  'MAP-02': {
    path: { layer_id: 'villages' },
    query: { bbox: '128,36,129,37', limit: 500 },
  },
  'RES-01': { query: { incident_id: '100', status: 'AVAILABLE' } },
  'RES-02': { query: { incident_id: '100' } },
  'RES-03': { body: { kind: 'VEHICLE', name: '테스트', base_id: '31' } },
  'RES-04': { path: { resource_id: '61' }, body: { status: 'MAINTENANCE' } },
  'RES-05': { path: { resource_id: '61' } },
  'BASE-01': { query: { incident_id: '100' } },
  'BASE-02': { body: { name: '테스트 기지', org_type: '테스트', coverage_area_ids: ['10'], geometry: null } },
  'BASE-03': { path: { base_id: '31' }, body: { geometry: { type: 'Point', coordinates: [128, 36] } } },
  'BASE-04': { path: { base_id: '31' } },
  'PROP-01': { path },
  'PROP-02': { path },
  'PROP-03': { path: proposal },
  'PROP-04': { path: proposal },
  'PROP-05': {
    path,
    body: { expected_prediction_id: '41', situation_revision: 'rev-0' },
    idempotencyKey,
  },
  'AI-01': { path, body: { input_text: '목업 질문' } },
  'AI-02': { path },
  'COR-01': {
    path,
    body: { confirmation_token: 'mock-preview' },
    idempotencyKey,
  },
  'COR-02': { path },
  'LOG-01': { query: { incident_id: '100' } },
  'USR-01': { query: { include_deleted: false } },
  'USR-02': {
    body: {
      login_id: 'mock-new',
      name: '목업',
      organization: 'UI 테스트',
      role: 'VIEWER',
      admin_area_id: '10',
    },
  },
};
const agreed =
  'AUTH-01 AUTH-02 AUTH-03 USR-01 USR-02 INC-01 INC-02 INC-03 INC-04 PER-01 PER-02 PER-03 PRED-01 PRED-02 PRED-03 PRED-04 PRED-05 RISK-01 WTH-01 MAP-01 MAP-02 MAP-03 MAP-04 BASE-01 BASE-02 BASE-03 BASE-04 RES-01 RES-02 RES-03 RES-04 RES-05 PROP-01 PROP-02 PROP-03 PROP-04 PROP-05 AI-01 AI-02 COR-01 COR-02 LOG-01'.split(
    ' ',
  );
const success = (data, status = 200) =>
  status === 204
    ? new Response(null, { status })
    : Response.json({ data, meta: { request_id: 'test-request' } }, { status });
const failure = (status, code = 'SERVER_CODE') =>
  Response.json(
    {
      error: {
        code,
        message: '검증용 오류',
        fields: [{ field: 'observed_at', reason: '검증용' }],
      },
      meta: { request_id: 'test-error' },
    },
    { status },
  );

test('active contracts include confirmed MAP-03/04, P1 14/P2 18/P3 10', () => {
  assert.deepEqual([...API_IDS].sort(), agreed.sort());
  assert.deepEqual(
    ['P1', 'P2', 'P3'].map(
      (p) => API_IDS.filter((id) => endpoints[id].priority === p).length,
    ),
    [14, 18, 10],
  );
  assert.deepEqual(Object.keys(createFixtures()).sort(), agreed);
});

for (const id of Object.keys(requests))
  test(`HTTP ${id}: serialize request and unwrap status ${endpoints[id].status}`, async () => {
    const fixture = createFixtures()[id];
    let calls = 0;
    const client = createApiClient({
      mode: 'http',
      baseUrl: 'https://api.example.invalid/api/v1/',
      tokenStore: createMemoryTokenStore('test-token'),
      fetcher: async (input, init) => {
        calls++;
        const url = new URL(input),
          e = endpoints[id],
          options = requests[id];
        assert.equal(
          url.pathname,
          '/api/v1' +
            e.path.replace(/\{(\w+)\}/g, (_, key) =>
              encodeURIComponent(options.path[key]),
            ),
        );
        assert.equal(init.method, e.method);
        assert.equal(init.credentials, 'omit');
        assert.equal(init.cache, 'no-store');
        assert.equal(
          init.headers.get('Authorization'),
          id === 'AUTH-01' ? null : 'Bearer test-token',
        );
        assert.equal(
          init.headers.get('Idempotency-Key'),
          e.idempotent ? idempotencyKey : null,
        );
        assert.equal(
          init.headers.get('Content-Type'),
          e.body ? 'application/json' : null,
        );
        assert.deepEqual(
          init.body ? JSON.parse(init.body) : undefined,
          options.body,
        );
        for (const [key, value] of Object.entries(options.query ?? {}))
          assert.equal(url.searchParams.get(key), String(value));
        return success(fixture, e.status);
      },
    });
    assert.deepEqual(await client.request(id, requests[id]), fixture);
    assert.equal(calls, 1);
    if (id === 'AUTH-01')
      assert.equal(client.getAccessToken(), fixture.access_token);
    if (id === 'AUTH-03') assert.equal(client.getAccessToken(), null);
  });

test('path encoding, opaque cursor and BIGINT string values are preserved', async () => {
  const seen = [];
  const client = createApiClient({
    mode: 'http',
    fetcher: async (url) => {
      seen.push(url);
      return success({ items: [], next_cursor: null, has_more: false });
    },
  });
  await client.request('PER-01', {
    path: { incident_id: '9007199254740993/part?' },
    query: { cursor: 'opaque +/=☃', limit: 20 },
  });
  assert.match(seen[0], /9007199254740993%2Fpart%3F/);
  assert.equal(
    new URL(seen[0], 'http://test.invalid').searchParams.get('cursor'),
    'opaque +/=☃',
  );
});

for (const status of [401, 403, 404, 409, 422, 500, 503])
  test(`HTTP ${status}: keeps error code, fields and request ID`, async () => {
    const client = createApiClient({
      mode: 'http',
      tokenStore: createMemoryTokenStore('token'),
      fetcher: async () => failure(status),
    });
    await assert.rejects(
      client.request('AUTH-02'),
      (error) =>
        error instanceof ApiError &&
        error.kind === 'http' &&
        error.status === status &&
        error.code === 'SERVER_CODE' &&
        error.requestId === 'test-error' &&
        error.fields[0].field === 'observed_at',
    );
    assert.equal(client.getAccessToken(), status === 401 ? null : 'token');
  });

test('non-JSON errors are safe; malformed successes are protocol errors', async () => {
  const http = createApiClient({
    mode: 'http',
    fetcher: async () =>
      new Response('<html>private proxy details</html>', {
        status: 502,
        headers: { 'X-Request-ID': 'proxy-id' },
      }),
  });
  await assert.rejects(
    http.request('AUTH-02'),
    (e) =>
      e.code === 'HTTP_ERROR' &&
      e.requestId === 'proxy-id' &&
      !e.message.includes('private'),
  );
  for (const response of [
    Response.json({ id: '1' }),
    success({}, 201),
    new Response(null, { status: 204 }),
  ]) {
    const client = createApiClient({
      mode: 'http',
      fetcher: async () => response,
    });
    await assert.rejects(
      client.request('AUTH-02'),
      (e) => e.kind === 'protocol',
    );
  }
});

test('no automatic retry; network, timeout and caller cancellation stay distinct', async () => {
  let calls = 0;
  const network = createApiClient({
    mode: 'http',
    fetcher: async () => {
      calls++;
      throw new TypeError('offline');
    },
  });
  await assert.rejects(
    network.request('AUTH-02'),
    (e) => e.code === 'NETWORK_ERROR',
  );
  assert.equal(calls, 1);
  const timeout = createApiClient({
    mode: 'http',
    timeoutMs: 10,
    fetcher: async (_, init) =>
      new Promise((_, reject) =>
        init.signal.addEventListener(
          'abort',
          () => reject(init.signal.reason),
          { once: true },
        ),
      ),
  });
  await assert.rejects(
    timeout.request('AUTH-02'),
    (e) => e.code === 'REQUEST_TIMEOUT',
  );
  const controller = new AbortController();
  const pending = timeout.request('AUTH-02', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (e) => e.name === 'AbortError');
  await assert.rejects(
    timeout.request('AUTH-02', { signal: controller.signal }),
    (e) => e.name === 'AbortError',
  );
});

test('old 401 response cannot clear a newer login token; failed login keeps current token', async () => {
  let resolve;
  const client = createApiClient({
    mode: 'http',
    tokenStore: createMemoryTokenStore('old'),
    fetcher: async () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  const pending = client.request('AUTH-02');
  client.setAccessToken('new');
  resolve(failure(401));
  await assert.rejects(pending);
  assert.equal(client.getAccessToken(), 'new');
  const login = createApiClient({
    mode: 'http',
    tokenStore: createMemoryTokenStore('current'),
    fetcher: async () => failure(401),
  });
  await assert.rejects(login.request('AUTH-01', requests['AUTH-01']));
  assert.equal(login.getAccessToken(), 'current');
});

test('configuration mistakes fail before transport; mode/env and token storage are explicit', async () => {
  let calls = 0;
  const client = createApiClient({
    mode: 'http',
    fetcher: async () => {
      calls++;
      return success(null);
    },
  });
  await assert.rejects(
    client.request('PRED-01', { path, body: { expected_perimeter_id: '21' } }),
    (e) => e.kind === 'configuration',
  );
  await assert.rejects(
    client.request('INC-03', {}),
    (e) => e.kind === 'configuration',
  );
  assert.equal(calls, 0);
  for (const baseUrl of [
    'https://user:password@example.invalid/api/v1',
    '//api.example/api/v1',
    '/api/v1?token=secret',
    '/wrong',
  ])
    assert.throws(() => createApiClient({ mode: 'http', baseUrl }));
  assert.equal(createApiClientFromEnv({}).mode, 'mock');
  assert.equal(createApiClientFromEnv({ VITE_API_MODE: 'http' }).mode, 'http');
  assert.throws(() => createApiClientFromEnv({ VITE_API_MODE: 'typo' }));
  const values = new Map(),
    storage = {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => values.set(k, v),
      removeItem: (k) => values.delete(k),
    };
  const tokens = createSessionTokenStore(storage);
  tokens.set('test-session');
  assert.equal(tokens.get(), 'test-session');
  tokens.clear();
  assert.equal(tokens.get(), null);
  assert.match(createIdempotencyKey(), /^[\da-f-]{36}$/);
  const services = createApiServices(
    createApiClient({ mode: 'mock', mock: { latencyMs: 0 } }),
  );
  assert.equal(
    (await services.auth.login(requests['AUTH-01'])).user.role,
    'COMMANDER',
  );
  assert.equal((await services.incidents.list()).items[0].id, '100');
});
