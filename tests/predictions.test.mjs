import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, createApiDataSource, createFixtures, createMockFetch } from '../src/api/index.ts';
import { waitForOperation } from '../src/api/operations.ts';
import { createScreenBridge } from '../src/api/screen/bridge.ts';
import { createScenario } from '../src/data/scenario.ts';
const ok = (data, status = 200) => Response.json({ data, meta: { request_id: 'prediction-test' } }, { status });

test('LIVE prediction sends current perimeter and polls only the returned job; failed and invalid states are distinct', async () => {
  let body, polls = 0;
  const updates = [], client = createApiClient({ mode: 'http', fetcher: async (url, init) => {
    if (init.method === 'POST') { body = JSON.parse(init.body); return ok({ id: 'owned-job', kind: 'PREDICTION', status: 'QUEUED', result: null, error: null }, 202); }
    assert.ok(String(url).endsWith('/incidents/100/operations/owned-job')); polls++;
    return ok({ id: 'owned-job', kind: 'PREDICTION', status: 'SUCCEEDED', result: { prediction_id: '42' }, error: null });
  }});
  const source = createApiDataSource(client);
  const done = await source.predict(createFixtures()['INC-03'], undefined, op => updates.push(op.status));
  assert.deepEqual(body, { expected_perimeter_id: '21', mode: 'LIVE' });
  assert.deepEqual(updates, ['QUEUED', 'SUCCEEDED']);
  assert.equal(done.result.prediction_id, '42'); assert.equal(polls, 1);
  for (const operation of [{ id: 'other', status: 'RUNNING' }, { id: 'owned-job', status: 'UNKNOWN' }]) {
    const broken = createApiClient({ mode: 'http', fetcher: async () => ok({ kind: 'PREDICTION', ...operation }) });
    await assert.rejects(waitForOperation(broken, { incident_id: '100', operation_id: 'owned-job' }, { intervalMs: 0 }), e => e.kind === 'protocol');
  }
  const failed = createApiClient({ mode: 'http', fetcher: async () => ok({ id: 'owned-job', kind: 'PREDICTION', status: 'FAILED', error: { code: 'GPU_UNAVAILABLE', message: 'GPU unavailable' } }) });
  assert.equal((await waitForOperation(failed, { incident_id: '100', operation_id: 'owned-job' })).error.code, 'GPU_UNAVAILABLE');
});

test('result lookup pins operation prediction ID and rejects mixed incident, slice and risk IDs', async () => {
  const f = createFixtures(), paths = [];
  const source = createApiDataSource(createApiClient({ mode: 'http', fetcher: async url => {
    const path = new URL(url, 'http://test.invalid').pathname; paths.push(path);
    if (path.endsWith('/100')) return ok(f['INC-03']);
    if (path.endsWith('/perimeters')) return ok(f['PER-01']);
    if (path.endsWith('/predictions/42')) return ok({ ...f['PRED-02'], id: '42' });
    if (path.endsWith('/slices')) return ok({ ...f['PRED-03'], features: f['PRED-03'].features.map(x => ({ ...x, properties: { ...x.properties, prediction_id: '42' } })) });
    if (path.endsWith('/weather')) return ok(f['PRED-04']);
    if (path.endsWith('/risk')) return ok({ ...f['RISK-01'], prediction_id: '42', status: 'PARTIAL' });
    if (path.endsWith('/now')) return ok(f['WTH-01']);
    return ok(null);
  }}));
  const data = await source.loadIncident('100', 'VIEWER', undefined, undefined, '42');
  assert.equal(data.prediction.data.id, '42'); assert.equal(data.slices.data.features.length, 8);
  assert.equal(data.risk.data.status, 'PARTIAL');
  assert.ok(!paths.some(p => p.includes('/predictions/41')));
  const mixed = createApiDataSource(createApiClient({ mode: 'http', fetcher: async url => {
    const p = String(url);
    if (p.endsWith('/100')) return ok(f['INC-03']);
    if (p.endsWith('/predictions/41')) return ok({ ...f['PRED-02'], incident_id: '999' });
    if (p.endsWith('/slices')) return ok({ ...f['PRED-03'], features: f['PRED-03'].features.map(x => ({ ...x, properties: { ...x.properties, prediction_id: '999' } })) });
    if (p.endsWith('/risk')) return ok({ ...f['RISK-01'], prediction_id: '999' });
    if (p.endsWith('/perimeters')) return ok(f['PER-01']);
    return ok(f['WTH-01']);
  }}));
  const invalid = await mixed.loadIncident('100', 'VIEWER');
  for (const key of ['prediction', 'slices', 'risk']) assert.equal(invalid[key].error.kind, 'protocol');
});

for (const fail of [false, true]) test(`prediction completion preserves a newer incident selection (failure=${fail})`, async () => {
  const f = createFixtures(), S = createScenario(), elements = new Map();
  for (const [id, value] of Object.entries({ 'login-id': 'mock-commander', 'login-pw': 'mock-password', 'login-role': 'commander' })) elements.set(id, { value });
  const previous = globalThis.document;
  globalThis.document = { getElementById: id => elements.get(id) ?? { textContent: '' } };
  const state = { role: null, incId: '100', inc: {}, events: [], predicting: false };
  let release, started;
  const gate = new Promise(r => release = r), pending = new Promise(r => started = r);
  const fetcher = createMockFetch({ latencyMs: 0, scenarios: fail ? { 'PRED-05': 'operation-failed' } : {}, seed: {
    incidents: [f['INC-03'], { ...f['INC-03'], id: '200', name: 'other', current_perimeter_id: '31', latest_prediction_id: null, latest_proposal_id: null }],
    perimeters: [f['PER-01'].items[0], { ...f['PER-01'].items[0], id: '31', incident_id: '200' }],
    accounts: [{ user: f['AUTH-02'], password: 'mock-password' }],
  }});
  const source = createApiDataSource(createApiClient({ mode: 'http', fetcher: async (url, init) => {
    if (String(url).includes('/operations/')) {
      started(); await gate;
      let result; for (let n = 0; n < 3; n++) result = await fetcher(url, init);
      return result;
    }
    return fetcher(url, init);
  }}));
  const host = { S, state, IS: (id = state.incId) => state.inc[id] ??= {}, refresh() {}, loginBusy() {}, loginError(message) { if (message) assert.fail(message); }, busy(value) { state.predicting = value; }, chatBusy() {}, notice() {}, baseAt() {}, selected(id) { state.incId = id; }, enter(account) { state.role = account.role; }, message() {}, answer() {}, predictionReady() { assert.fail('must not focus a finished background prediction'); } };
  const bridge = createScreenBridge(source, host);
  try {
    await bridge.login();
    const job = bridge.predict(); await pending;
    await bridge.select('200'); assert.equal(state.incId, '200');
    release(); await job;
    assert.equal(state.incId, '200'); assert.equal(state.predicting, false);
    assert.equal(bridge.predictionFailure(), undefined);
    await bridge.select('100');
    if (fail) assert.ok(bridge.predictionFailure() instanceof Error);
    else assert.ok(bridge.predictionAt(8));
  } finally { release(); bridge.dispose(); globalThis.document = previous; }
});
