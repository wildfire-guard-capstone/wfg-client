import { test, expect, type Page } from '@playwright/test';
import { createMockFetch } from '../../src/api/mock/transport';
import { screenMockOptions } from '../../src/api/screen/mock-seed';
import { createScenario } from '../../src/data/scenario';
import { calculateRisk } from '../../src/models/risk';

async function authServer(
  page: Page,
  options: {
    expiresIn?: number;
    logoutFails?: boolean;
    meFails?: boolean;
    holdLogin?: boolean;
  } = {},
) {
  const scenario = createScenario();
  const fetcher = createMockFetch({
    ...screenMockOptions(
      scenario,
      calculateRisk(
        scenario.risk_model,
        scenario.incidents[0]!.risk_demo_runs![0]!.values,
        [],
      ),
    ),
    latencyMs: 0,
  });
  const calls: {
    path: string;
    authorization?: string;
    body: Record<string, unknown> | null;
  }[] = [];
  let releaseLogin!: () => void;
  const loginGate = new Promise<void>((resolve) => {
    releaseLogin = resolve;
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    calls.push({
      path,
      authorization: request.headers().authorization,
      body: request.postDataJSON(),
    });
    if (path.endsWith('/auth/login') && options.holdLogin) await loginGate;
    if (options.logoutFails && path.endsWith('/auth/logout')) {
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: 'INTERNAL_ERROR',
            message: '시험 서버 오류',
            fields: [],
          },
          meta: { request_id: 'logout-test' },
        },
      });
      return;
    }
    if (options.meFails && path.endsWith('/auth/me')) {
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: 'INTERNAL_ERROR',
            message: '일시적인 서버 오류',
            fields: [],
          },
          meta: { request_id: 'me-test' },
        },
      });
      return;
    }
    const response = await fetcher(request.url(), {
      method: request.method(),
      headers: request.headers(),
      ...(request.postData() ? { body: request.postData()! } : {}),
    });
    if (path.endsWith('/auth/login') && options.expiresIn) {
      const payload = await response.json();
      payload.data.expires_in = options.expiresIn;
      await route.fulfill({ status: response.status, json: payload });
    } else
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
  });
  return { calls, releaseLogin };
}

test('login click/Enter duplicates are blocked without changing the form; logout clears session', async ({
  page,
}) => {
  const { calls, releaseLogin } = await authServer(page, { holdLogin: true });
  await page.goto('/');
  const form = page.locator('.lg-form');
  const before = await form.boundingBox();
  await page.locator('#login-btn').click();
  await expect(page.locator('#login-btn')).toBeDisabled();
  await expect(page.locator('#login-btn')).toHaveAttribute('aria-busy', 'true');
  expect(await form.boundingBox()).toEqual(before);
  await page.locator('#login-id').press('Enter');
  releaseLogin();
  await expect(page.locator('#login-overlay')).toBeHidden();
  expect(
    calls.filter((call) => call.path.endsWith('/auth/login')),
  ).toHaveLength(1);
  expect(
    calls.find((call) => call.path.endsWith('/auth/login'))!.authorization,
  ).toBeUndefined();
  expect(
    calls.find((call) => call.path.endsWith('/auth/me'))!.authorization,
  ).toMatch(/^Bearer /);
  await page
    .getByRole('button', { name: '로그아웃', exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.locator('#login-overlay')).toBeVisible();
  await expect(page.locator('#login-btn')).toBeEnabled();
  expect(await page.evaluate(() => window.__mock.state.user)).toBeNull();
  expect(
    calls.filter((call) => call.path.endsWith('/auth/logout')),
  ).toHaveLength(1);
  expect(
    await page.evaluate(() => [
      localStorage.getItem('wfg-api-access-token'),
      sessionStorage.getItem('wfg-api-access-token'),
      sessionStorage.getItem('wf-mock-token'),
    ]),
  ).toEqual([null, null, null]);
});

test('expires_in returns to original login without sending AUTH-03', async ({
  page,
}) => {
  const { calls } = await authServer(page, { expiresIn: 5 });
  await page.clock.install();
  await page.goto('/');
  await page.locator('#login-btn').click();
  await expect(page.locator('#login-overlay')).toBeHidden();
  await page.clock.fastForward(5_001);
  await expect(page.locator('#login-overlay')).toBeVisible();
  await expect(page.locator('#login-err')).toContainText('인증 토큰 만료');
  expect(await page.evaluate(() => window.__mock.state.user)).toBeNull();
  expect(
    calls.filter((call) => call.path.endsWith('/auth/logout')),
  ).toHaveLength(0);
  await page.locator('#login-btn').click();
  await expect(page.locator('#login-overlay')).toBeHidden();
});

test('AUTH-02 server failure stays an error and permits retry; it is never missing data', async ({
  page,
}) => {
  await authServer(page, { meFails: true });
  await page.goto('/');
  await page.locator('#login-btn').click();
  await expect(page.locator('#login-err')).toContainText('일시적인 서버 오류');
  await expect(page.locator('#login-err')).not.toContainText('[필요한 정보:');
  await expect(page.locator('#login-btn')).toBeEnabled();
  await expect(page.locator('#login-overlay')).toBeVisible();
});

test('failed logout logging still returns to login and permits the next login', async ({
  page,
}) => {
  const { calls } = await authServer(page, { logoutFails: true });
  await page.goto('/');
  await page.locator('#login-btn').click();
  await expect(page.locator('#login-overlay')).toBeHidden();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.locator('#login-overlay')).toBeVisible();
  await expect(page.locator('#login-btn')).toBeEnabled();
  await page.locator('#login-btn').click();
  await expect(page.locator('#login-overlay')).toBeHidden();
  expect(
    calls.filter((call) => call.path.endsWith('/auth/login')),
  ).toHaveLength(2);
});
