import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/api/client.ts';
import { createFixtures } from '../src/api/mock/fixtures.ts';

const credentials = {
  body: {
    login_id: 'test-user',
    password: ' test password ',
    role: 'COMMANDER',
  },
};
const envelope = (data) =>
  Response.json({ data, meta: { request_id: 'auth-test' } });
const unauthorized = () =>
  Response.json(
    {
      error: {
        code: 'TOKEN_EXPIRED',
        message: '다시 로그인하십시오.',
        fields: [],
      },
      meta: { request_id: 'auth-expired' },
    },
    { status: 401 },
  );

test('AUTH-01 validates required fields before saving a token; AUTH-02 validates User', async () => {
  for (const field of ['access_token', 'token_type', 'expires_in', 'user']) {
    const data = structuredClone(createFixtures()['AUTH-01']);
    delete data[field];
    const client = createApiClient({
      mode: 'http',
      fetcher: async () => envelope(data),
    });
    await assert.rejects(
      client.request('AUTH-01', credentials),
      (error) =>
        error.kind === 'protocol' &&
        error.requestId === 'auth-test' &&
        error.message.includes('[필요한 정보:') &&
        error.message.includes(field),
    );
    assert.equal(client.getAccessToken(), null);
  }
  for (const field of [
    'id',
    'login_id',
    'name',
    'organization',
    'role',
    'admin_area_id',
  ]) {
    const user = structuredClone(createFixtures()['AUTH-02']);
    delete user[field];
    const client = createApiClient({
      mode: 'http',
      fetcher: async () => envelope(user),
    });
    await assert.rejects(
      client.request('AUTH-02'),
      (error) => error.kind === 'protocol' && error.message.includes(field),
    );
  }
  for (const expires_in of [0, -1, 0.5, '1800']) {
    const data = { ...createFixtures()['AUTH-01'], expires_in };
    const client = createApiClient({
      mode: 'http',
      fetcher: async () => envelope(data),
    });
    await assert.rejects(client.request('AUTH-01', credentials), /expires_in/);
  }
});

test('password whitespace is preserved and only protected requests receive Bearer JWT', async () => {
  const seen = [];
  const fixtures = createFixtures();
  const client = createApiClient({
    mode: 'http',
    fetcher: async (url, init) => {
      seen.push({ url, init });
      return url.endsWith('/login')
        ? envelope(fixtures['AUTH-01'])
        : envelope(fixtures['AUTH-02']);
    },
  });
  await client.request('AUTH-01', credentials);
  await client.request('AUTH-02');
  assert.equal(
    JSON.parse(seen[0].init.body).password,
    credentials.body.password,
  );
  assert.equal(seen[0].init.headers.get('Authorization'), null);
  assert.equal(
    seen[1].init.headers.get('Authorization'),
    `Bearer ${fixtures['AUTH-01'].access_token}`,
  );
  assert.equal(seen[1].init.body, undefined);
});

test('concurrent 401s clear identity and notify once for the same session', async () => {
  let notices = 0;
  const replies = [];
  const client = createApiClient({
    mode: 'http',
    onUnauthorized: () => notices++,
    fetcher: () => new Promise((resolve) => replies.push(resolve)),
  });
  client.setAccessToken('expired-session');
  const first = client.request('AUTH-02');
  const second = client.request('AUTH-02');
  replies.forEach((resolve) => resolve(unauthorized()));
  const results = await Promise.allSettled([first, second]);
  assert.ok(
    results.every(
      (result) =>
        result.status === 'rejected' && result.reason.code === 'TOKEN_EXPIRED',
    ),
  );
  assert.equal(notices, 1);
  assert.equal(client.getAccessToken(), null);
});

for (const status of [204, 401])
  test(`late logout ${status} cannot clear a newer session even if JWT text repeats`, async () => {
    let reply;
    const client = createApiClient({
      mode: 'http',
      fetcher: () =>
        new Promise((resolve) => {
          reply = resolve;
        }),
    });
    client.setAccessToken('same-jwt');
    const pending = client.request('AUTH-03');
    client.setAccessToken('same-jwt');
    reply(status === 204 ? new Response(null, { status }) : unauthorized());
    await pending.catch(() => {});
    assert.equal(client.getAccessToken(), 'same-jwt');
  });

test('logout or disposal while login is in flight cannot restore its stale token', async () => {
  let reply;
  const client = createApiClient({
    mode: 'http',
    fetcher: () =>
      new Promise((resolve) => {
        reply = resolve;
      }),
  });
  const pending = client.request('AUTH-01', credentials);
  client.clearSession();
  reply(envelope(createFixtures()['AUTH-01']));
  await assert.rejects(pending, (error) => error.code === 'SESSION_CHANGED');
  assert.equal(client.getAccessToken(), null);
});
