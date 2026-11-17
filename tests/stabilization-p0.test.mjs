import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createApiClient,
  createApiDataSource,
  createFixtures,
  createMockFetch,
} from '../src/api/index.ts';
import { createScreenBridge } from '../src/api/screen/bridge.ts';
import {
  displayRing,
  incidentView,
  proposalView,
  riskView,
  UI_TO_API_ITEM,
} from '../src/api/screen/adapters.ts';
import {
  incidentDetailsView,
  villageEvacuated,
} from '../src/api/screen/incidents.ts';
import { validateProposal } from '../src/api/screen/proposals.ts';
import { createScenario } from '../src/data/scenario.ts';
const codes = [
  ...Array.from({ length: 6 }, (_, i) => `S${i + 1}`),
  ...Array.from({ length: 6 }, (_, i) => `E${i + 1}`),
];

test('P0 B: all twelve API codes, names, states, evidence and changes survive without legacy slots', () => {
  const raw = createFixtures()['PROP-03'];
  raw.items.forEach((item, i) => {
    item.state = ['GENERATED', 'PARTIAL', 'FAILED', 'NOT_TRIGGERED'][i % 4];
    item.name = `서버 ${item.item_code}`;
    item.change_type = 'CHANGED';
  });
  const view = proposalView(raw, createScenario(), null);
  assert.deepEqual(
    view.blocks.map((b) => b.id),
    codes,
  );
  assert.deepEqual(
    UI_TO_API_ITEM,
    Object.fromEntries(codes.map((c) => [c, c])),
  );
  for (const item of raw.items) {
    const block = view.blocks.find((b) => b.id === item.item_code);
    assert.equal(block.apiItemCode, item.item_code);
    assert.equal(block.name, item.name);
    assert.equal(block.apiState, item.state);
    assert.equal(block.evidence.length, item.evidence.length);
    assert.ok(view.changed.includes(item.item_code));
  }
  assert.equal(proposalView(null, createScenario(), null).blocks.length, 0);
});

test('P0 B: incomplete or duplicate 6+6 contracts fail instead of inventing a missing proposal', () => {
  for (const mutate of [
    (p) => p.items.pop(),
    (p) => (p.items[11].item_code = 'E5'),
    (p) => (p.items[11].axis = 'SUPPRESSION'),
    (p) => (p.items[0].state = 'UNKNOWN'),
  ]) {
    const raw = createFixtures()['PROP-03'];
    mutate(raw);
    assert.throws(
      () => validateProposal(raw),
      (e) => e.kind === 'protocol',
    );
  }
});

test('P0 C: aspect distribution strings have no degree mode/unit; numeric zero and null stay distinct', () => {
  const raw = createFixtures()['RISK-01'];
  const factor = raw.factors.find((f) => f.code === 'aspect');
  for (const value of ['서~북서·평지 49% · 북동~동 51%', 0, null]) {
    factor.raw_value = value;
    const v = riskView(raw, createScenario()).vars.find(
      (v) => v.key === 'aspect',
    );
    assert.equal(v.value, value);
    assert.equal(v.mode, typeof value === 'number' ? 'aspect' : '');
    assert.equal(v.unit, typeof value === 'number' ? '°' : '');
  }
});

test('P0 D: evacuation preserves true, false and absent by real village ID, including offscreen villages', () => {
  const raw = createFixtures()['INC-03'];
  raw.situation.villages = {
    1024: { evacuated: true },
    1025: { evacuated: false },
    1026: { evac_order: true },
  };
  const state = incidentView(raw, []).evacuation_state;
  assert.deepEqual(state.evacuated_by_id, { 1024: true, 1025: false });
  assert.deepEqual(state.completed_villages, ['1024']);
  assert.equal(Object.hasOwn(state.evacuated_by_id, '1026'), false);
  raw.situation.villages = {};
  assert.deepEqual(incidentView(raw, []).evacuation_state.evacuated_by_id, {});
});

async function reporter({
  refreshFails = false,
  writeFails = false,
  staleRead = false,
} = {}) {
  const f = createFixtures(),
    S = createScenario();
  const a = {
    ...f['INC-03'],
    latest_prediction_id: null,
    latest_proposal_id: null,
  };
  const b = {
    ...a,
    id: '200',
    name: '다른 모의 산불',
    current_perimeter_id: '31',
  };
  const user = {
    ...f['AUTH-02'],
    id: '3',
    login_id: 'mock-reporter',
    role: 'REPORTER',
  };
  const fields = new Map(
    Object.entries({
      'login-id': 'mock-reporter',
      'login-pw': 'mock-password',
      'login-role': 'reporter',
    }).map(([id, value]) => [id, { value, disabled: false, textContent: '' }]),
  );
  const previous = globalThis.document;
  globalThis.document = {
    getElementById: (id) => {
      if (!fields.has(id))
        fields.set(id, { value: '', disabled: false, textContent: '' });
      return fields.get(id);
    },
  };
  const state = {
      role: null,
      incId: '100',
      inc: {},
      events: [],
      predicting: false,
      rep: {},
    },
    notices = [];
  let release,
    arrive,
    writes = 0,
    businessWrites = 0,
    committed = false;
  const gate = new Promise((r) => (release = r)),
    entered = new Promise((r) => (arrive = r));
  const mock = createMockFetch({
    latencyMs: 0,
    seed: {
      incidents: [a, b],
      perimeters: [
        f['PER-01'].items[0],
        { ...f['PER-01'].items[0], id: '31', incident_id: '200' },
      ],
      accounts: [{ user, password: 'mock-password' }],
    },
  });
  const source = createApiDataSource(
    createApiClient({
      mode: 'http',
      fetcher: async (url, init) => {
        const path = new URL(url, 'http://test.invalid').pathname;
        if (init.method === 'POST' && !path.includes('/auth/'))
          businessWrites++;
        if (
          init.method === 'POST' &&
          (path.endsWith('/perimeters') ||
            /\/perimeters\/[^/]+\/corrections$/.test(path))
        ) {
          writes++;
          arrive();
          await gate;
          if (writeFails)
            return Response.json(
              {
                error: {
                  code: 'INVALID_GEOMETRY',
                  message: '잘못된 도형',
                  fields: [],
                },
                meta: { request_id: 'rejected' },
              },
              { status: 422 },
            );
          const response = await mock(url, init);
          committed = response.ok;
          return response;
        }
        if (committed && staleRead && path === '/api/v1/incidents/100')
          return Response.json({ data: a, meta: { request_id: 'stale-read' } });
        if (committed && refreshFails && path === '/api/v1/incidents/100')
          throw new Error('후속 조회 연결 실패');
        return mock(url, init);
      },
    }),
  );
  const form = (id) => {
    const raw = id === '200' ? b : a,
      view = incidentDetailsView(raw, []);
    const local = (s) =>
      s
        ? new Date(Date.parse(s) - new Date(s).getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16)
        : '';
    Object.assign(state.rep, {
      editingId: id,
      drawMode: false,
      perimMode: 'new',
      intake: [],
      ring: displayRing(f['PER-01'].items[0].geometry),
    });
    for (const [id, value] of Object.entries({
      'rep-start': local(raw.started_at),
      'rep-report': local(raw.reported_at),
      'rep-observed': '2026-11-16T09:00',
      'rep-name': raw.name,
      'rep-addr': raw.address,
      'rep-text': view.report_text,
      'rep-corg': view.caller.org,
      'rep-cname': view.caller.name,
      'rep-cphone': view.caller.phone,
      'rep-lng': raw.ignition_point.coordinates[0],
      'rep-lat': raw.ignition_point.coordinates[1],
    }))
      document.getElementById(id).value = String(value);
  };
  const bridge = createScreenBridge(source, {
    S,
    state,
    IS: (id = state.incId) => (state.inc[id] ??= {}),
    refresh() {},
    enter: (a) => (state.role = a.role),
    leave() {},
    selected: (id) => (state.incId = id),
    reportForm: form,
    admin() {},
    notice: (m) => notices.push(m),
    loginBusy() {},
    loginError: (m) => {
      if (m) assert.fail(m);
    },
    baseAt() {},
    busy() {},
    chatBusy() {},
    message() {},
    answer() {},
  });
  await bridge.login();
  form(state.incId);
  return {
    bridge,
    state,
    S,
    notices,
    entered,
    release,
    get writes() {
      return writes;
    },
    get businessWrites() {
      return businessWrites;
    },
    retryReads() {
      refreshFails = false;
    },
    close() {
      release();
      bridge.dispose();
      globalThis.document = previous;
    },
  };
}

for (const mode of ['new', 'correct'])
  test(`P0 A: late ${mode} save updates its incident, never the newer selection; duplicate submit stays blocked`, async () => {
    const h = await reporter();
    try {
      h.state.rep.perimMode = mode;
      const pending = h.bridge.saveReport();
      await h.entered;
      await h.bridge.saveReport();
      await h.bridge.select('200');
      h.release();
      await pending;
      assert.equal(h.state.incId, '200');
      assert.equal(h.state.rep.editingId, '200');
      assert.equal(h.bridge.current('100').current_perimeter_version, 2);
      assert.equal(h.bridge.current('200').current_perimeter_version, 1);
      assert.equal(h.writes, 1);
    } finally {
      h.close();
    }
  });

test('P0 A: confirmed save followed by failed refresh is reported as saved, not rejected or resubmitted', async () => {
  const h = await reporter({ refreshFails: true });
  try {
    h.release();
    await h.bridge.saveReport();
    assert.ok(h.notices.some((m) => /저장.*조회.*실패/.test(m)));
    assert.equal(h.bridge.current('100').current_perimeter_version, 2);
    await h.bridge.saveReport();
    assert.equal(h.writes, 1);
    assert.equal(h.state.incId, '100');
  } finally {
    h.close();
  }
});

test('P0 A: rejected write preserves data and is never labelled saved', async () => {
  const h = await reporter({ writeFails: true });
  try {
    h.release();
    await h.bridge.saveReport();
    assert.equal(h.bridge.current('100').current_perimeter_version, 1);
    assert.ok(h.notices.some((m) => m.includes('잘못된 도형')));
    assert.ok(h.notices.every((m) => !m.includes('저장됐')));
  } finally {
    h.close();
  }
});

test('P0 A: a new draft or a newer return-selection is not reset by the old save', async () => {
  for (const draft of [true, false]) {
    const h = await reporter();
    try {
      const pending = h.bridge.saveReport();
      await h.entered;
      if (draft) {
        h.state.rep.editingId = null;
        document.getElementById('rep-addr').value = '새 보고 초안';
      } else {
        await h.bridge.select('200');
        await h.bridge.select('100');
        h.state.inc['100'].t = 7;
      }
      h.release();
      await pending;
      assert.equal(h.state.incId, '100');
      if (draft) {
        assert.equal(h.state.rep.editingId, null);
        assert.equal(document.getElementById('rep-addr').value, '새 보고 초안');
      } else assert.equal(h.state.inc['100'].t, 7);
    } finally {
      h.close();
    }
  }
});
test('P0 A: reloading a confirmed save unblocks only a new submission based on the refreshed version', async () => {
  const h = await reporter({ refreshFails: true });
  try {
    h.release();
    await h.bridge.saveReport();
    await h.bridge.saveReport();
    assert.equal(h.writes, 1);
    h.retryReads();
    await h.bridge.select('100');
    await h.bridge.saveReport();
    assert.equal(h.writes, 2);
    assert.equal(h.bridge.current('100').current_perimeter_version, 3);
  } finally {
    h.close();
  }
});
test('P0 D: a matching display name never overwrites a village-ID true/false/unknown fact', () => {
  const raw = createFixtures()['INC-03'];
  raw.situation.villages = {
    1024: { evacuated: true },
    1025: { evacuated: false },
  };
  const view = incidentView(raw, []);
  assert.equal(villageEvacuated(view, '1024', '동일 이름'), true);
  assert.equal(villageEvacuated(view, '1025', '동일 이름'), false);
  assert.equal(villageEvacuated(view, '1026', '동일 이름'), undefined);
});

test('P0 A: a stale read cannot roll back the version confirmed by a successful save', async () => {
  const h = await reporter({ staleRead: true });
  try {
    h.release();
    await h.bridge.saveReport();
    assert.equal(h.bridge.current('100').current_perimeter_version, 2);
    assert.ok(h.notices.some((m) => /저장.*조회.*실패/.test(m)));
    await h.bridge.saveReport();
    assert.equal(h.writes, 1);
  } finally {
    h.close();
  }
});
test('P0 A: an unknown editing ID is never mistaken for a new incident', async () => {
  const h = await reporter();
  try {
    h.state.rep.editingId = '999';
    h.release();
    await h.bridge.saveReport();
    assert.equal(h.businessWrites, 0);
  } finally {
    h.close();
  }
});
