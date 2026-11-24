import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/api/client.ts';
import { createApiDataSource } from '../src/api/data-source.ts';
import { createScreenBridge } from '../src/api/screen/bridge.ts';
import { createFixtures } from '../src/api/mock/fixtures.ts';
import { createMockFetch } from '../src/api/mock/transport.ts';
import { createScenario } from '../src/data/scenario.ts';
import { proposalJobHTML } from '../src/api/screen/presentation.ts';

const ok = (data, status = 200) => Response.json({ data, meta: { request_id: 'split-test' } }, { status });
const until = async (check) => { for (let n = 0; n < 400 && !check(); n++) await new Promise(r => setTimeout(r, 10)); assert.ok(check()); };

/** 서버 두 묶음: 예측 작업이 제안서 작업(op-p)을 넘기고 끝난다. 제안서는 gate를 풀 때 끝난다. */
async function setup({ first = 'SUCCEEDED', needs = false, hidden = false } = {}) {
  const f = createFixtures(), S = createScenario(), elements = new Map(), notices = [], said = [];
  for (const [id, value] of Object.entries({ 'login-id': 'mock-commander', 'login-pw': 'mock-password', 'login-role': 'commander' })) elements.set(id, { value });
  const previous = globalThis.document;
  globalThis.document = { getElementById: id => elements.get(id) ?? { textContent: '' } };
  const state = { role: null, incId: '100', inc: {}, events: [], predicting: false };
  const server = { needs, stalePerimeter: false, prediction: null, proposal: null, running: null, outcome: first, done: false, retries: 0, posts: [] };
  const base = createMockFetch({ latencyMs: 0, seed: {
    incidents: [f['INC-03']], perimeters: [f['PER-01'].items[0]],
    accounts: [{ user: f['AUTH-02'], password: 'mock-password' }],
  } });
  const proposal = id => ({ ...f['PROP-02'], id, prediction_id: '42' });
  const incident = () => ({ ...f['INC-03'], latest_prediction_id: server.prediction, latest_proposal_id: server.proposal, running_operation_id: server.running, needs_reprediction: server.needs && !!server.prediction, proposal_stale: false });
  const job = (id) => ({ id, kind: 'PROPOSAL_REGENERATION', status: 'RUNNING', stage: 'PROPOSAL_GENERATION', result: null, error: null });
  const fetcher = async (url, init) => {
    const path = new URL(String(url), 'http://x').pathname, method = init?.method ?? 'GET';
    if (path.endsWith('/incidents/100') && method === 'GET') return ok(incident());
    if (path.endsWith('/predictions') && method === 'POST') {
      server.posts.push('predict'); server.prediction = '42'; server.running = 'op-p'; server.done = false;
      return ok({ id: 'op-1', kind: 'PREDICTION', status: 'SUCCEEDED', stage: 'COMMIT', result: { prediction_id: '42', proposal_operation_id: 'op-p' }, error: null }, 202);
    }
    if (path.endsWith('/proposal-regenerations')) {
      if (server.stalePerimeter) { server.retries++; server.needs = true; return Response.json({ error: { code: 'STALE_PERIMETER', message: '새 화선' }, meta: { request_id: 'x' } }, { status: 409 }); }
      server.posts.push(JSON.parse(init.body)); server.retries++; server.running = 'op-r'; server.done = false; server.outcome = 'SUCCEEDED';
      return ok(job('op-r'), 202);
    }
    if (path.includes('/operations/')) {
      const id = path.split('/').at(-1);
      if (hidden) { if (server.done) { server.running = null; server.proposal = '77'; } return Response.json({ error: { code: 'NOT_FOUND', message: '없음' }, meta: { request_id: 'x' } }, { status: 404 }); }
      if (!server.done) return ok(job(id));
      server.running = null;
      if (server.outcome === 'FAILED') return ok({ ...job(id), status: 'FAILED', error: { code: 'PROPOSAL_FAILED', message: 'GPU 서버에 닿지 못했습니다' } });
      server.proposal = '77';
      return ok({ ...job(id), status: 'SUCCEEDED', result: { proposal_id: '77', prediction_id: '42', correction_id: null } });
    }
    if (path.endsWith('/predictions/42')) return ok({ ...f['PRED-02'], id: '42' });
    if (path.endsWith('/predictions/42/slices')) return ok({ ...f['PRED-03'], features: f['PRED-03'].features.map(x => ({ ...x, properties: { ...x.properties, prediction_id: '42' } })) });
    if (path.endsWith('/predictions/42/risk')) return ok({ ...f['RISK-01'], prediction_id: '42' });
    if (path.endsWith('/predictions/42/weather')) return ok(f['PRED-04']);
    if (path.endsWith('/proposals/latest')) return ok(server.proposal ? proposal(server.proposal) : null);
    if (path.endsWith('/proposals/77')) return ok(proposal('77'));
    return base(url, init);
  };
  const source = createApiDataSource(createApiClient({ mode: 'http', fetcher }));
  let ready = 0;
  const host = { S, state, IS: (id = state.incId) => state.inc[id] ??= {}, refresh() {}, loginBusy() {}, loginError(m) { if (m) assert.fail(m); }, message: (kind, m) => said.push(m), busy(v) { state.predicting = v; }, chatBusy() {}, notice: m => notices.push(m), baseAt() {}, selected(id) { state.incId = id; }, enter(a) { state.role = a.role; }, answer() {}, predictionReady() { ready++; } };
  const bridge = createScreenBridge(source, host, { followIntervalMs: 20 });
  await bridge.login();
  return { bridge, state, server, notices, elements, ready: () => ready, close() { bridge.dispose(); globalThis.document = previous; } };
}

test('prediction and risk are shown while the proposal is still being written; repeat actions wait for it', async () => {
  const s = await setup();
  try {
    await s.bridge.predict();
    assert.equal(s.state.predicting, false); assert.equal(s.ready(), 1);
    assert.equal(s.bridge.predictionId(), '42'); assert.ok(s.bridge.riskData()); assert.ok(s.state.inc['100'].predicted);
    assert.equal(s.bridge.proposalJob().state, 'running');
    assert.equal(s.state.inc['100'].currentRun, null);
    await s.bridge.predict(); await s.bridge.end();
    assert.deepEqual(s.server.posts, ['predict']);
    assert.ok(s.notices.some(m => m.includes('다시 예측')) && s.notices.some(m => m.includes('종료')));
    s.state.inc['100'].t = 5; s.server.done = true;
    await until(() => s.state.inc['100'].currentRun?.apiId === '77');
    assert.equal(s.bridge.proposalJob().state, 'none');
    assert.equal(s.state.inc['100'].currentRun.apiId, '77');
    assert.equal(s.state.inc['100'].t, 5, 'playback time is kept when the proposal arrives');
  } finally { s.close(); }
});

test('a failed proposal keeps the prediction and can be generated again', async () => {
  const s = await setup({ first: 'FAILED' });
  try {
    await s.bridge.predict(); s.server.done = true;
    await until(() => s.bridge.proposalJob().state === 'failed');
    assert.equal(s.bridge.predictionId(), '42'); assert.equal(s.bridge.predictionFailure(), undefined);
    await s.bridge.retryProposal();
    assert.equal(s.server.retries, 1);
    assert.deepEqual(s.server.posts.at(-1), { expected_prediction_id: '42', situation_revision: 'rev-0' });
    assert.equal(s.bridge.proposalJob().state, 'running');
    s.server.done = true;
    await until(() => s.state.inc['100'].currentRun?.apiId === '77');
    assert.equal(s.bridge.proposalJob().state, 'none');
  } finally { s.close(); }
});

test('after a reload the running job is resumed, and a prediction left without a proposal offers generation', async () => {
  const s = await setup();
  try {
    Object.assign(s.server, { prediction: '42', running: 'op-p' });
    await s.bridge.select('100');
    await until(() => s.bridge.proposalJob().state === 'running');
    s.server.done = true;
    await until(() => s.state.inc['100'].currentRun?.apiId === '77');
    Object.assign(s.server, { proposal: null, running: null });
    await s.bridge.select('100');
    assert.equal(s.bridge.proposalJob().state, 'failed'); assert.equal(s.bridge.proposalJob().reprediction, false);
  } finally { s.close(); }
});

test('a newer perimeter asks for re-prediction instead of regenerating', async () => {
  const s = await setup({ needs: true });
  try {
    Object.assign(s.server, { prediction: '42' });
    await s.bridge.select('100');
    assert.deepEqual([s.bridge.proposalJob().state, s.bridge.proposalJob().reprediction], ['failed', true]);
  } finally { s.close(); }
});

test('a job that ended between the incident and the operation read does not stay 준비 중', async () => {
  for (const [outcome, expected] of [['SUCCEEDED', 'none'], ['FAILED', 'failed']]) {
    const s = await setup({ first: outcome });
    try {
      Object.assign(s.server, { prediction: '42', running: 'op-p', done: true });
      await s.bridge.select('100');
      await until(() => s.bridge.proposalJob().state === expected);
      if (expected === 'none') assert.equal(s.state.inc['100'].currentRun.apiId, '77');
      else { // 실패한 작업을 이어받지 않고 첫 클릭에 새 예측을 시작한다
        await s.bridge.predict(); assert.deepEqual(s.server.posts, ['predict']); assert.equal(s.bridge.predictionFailure(), undefined);
      }
    } finally { s.close(); }
  }
});

test('a job requested by another commander (404) clears when it ends', async () => {
  const s = await setup({ hidden: true });
  try {
    Object.assign(s.server, { prediction: '42', running: 'op-p' });
    await s.bridge.select('100');
    await until(() => s.bridge.proposalJob().state === 'running');
    Object.assign(s.server, { running: null, proposal: '77' });
    await until(() => s.state.inc['100'].currentRun?.apiId === '77');
    assert.equal(s.bridge.proposalJob().state, 'none');
  } finally { s.close(); }
});

test('re-prediction works on the first click after a failed proposal', async () => {
  const s = await setup({ first: 'FAILED' });
  try {
    await s.bridge.predict(); s.server.done = true;
    await until(() => s.bridge.proposalJob().state === 'failed');
    await s.bridge.predict();
    assert.deepEqual(s.server.posts, ['predict', 'predict']); assert.equal(s.bridge.predictionFailure(), undefined);
  } finally { s.close(); }
});

test('retry rejected because a new perimeter arrived turns into the re-prediction notice', async () => {
  const s = await setup({ first: 'FAILED' });
  try {
    await s.bridge.predict(); s.server.done = true;
    await until(() => s.bridge.proposalJob().state === 'failed');
    Object.assign(s.server, { stalePerimeter: true, needs: true });
    await s.bridge.retryProposal();
    assert.deepEqual(s.bridge.proposalJob(), { state: 'failed', reprediction: true });
  } finally { s.close(); }
});

test('a finished proposal does not clear the open conversation', async () => {
  const s = await setup();
  try {
    await s.bridge.predict();
    const log = { textContent: '보내는 중인 질문' }; s.elements.set('chat-log', log);
    s.server.done = true;
    await until(() => s.state.inc['100'].currentRun?.apiId === '77');
    await new Promise(r => setTimeout(r, 30));
    assert.equal(log.textContent, '보내는 중인 질문');
  } finally { s.close(); }
});

test('proposal job panel shows one short line: preparing, failed with retry, re-prediction', () => {
  const text = job => proposalJobHTML(job).replace(/<[^>]+>/g, '');
  assert.equal(proposalJobHTML({ state: 'none', reprediction: false }), '');
  assert.equal(text({ state: 'running', reprediction: false }), '대응 제안 준비 중');
  const failed = proposalJobHTML({ state: 'failed', reprediction: false });
  assert.match(failed, /btn-proposal-retry/); assert.equal(text({ state: 'failed', reprediction: false }), '대응 제안을 만들지 못했습니다다시 생성');
  const again = proposalJobHTML({ state: 'failed', reprediction: true });
  assert.match(again, /다시 예측이 필요/); assert.doesNotMatch(again, /btn-proposal-retry/);
});
