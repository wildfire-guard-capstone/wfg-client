import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthSession, AUTH_STATE_KEY } from '../src/api/auth-session.ts';
import { demoAccount } from '../src/api/demo-accounts.ts';

function storage() {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k), data };
}
test('tab session restores JWT, original expiry and same-user view without passwords or stored roles', () => {
  const store = storage(), session = createAuthSession(store);
  session.tokenStore.set('test-token'); session.remember('7', 60);
  session.rememberView('2', 'proposal');
  const before = JSON.parse(store.getItem(AUTH_STATE_KEY));
  const restored = createAuthSession(store);
  assert.equal(restored.tokenStore.get(), 'test-token');
  assert.deepEqual(restored.viewFor('7'), { incidentId: '2', tab: 'proposal' });
  assert.equal(restored.viewFor('8'), undefined);
  assert.equal(JSON.parse(store.getItem(AUTH_STATE_KEY)).expiresAt, before.expiresAt);
  assert.deepEqual(Object.keys(before).sort(), ['expiresAt', 'userId', 'view']);
  assert.ok(restored.remainingSeconds() > 0 && restored.remainingSeconds() <= 60);
  restored.tokenStore.clear();
  assert.equal(createAuthSession(store).tokenStore.get(), null);
  assert.equal(store.getItem(AUTH_STATE_KEY), null);
});
test('new login discards previous-user navigation and storage removals do not revive memory JWT', () => {
  const store = storage(), session = createAuthSession(store);
  session.tokenStore.set('one'); session.remember('1', 30); session.rememberView('3', 'proposal');
  session.remember('2', 30);
  assert.equal(session.viewFor('2'), undefined);
  store.removeItem('wfg-api-access-token');
  assert.equal(session.tokenStore.get(), null);
});
test('expired, missing or malformed auth metadata cannot extend a session', () => {
  const store = storage();
  for (const data of ['invalid-json', 'null', '42', '"bad"', '{}', JSON.stringify({userId:'1',expiresAt:Date.now()-1})]) {
    store.setItem(AUTH_STATE_KEY, data);
    const session = createAuthSession(store);
    assert.equal(session.remainingSeconds(), 0);
    session.rememberView('2', 'status');
  }
});
test('disabled browser storage retains current-page login only', () => {
  const blocked = { getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();} };
  const session = createAuthSession(blocked);
  session.tokenStore.set('test-only'); session.remember('1', 30);
  assert.equal(session.tokenStore.get(), 'test-only');
  session.tokenStore.clear(); assert.equal(session.tokenStore.get(), null);
  assert.equal(createAuthSession(blocked).tokenStore.get(), null);
});
test('explicit public demo mode maps exactly four accounts; disabled mode never supplies a password', () => {
  const env = { VITE_DEMO_ACCOUNTS: 'true', VITE_DEMO_PASSWORD: 'synthetic-demo-password' };
  for (const [role,id] of Object.entries({reporter:'demo_rep',admin:'demo_admin',commander:'demo_cmd',viewer:'demo_view'})) {
    assert.deepEqual(demoAccount(env,role), {loginId:id,password:env.VITE_DEMO_PASSWORD});
    assert.equal(demoAccount({...env,VITE_DEMO_ACCOUNTS:'false'},role), null);
  }
  assert.equal(demoAccount({},'commander'),null);
  assert.equal(demoAccount({VITE_DEMO_ACCOUNTS:'true'},'commander'),null);
  assert.equal(demoAccount(env,'__proto__'),null);
});
