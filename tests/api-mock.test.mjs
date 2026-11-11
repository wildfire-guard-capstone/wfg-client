import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createApiClient,
  createApiServices,
  waitForOperation,
  createFixtures,
  MOCK_ACCOUNTS,
  MOCK_PASSWORD,
} from '../src/api/index.ts';

const path = { incident_id: '100' };
const predictionPath = { ...path, prediction_id: '41' };
const make = (mock = {}) =>
  createApiClient({
    mode: 'mock',
    mock: { latencyMs: 0, ...mock },
    fetcher: () => {
      throw new Error('Mock must never contact HTTP fetcher');
    },
  });
const login = (client, role = 'COMMANDER') =>
  client.request('AUTH-01', {
    body: {
      login_id: `mock-${role.toLowerCase()}`,
      password: MOCK_PASSWORD,
      role,
    },
  });
const start = (client) =>
  client.request('PRED-01', {
    path,
    body: { expected_perimeter_id: '21' },
    idempotencyKey: 'prediction-action',
  });
const wait = (client, job) =>
  waitForOperation(
    client,
    { ...path, operation_id: job.id },
    { intervalMs: 0, maxWaitMs: 2000 },
  );
const preview = (client) =>
  client.request('AI-01', { path, body: { input_text: '목업 정정 문장' } });
const confirm = (client, confirmation_token) =>
  client.request('COR-01', {
    path,
    body: { confirmation_token },
    idempotencyKey: `confirm-${confirmation_token}`,
  });

test('mock authentication, all four roles, isolated sessions and logout', async () => {
  const client = make();
  await assert.rejects(client.request('AUTH-02'), (e) => e.status === 401);
  for (const account of MOCK_ACCOUNTS) {
    assert.equal((await login(client, account.role)).user.role, account.role);
    assert.equal((await client.request('AUTH-02')).id, account.id);
  }
  await assert.rejects(
    client.request('AUTH-01', {
      body: {
        login_id: 'mock-admin',
        password: MOCK_PASSWORD,
        role: 'COMMANDER',
      },
    }),
    (e) => e.status === 403 && e.code === 'ROLE_MISMATCH',
  );
  await assert.rejects(
    client.request('PROP-02', { path }),
    (e) => e.status === 403,
  );
  const token = client.getAccessToken(),
    other = make();
  other.setAccessToken(token);
  await assert.rejects(other.request('AUTH-02'), (e) => e.status === 401);
  assert.equal(await client.request('AUTH-03'), undefined);
  assert.equal(client.getAccessToken(), null);
});

test('mock incident report, idempotent replay, v0/v1, new perimeter and correction', async () => {
  const client = make();
  await login(client, 'REPORTER');
  const request = {
    body: {
      ignition_point: { type: 'Point', coordinates: [128.6, 36.37] },
      address: '가상 신고 장소',
      reported_at: '2026-11-10T12:00:00+09:00',
      reporter_name: '목업 보고자',
      reporter_phone: 'MOCK-NOT-A-PHONE',
    },
    idempotencyKey: 'report-one',
  };
  const created = await client.request('INC-02', request);
  assert.equal(created.current_perimeter_version, 0);
  assert.equal(created.latest_prediction_id, null);
  assert.equal(
    (await client.request('INC-02', { ...request, body: { ...request.body } }))
      .id,
    created.id,
  );
  await assert.rejects(
    client.request('INC-02', {
      ...request,
      body: { ...request.body, address: '변경' },
    }),
    (e) => e.code === 'IDEMPOTENCY_KEY_REUSED',
  );
  assert.equal(
    (await client.request('INC-01')).items.filter((i) => i.id === created.id)
      .length,
    1,
  );
  const p = { incident_id: created.id },
    v0 = (await client.request('PER-01', { path: p })).items[0];
  assert.equal(v0.geometry.type, 'Point');
  const { geometry } = createFixtures()['PER-02'];
  const v1 = await client.request('PER-02', {
    path: p,
    body: {
      geometry,
      observed_at: '2026-11-10T12:30:00+09:00',
      expected_perimeter_id: v0.id,
    },
    idempotencyKey: 'perimeter-one',
  });
  assert.equal(v1.version_no, 1);
  await assert.rejects(
    client.request('PER-02', {
      path: p,
      body: {
        geometry,
        observed_at: v1.observed_at,
        expected_perimeter_id: v0.id,
      },
      idempotencyKey: 'perimeter-one',
    }),
    (e) => e.code === 'STALE_PERIMETER',
  );
  await assert.rejects(
    client.request('PER-02', {
      path: p,
      body: {
        geometry,
        observed_at: v0.observed_at,
        expected_perimeter_id: v1.id,
      },
      idempotencyKey: 'old-time',
    }),
    (e) => e.code === 'INVALID_OBSERVED_AT',
  );
  const v2 = await client.request('PER-03', {
    path: { ...p, perimeter_id: v1.id },
    body: { geometry, observed_at: v1.observed_at },
    idempotencyKey: 'correction-one',
  });
  const versions = (await client.request('PER-01', { path: p })).items;
  assert.equal(v2.version_no, 2);
  assert.ok(versions.find((v) => v.id === v1.id).corrected_at);
  assert.equal(
    (await client.request('INC-03', { path: p })).needs_reprediction,
    true,
  );
  const initial = await client.request('INC-02', {
    ...request,
    idempotencyKey: 'report-two',
    body: {
      ...request.body,
      initial_perimeter: { geometry, observed_at: request.body.reported_at },
    },
  });
  assert.equal(initial.current_perimeter_version, 1);
  await login(client);
  await client.request('INC-04', {
    path: p,
    body: { expected_perimeter_id: v2.id },
  });
  await assert.rejects(
    client.request('PRED-01', {
      path: p,
      body: { expected_perimeter_id: v2.id },
      idempotencyKey: 'ended',
    }),
    (e) => e.code === 'INCIDENT_ENDED',
  );
});

test('normal prediction pipeline: 202 → polling → new result, 8 slices and 9 weather hours', async () => {
  const client = make();
  await login(client);
  const job = await start(client);
  assert.equal(job.status, 'QUEUED');
  await assert.rejects(start(client), (e) => e.code === 'PREDICTION_RUNNING');
  const updates = [];
  const done = await waitForOperation(
    client,
    { ...path, operation_id: job.id },
    {
      intervalMs: 0,
      maxWaitMs: 2000,
      onUpdate: (op) => updates.push(op.status),
    },
  );
  assert.equal(done.status, 'SUCCEEDED');
  assert.deepEqual(updates, ['RUNNING', 'RUNNING', 'SUCCEEDED']);
  const p = { ...path, prediction_id: done.result.prediction_id };
  const prediction = await client.request('PRED-02', { path: p });
  const slices = await client.request('PRED-03', { path: p });
  assert.equal(slices.features.length, 8);
  assert.equal(prediction.slices.length, 8);
  assert.equal(
    (await client.request('PRED-03', { path: p, query: { hour: 5 } }))
      .features[0].properties.hour,
    5,
  );
  const weather = await client.request('PRED-04', { path: p });
  assert.equal(weather.hours.length, 9);
  assert.equal(
    Date.parse(weather.hours[0].at),
    Math.floor(Date.parse(prediction.base_at) / 3600000) * 3600000,
  );
  const latest = await client.request('PROP-02', { path });
  assert.equal(latest.id, done.result.proposal_id);
  assert.equal(latest.prediction_id, p.prediction_id);
  assert.deepEqual(
    latest.items.map((i) => i.item_code),
    ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6'],
  );
  const history = await client.request('PROP-01', { path });
  assert.equal(history.items[0].id, latest.id);
  assert.equal(
    (
      await client.request('PROP-03', {
        path: { ...path, proposal_id: latest.id },
      })
    ).id,
    latest.id,
  );
  assert.equal(
    (
      await client.request('PROP-04', {
        path: { ...path, proposal_id: latest.id },
      })
    ).version,
    latest.version,
  );
});

test('failed prediction retains previous results; aborted polling does not start another job', async () => {
  const client = make({ scenarios: { 'PRED-05': 'operation-failed' } });
  await login(client);
  const job = await start(client),
    before = await client.request('INC-03', { path });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    waitForOperation(
      client,
      { ...path, operation_id: job.id },
      { signal: controller.signal },
    ),
    (e) => e.name === 'AbortError',
  );
  assert.equal(
    (await client.request('INC-03', { path })).running_operation_id,
    job.id,
  );
  assert.equal((await wait(client, job)).status, 'FAILED');
  const after = await client.request('INC-03', { path });
  assert.equal(after.latest_prediction_id, before.latest_prediction_id);
  assert.equal(after.latest_proposal_id, before.latest_proposal_id);
  assert.equal(after.running_operation_id, null);
});

test('mock risk (risk-2) retains nulls, 25 factors and fractional grades; R = √(H × X) and group contributions sum to H and X', async () => {
  const client = make();
  await login(client);
  const risk = await client.request('RISK-01', { path: predictionPath });
  assert.equal(risk.factors.length, 25);
  assert.equal(risk.combine, 'sqrt_hx');
  assert.equal(risk.grade, null);
  assert.equal(risk.factors.find((f) => f.code === 'wind_speed').grade, 3.25);
  assert.equal(risk.factors.find((f) => f.code === 'slope_up').grade, null);
  assert.equal(risk.factors.find((f) => f.code === 'fire_area').axis, 'scale');
  const hazardAxes = ['weather', 'terrain', 'fuel', 'scale'];
  const part = (inH) =>
    risk.factors
      .filter((f) => hazardAxes.includes(f.axis) === inH)
      .reduce((n, f) => n + (f.contribution ?? 0), 0);
  assert.ok(Math.abs(part(true) - risk.hazard) < 1e-12);
  assert.ok(Math.abs(part(false) - risk.exposure) < 1e-12);
  assert.ok(Math.abs(risk.score - Math.sqrt(risk.hazard * risk.exposure)) < 1e-12);
  assert.ok(
    Math.abs(risk.factors.reduce((n, f) => n + f.weight, 0) - 1.14) < 1e-12,
  );
  const now = await client.request('WTH-01', { path });
  assert.equal(now.precip, 0);
});

test('mock empty responses preserve nullable vs required object semantics', async () => {
  const client = make({ scenario: 'empty' });
  await login(client);
  for (const id of ['INC-01', 'PER-01', 'PROP-01', 'AI-02', 'COR-02']) {
    const result = await client.request(id, id === 'INC-01' ? {} : { path });
    assert.deepEqual(result, { items: [], next_cursor: null, has_more: false });
  }
  assert.equal(await client.request('PROP-02', { path }), null);
  assert.equal(await client.request('RISK-01', { path: predictionPath }), null);
  assert.equal(
    (
      await client.request('MAP-02', {
        path: { layer_id: 'villages' },
        query: { bbox: '128,36,129,37' },
      })
    ).features.length,
    0,
  );
  assert.equal((await client.request('WTH-01', { path })).precip, null);
  await assert.rejects(
    client.request('INC-03', { path }),
    (e) => e.status === 404,
  );
});

for (const [scenario, expected] of [
  ['unauthorized', 401],
  ['forbidden', 403],
  ['not-found', 404],
  ['validation-error', 422],
  ['conflict', 409],
  ['unavailable', 503],
  ['server-error', 500],
  ['network-error', 'NETWORK_ERROR'],
  ['timeout', 'REQUEST_TIMEOUT'],
])
  test(`mock scenario ${scenario}`, async () => {
    const client = make({ scenarios: { 'INC-01': scenario } });
    await login(client);
    await assert.rejects(client.request('INC-01', { timeoutMs: 10 }), (e) =>
      typeof expected === 'number'
        ? e.status === expected
        : e.code === expected,
    );
  });

test('assistant answer and unsupported preview do not modify situation', async () => {
  for (const scenario of ['assistant-answer', 'assistant-unsupported']) {
    const client = make({ scenarios: { 'AI-01': scenario } });
    await login(client);
    const before = await client.request('INC-03', { path }),
      response = await preview(client);
    assert.equal(
      response.type,
      scenario === 'assistant-answer' ? 'ANSWER' : 'UNSUPPORTED',
    );
    assert.deepEqual(
      (await client.request('INC-03', { path })).situation,
      before.situation,
    );
    assert.equal((await client.request('COR-02', { path })).items.length, 0);
  }
});

test('preview is unsaved until confirmation; stale confirmation rejected, regeneration succeeds', async () => {
  const client = make({ scenarios: { 'AI-01': 'assistant-preview' } });
  await login(client);
  const before = await client.request('INC-03', { path }),
    a = await preview(client),
    b = await preview(client);
  assert.equal(a.type, 'CORRECTION_PREVIEW');
  assert.equal((await client.request('COR-02', { path })).items.length, 0);
  assert.deepEqual(
    (await client.request('INC-03', { path })).situation,
    before.situation,
  );
  const saved = await confirm(client, a.confirmation_token);
  assert.equal(saved.proposal_stale, true);
  const after = await client.request('INC-03', { path });
  assert.equal(
    after.situation.deployed.helicopter.total,
    before.situation.deployed.helicopter.total + 2,
  );
  await assert.rejects(
    confirm(client, b.confirmation_token),
    (e) => e.code === 'STALE_SITUATION',
  );
  assert.equal((await client.request('COR-02', { path })).items.length, 1);
  assert.equal(
    (await client.request('AI-02', { path })).items.length,
    1,
    'previews must not enter Q&A history',
  );
  assert.equal(
    (await wait(client, saved.proposal_operation)).status,
    'SUCCEEDED',
  );
  assert.equal(
    (await client.request('INC-03', { path })).proposal_stale,
    false,
  );
});

test('saved correction survives regeneration failure; PROP-05 retries job without resaving correction', async () => {
  const client = make({
    scenarios: { 'AI-01': 'assistant-preview', 'PRED-05': 'operation-failed' },
  });
  await login(client);
  const saved = await confirm(
    client,
    (await preview(client)).confirmation_token,
  );
  assert.equal((await wait(client, saved.proposal_operation)).status, 'FAILED');
  const incident = await client.request('INC-03', { path });
  assert.equal(incident.proposal_stale, true);
  assert.equal(incident.situation.deployed.helicopter.total, 4);
  assert.equal(incident.latest_proposal_id, '71');
  const retry = await client.request('PROP-05', {
    path,
    body: {
      expected_prediction_id: incident.latest_prediction_id,
      situation_revision: incident.situation_revision,
    },
    idempotencyKey: 'retry-proposal-only',
  });
  assert.equal(retry.kind, 'PROPOSAL_REGENERATION');
  assert.equal((await client.request('COR-02', { path })).items.length, 1);
});

test('layers, resource filters, pagination, admin issuance and logs', async () => {
  const client = make();
  await login(client);
  assert.equal((await client.request('MAP-01')).length, 10);
  assert.equal(
    (
      await client.request('MAP-02', {
        path: { layer_id: 'villages' },
        query: { bbox: '128,36,129,37' },
      })
    ).features.length,
    1,
  );
  await assert.rejects(
    client.request('MAP-02', {
      path: { layer_id: 'villages' },
      query: { bbox: 'bad' },
    }),
    (e) => e.code === 'INVALID_BBOX',
  );
  await assert.rejects(client.request('RES-01'), (e) => e.status === 422);
  assert.equal(
    (
      await client.request('RES-01', {
        query: { incident_id: '100', kind: 'VEHICLE' },
      })
    ).items.length,
    0,
  );
  assert.equal(
    (await client.request('RES-02', { query: { incident_id: '100' } }))
      .incident_linked.HELICOPTER,
    0,
  );
  assert.equal(
    (await client.request('BASE-01', { query: { incident_id: '100' } }))
      .items[0].jurisdiction,
    'LOCAL',
  );
  assert.equal(
    (await client.request('LOG-01', { query: { incident_id: '100' } })).items
      .length,
    1,
  );
  await login(client, 'ADMIN');
  assert.equal((await client.request('BASE-01')).items[0].distance_km, null);
  const first = await client.request('USR-01', { query: { limit: 1 } });
  assert.equal(first.has_more, true);
  const second = await client.request('USR-01', {
    query: { limit: 1, cursor: first.next_cursor },
  });
  assert.notEqual(second.items[0].id, first.items[0].id);
  const created = await client.request('USR-02', {
    body: {
      login_id: 'mock-issued',
      name: '목업',
      organization: 'UI 테스트',
      role: 'VIEWER',
      admin_area_id: '10',
    },
  });
  assert.equal(created.user.login_id, 'mock-issued');
  const auth = await client.request('AUTH-01', {
    body: {
      login_id: created.user.login_id,
      password: created.temporary_password,
      role: created.user.role,
    },
  });
  assert.equal(auth.user.id, created.user.id);
});

test('typed overrides allow UI states without changing global fetch', async () => {
  const original = globalThis.fetch;
  const client = make({
    overrides: {
      'PROP-02': null,
      'WTH-01': { ...createFixtures()['WTH-01'], wind_speed: 0, precip: 0 },
    },
  });
  await login(client);
  assert.equal(await client.request('PROP-02', { path }), null);
  assert.equal((await client.request('WTH-01', { path })).wind_speed, 0);
  assert.equal(globalThis.fetch, original);
  assert.equal(createApiServices(client).auth.me instanceof Function, true);
});
