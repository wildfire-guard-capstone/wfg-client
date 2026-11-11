import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, createApiDataSource, createFixtures, createMockFetch } from '../src/api/index.ts';
import { validateAssistant, validateQa } from '../src/api/screen/assistant.ts';
import { createScreenBridge } from '../src/api/screen/bridge.ts';
import { createScenario } from '../src/data/scenario.ts';
test('assistant contract rejects a different incident and distinguishes unsupported input from a correction preview', () => {
  const f = createFixtures(), message = f['AI-02'].items[0];
  assert.equal(validateQa(message, message.incident_id), message);
  assert.throws(() => validateAssistant({ type: 'ANSWER', message }, '999'), e => e.kind === 'protocol');
  assert.equal(validateAssistant({ type: 'UNSUPPORTED', reason: '정정 불가', ignored: [] }, '100').type, 'UNSUPPORTED');
  assert.throws(() => validateAssistant({ type: 'INVENTED' }, '100'), e => e.kind === 'protocol');
});
test('late AI POST response cannot enter another incident or clear its newer chat request', async () => {
  const f = createFixtures(), fields = new Map(Object.entries({ 'login-id': 'mock-commander', 'login-pw': 'mock-password', 'login-role': 'commander', 'chat-input': 'old question' }).map(([key,value]) => [key,{ value, textContent: '' }]));
  const previous = globalThis.document;
  globalThis.document = { getElementById: id => fields.get(id) ?? { textContent: '' } };
  const state = { role: null, incId: '100', inc: {}, events: [], predicting: false };
  let release, started;
  const gate = new Promise(r => release = r), pending = new Promise(r => started = r), answers = [], bodies = [];
  const fetcher = createMockFetch({ latencyMs: 0, scenarios: { 'AI-01': 'assistant-answer' }, seed: {
    incidents: [f['INC-03'], { ...f['INC-03'], id: '200', current_perimeter_id: '31', latest_prediction_id: null, latest_proposal_id: null }],
    perimeters: [f['PER-01'].items[0], { ...f['PER-01'].items[0], id: '31', incident_id: '200' }], accounts: [{ user: f['AUTH-02'], password: 'mock-password' }],
  }});
  const source = createApiDataSource(createApiClient({ mode: 'http', fetcher: async (url, init) => {
    if (init.method === 'POST' && String(url).includes('/assistant/messages')) {
      bodies.push(JSON.parse(init.body));
      if (String(url).includes('/100/')) { started(); await gate; }
    }
    return fetcher(url, init);
  }}));
  const host = { S: createScenario(), state, IS: (id = state.incId) => state.inc[id] ??= {}, refresh() {}, loginBusy() {}, loginError(m) { if(m) assert.fail(m); }, busy(v) { state.predicting=v; }, chatBusy(v) { state.chatBusy=v; }, notice() {}, baseAt() {}, selected(id) { state.incId=id; }, enter(a) { state.role=a.role; }, message() {}, answer(m) { answers.push(m); } };
  const bridge = createScreenBridge(source, host);
  try {
    await bridge.login(); answers.length = 0;
    const old = bridge.sendChat(); await pending;
    await bridge.select('200'); fields.get('chat-input').value = 'new question';
    await bridge.sendChat(); assert.equal(answers.at(-1).incident_id,'200');
    const count = answers.length; release(); await old;
    assert.equal(answers.length,count); assert.equal(state.chatBusy,false);
    assert.equal(bodies.length,2); assert.deepEqual(Object.keys(bodies[1]).sort(),['input_text','item_code','proposal_id']);
  } finally { release(); bridge.dispose(); globalThis.document=previous; }
});
