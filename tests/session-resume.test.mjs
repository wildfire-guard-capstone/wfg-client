import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, createApiDataSource, createMockFetch } from '../src/api/index.ts';
import { createMemoryTokenStore } from '../src/api/session.ts';
import { createScreenBridge } from '../src/api/screen/bridge.ts';
import { createScenario } from '../src/data/scenario.ts';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function page(fetcher, tokenStore, onEnter) {
  const fields = new Map(Object.entries({ 'login-id': 'mock-admin', 'login-pw': 'mock-password', 'login-role': 'admin' }).map(([k, value]) => [k, { value }]));
  globalThis.document = { getElementById: (id) => fields.get(id) ?? null, querySelectorAll: () => [] };
  const source = createApiDataSource(createApiClient({ mode: 'http', fetcher, tokenStore }));
  const state = { role: null, incId: '100', inc: {}, events: [] };
  const bridge = createScreenBridge(source, {
    S: createScenario(), state, IS: () => ({}), loginBusy() {}, loginError(m) { if (m) assert.fail(m); }, notice() {},
    enter: (a) => { state.role = a.role; onEnter?.(a); }, admin() {}, busy() {}, chatBusy() {}, leave() { state.role = null; },
    issued() {}, modal() {},
  });
  return { bridge, state, source };
}

test('새로고침: 저장된 토큰이 유효하면 로그인 화면 없이 같은 계정으로 들어간다', async () => {
  const previous = globalThis.document;
  const prevStorage = globalThis.sessionStorage;
  globalThis.sessionStorage = memoryStorage();
  try {
    const fetcher = createMockFetch({ latencyMs: 0 });
    const store = createMemoryTokenStore(); // 같은 탭의 sessionStorage 역할
    const first = page(fetcher, store);
    await first.bridge.login();
    assert.equal(first.state.role, 'admin');
    assert.ok(store.get());
    first.bridge.dispose();

    const entered = [];
    const second = page(fetcher, store, (a) => entered.push(a.role));
    await second.bridge.resume();
    assert.equal(second.state.role, 'admin');
    assert.deepEqual(entered, ['admin']);

    await second.bridge.logout();
    assert.equal(store.get(), null);
    second.bridge.dispose();

    const third = page(fetcher, store);
    await third.bridge.resume();
    assert.equal(third.state.role, null, '로그아웃 뒤에는 복원하지 않음');
    third.bridge.dispose();
  } finally {
    globalThis.document = previous;
    globalThis.sessionStorage = prevStorage;
  }
});

test('새로고침: 만료됐거나 무효인 토큰은 조용히 지우고 로그인 화면에 머문다', async () => {
  const previous = globalThis.document;
  const prevStorage = globalThis.sessionStorage;
  globalThis.sessionStorage = memoryStorage();
  try {
    const fetcher = createMockFetch({ latencyMs: 0 });
    const store = createMemoryTokenStore('not-a-real-token');
    const p = page(fetcher, store);
    await p.bridge.resume();
    assert.equal(p.state.role, null);
    assert.equal(store.get(), null);
    p.bridge.dispose();

    const store2 = createMemoryTokenStore('any');
    globalThis.sessionStorage.setItem('wfg-api-access-token-expires-at', String(Date.now() - 1000));
    const q = page(fetcher, store2);
    await q.bridge.resume();
    assert.equal(q.state.role, null);
    assert.equal(store2.get(), null);
    q.bridge.dispose();
  } finally {
    globalThis.document = previous;
    globalThis.sessionStorage = prevStorage;
  }
});
