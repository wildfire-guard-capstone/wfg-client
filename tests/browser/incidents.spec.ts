import { test, expect, type Page } from '@playwright/test';
import {
  createMockFetch,
  type MockOptions,
} from '../../src/api/mock/transport';
import { screenMockOptions } from '../../src/api/screen/mock-seed';
import { createScenario } from '../../src/data/scenario';
import { calculateRisk } from '../../src/models/risk';

async function backend(page: Page, scenarios: MockOptions['scenarios'] = {}) {
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
    scenarios,
    latencyMs: 0,
  });
  const calls: {
    path: string;
    method: string;
    body: Record<string, unknown> | null;
  }[] = [];
  let delayedId: string | null = null;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    calls.push({
      path,
      method: request.method(),
      body: request.postDataJSON(),
    });
    if (path === `/api/v1/incidents/${delayedId}`) await gate;
    const response = await fetcher(request.url(), {
      method: request.method(),
      headers: request.headers(),
      ...(request.postData() ? { body: request.postData()! } : {}),
    });
    await route
      .fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      })
      .catch(() => {});
  });
  return {
    scenario,
    calls,
    delay: (id: string) => {
      delayedId = id;
    },
    release,
  };
}
async function login(page: Page) {
  await page.goto('/');
  await page.locator('#login-btn').click();
  await expect(page.locator('#login-overlay')).toBeHidden();
  await page.waitForFunction(() => window.__mock?.map?.getSource('fire-cum'));
}

test('every list row receives its own actual detail fields; late selection cannot overwrite a newer selection', async ({
  page,
}) => {
  const server = await backend(page);
  await login(page);
  await page.locator('#wing-fire').click();
  const rows = page.locator('#inc-list tr[data-inc]');
  await expect(rows).toHaveCount(
    server.scenario.incidents.filter((row) => row.status !== '종료').length,
  );
  const ids = await rows.evaluateAll((items) =>
    items.map((item) => item.getAttribute('data-inc')!),
  );
  const first = ids[0]!,
    second = ids[1]!;
  for (const id of ids)
    await expect(
      page.locator(`#inc-list tr[data-inc="${id}"]`),
    ).not.toContainText('[NULL]');
  const selected = await page.evaluate(() => window.__mock.state.incId);
  const target = ids.find((id) => id !== selected)!;
  const selectedName = await page.locator('#ip-name').textContent();
  server.delay(target);
  await page.locator(`#inc-list tr[data-inc="${target}"]`).click();
  await expect(page.locator('#st-detail')).toContainText('불러오는 중');
  await expect(page.locator('#ip-name')).toHaveText(selectedName!);
  expect(await page.evaluate(() => window.__mock.state.incId)).toBe(selected);
  await expect(page.locator('#st-actions button')).toBeDisabled();
  const canceled = page.waitForEvent('requestfailed', {
    predicate: (request) =>
      new URL(request.url()).pathname === `/api/v1/incidents/${target}`,
  });
  await page.locator('#wing-fire').click();
  await page.locator(`#inc-list tr[data-inc="${selected}"]`).click();
  await canceled;
  await expect(page.locator('#st-detail')).not.toContainText('불러오는 중');
  server.release();
  await expect
    .poll(() => page.evaluate(() => window.__mock.state.incId))
    .toBe(selected);
  expect(server.calls.some((call) => call.path.endsWith(`/${first}`))).toBe(
    true,
  );
  expect(server.calls.some((call) => call.path.endsWith(`/${second}`))).toBe(
    true,
  );
});

for (const mode of ['empty', 'unavailable'] as const)
  test(`incident list ${mode} keeps an authenticated session and truthful existing empty area`, async ({
    page,
  }) => {
    await backend(page, { 'INC-01': mode });
    await login(page);
    await page.locator('#wing-fire').click();
    await expect(page.locator('#inc-list')).toContainText(
      mode === 'empty'
        ? '진행 중인 산불이 없습니다'
        : '산불 목록을 불러오지 못했습니다',
    );
    await expect(page.locator('#inc-list tr[data-inc]')).toHaveCount(0);
    await expect(page.locator('#btn-predict')).toBeDisabled();
    expect(await page.evaluate(() => window.__mock.state.role)).toBe(
      'commander',
    );
  });

test('INC-04 mock request uses selected server IDs, suppresses duplicates and moves the server result to ended list', async ({
  page,
}) => {
  const server = await backend(page);
  await login(page);
  const selected = await page.evaluate(() => window.__mock.state.incId);
  await page.locator('#st-actions button').click();
  await page
    .locator('#modal-actions button')
    .filter({ hasText: '확인' })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.locator('#ip-badge')).toContainText('종료');
  const ends = server.calls.filter(
    (call) => call.method === 'POST' && call.path.endsWith('/end'),
  );
  expect(ends).toHaveLength(1);
  expect(ends[0]!.path).toBe(`/api/v1/incidents/${selected}/end`);
  expect(Object.keys(ends[0]!.body!)).toEqual(['expected_perimeter_id']);
  expect(typeof ends[0]!.body!.expected_perimeter_id).toBe('string');
  await page.locator('#wing-fire').click();
  await page.locator('#inc-mode button[data-lm="종료"]').click();
  await expect(
    page.locator(`#inc-list tr[data-inc="${selected}"]`),
  ).toContainText('종료');
});

test('a temporary list failure can recover through the existing drawer control', async ({
  page,
}) => {
  const scenarios: MockOptions['scenarios'] = { 'INC-01': 'unavailable' };
  await backend(page, scenarios);
  await login(page);
  delete scenarios['INC-01'];
  await page.locator('#wing-fire').click();
  await expect(page.locator('#inc-list tr[data-inc]').first()).toBeVisible();
  await expect(page.locator('#ip-name')).not.toHaveText('[NULL]');
  await expect(page.locator('#st-detail')).not.toContainText('불러오는 중');
});

test('detail permission failure preserves the server list and does not expose scenario data', async ({
  page,
}) => {
  await backend(page, { 'INC-03': 'forbidden' });
  await login(page);
  await page.locator('#wing-fire').click();
  await expect(page.locator('#inc-list tr[data-inc]').first()).toBeVisible();
  await page.locator('#inc-list tr[data-inc]').first().click();
  await expect(page.locator('#st-detail')).not.toContainText('불러오는 중');
  expect(await page.evaluate(() => window.__mock.state.incId)).toBe('__NULL__');
  expect(
    await page.evaluate(
      () => window.__mock.state.markers.f0.getElement().style.display,
    ),
  ).toBe('none');
  await page.locator('#wing-fire').click();
  await expect(page.locator('#inc-list tr[data-inc]').first()).toBeVisible();
});
