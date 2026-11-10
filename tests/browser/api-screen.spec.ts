import { test, expect, type Page } from '@playwright/test';
import {
  createMockFetch,
  type MockOptions,
} from '../../src/api/mock/transport';
import { screenMockOptions } from '../../src/api/screen/mock-seed';
import { createScenario } from '../../src/data/scenario';
import { calculateRisk } from '../../src/models/risk';

async function server(page: Page, scenarios: MockOptions['scenarios'] = {}) {
  const S = createScenario();
  const risk = calculateRisk(
    S.risk_model,
    S.incidents[0]!.risk_demo_runs![0]!.values,
    [],
  );
  const fetcher = createMockFetch({
    ...screenMockOptions(S, risk),
    latencyMs: 0,
    scenarios,
  });
  const calls: {
      method: string;
      url: string;
      body: Record<string, unknown> | null;
    }[] = [],
    errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      body = request.postData();
    calls.push({
      method: request.method(),
      url: request.url(),
      body: body ? JSON.parse(body) : null,
    });
    const response = await fetcher(request.url(), {
      method: request.method(),
      headers: request.headers(),
      ...(body ? { body } : {}),
    });
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    });
  });
  return { calls, errors };
}
async function login(page: Page, role = 'commander') {
  await page.goto('/');
  await page.locator('#login-role').selectOption(role);
  await page.locator('#login-btn').click();
  await expect(page.locator('#login-overlay')).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => window.__mock?.dataMode))
    .toBe('http');
  if (role !== 'admin')
    await page.waitForFunction(() => window.__mock?.map?.getSource('fire-cum'));
}
async function predict(page: Page) {
  await page.locator('#btn-predict').click();
  await expect(page.locator('#risk-box')).toBeVisible();
  await expect(page.locator('#btn-predict')).toBeEnabled();
}

test('HTTP responses drive original map, large risk badge, 14 proposal slots and AI chat', async ({
  page,
}) => {
  const { calls, errors } = await server(page);
  await login(page);
  await expect(page.locator('#st-detail')).toContainText('공식 단계');
  await expect(page.locator('#st-detail')).toContainText('[NULL]');
  await predict(page);
  await expect(page.locator('#risk-box')).toHaveText('3.20');
  const box = await page.locator('#risk-box').boundingBox();
  expect(box?.width).toBe(64);
  expect(box?.height).toBe(64);
  await page.locator('#risk-box').click();
  await expect(page.locator('#risk-pop-body .rk-fac tbody tr')).toHaveCount(4);
  await expect(page.locator('#risk-pop-body')).toContainText('[NULL]');
  await page.locator('#btn-risk-vars').click();
  await expect(page.locator('#modal table.rv tbody tr:not(.grp)')).toHaveCount(
    23,
  );
  await page.locator('#modal-actions button').click();
  await page.locator('.ip-tab[data-tab="proposal"]').click();
  await expect(page.locator('#cards .card[data-id="S5"] .text')).toHaveText(
    '[NULL]',
  );
  expect(
    await page.evaluate(() => window.__mock.IS().viewRun.blocks.length),
  ).toBe(14);
  await page.locator('.ptab[data-axis="대피"]').click();
  await expect(page.locator('#cards .card[data-id="E5"] .text')).toHaveText(
    '[NULL]',
  );
  await expect(page.locator('#cards .card[data-id="E7"] .text')).toHaveText(
    '[NULL]',
  );
  await page.locator('#chat-fab').click();
  await page.locator('#chat-input').fill('현재 위험도');
  await page.locator('#btn-chat-send').click();
  await expect(page.locator('#chat-log')).toContainText('목업 질의응답 예시');
  expect(
    calls.some((c) => c.url.includes('/predictions') && c.method === 'POST'),
  ).toBe(true);
  expect(calls.some((c) => c.url.includes('/weather/now'))).toBe(true);
  expect(
    calls.some(
      (c) =>
        c.url.includes('/qa/messages') || c.url.includes('/assistant/messages'),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('empty risk/proposal and failed resource summary keep the original UI with NULL values', async ({
  page,
}) => {
  const { errors } = await server(page, {
    'RISK-01': 'empty',
    'PROP-02': 'empty',
    'WTH-01': 'empty',
    'RES-01': 'empty',
    'RES-02': 'unavailable',
  });
  await login(page);
  await predict(page);
  await expect(page.locator('#risk-box')).toHaveText('[NULL]');
  await page.locator('#risk-box').click();
  await expect(page.locator('#risk-pop-body .rk-fac tbody tr')).toHaveCount(4);
  await expect(page.locator('#risk-pop-body .rk-track i')).toBeHidden();
  await expect(page.locator('#risk-pop-body')).not.toContainText('빼고 계산했습니다');
  await page.locator('.ip-tab[data-tab="proposal"]').click();
  await expect(page.locator('#cards .card')).toHaveCount(7);
  await page.locator('#btn-resources').click();
  await expect(page.locator('#lp-body')).toContainText('[NULL]');
  expect(
    await page
      .locator('#risk-box')
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBe(64);
  expect(errors).toEqual([]);
});

test('empty incident list does not invent coordinates or a fire; controls and panels remain', async ({
  page,
}) => {
  const { errors } = await server(page, { 'INC-01': 'empty' });
  await login(page);
  await expect(page.locator('#ip-name')).toHaveText('[NULL]');
  await expect(page.locator('#btn-predict')).toBeDisabled();
  await expect(page.locator('#st-detail')).not.toContainText('128.60226');
  expect(
    await page.evaluate(
      () => window.__mock.state.markers.f0.getElement().style.display,
    ),
  ).toBe('none');
  expect(errors).toEqual([]);
});

test('reporter submits only contracted new-report fields; MultiPolygon and holes survive', async ({
  page,
}) => {
  const { calls, errors } = await server(page);
  await login(page, 'reporter');
  await page.locator('#rep-new').click();
  await expect(page.locator('#rep-name')).toHaveValue('[NULL]');
  for (const [id, value] of Object.entries({
    'rep-addr': '경북 의성군 보고 시험',
    'rep-lng': '128.602',
    'rep-lat': '36.365',
    'rep-cname': '테스트 보고자',
    'rep-cphone': '010-0000-0000',
  }))
    await page.locator(`#${id}`).fill(value);
  const geometry = {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [128.6, 36.36],
          [128.61, 36.36],
          [128.61, 36.37],
          [128.6, 36.36],
        ],
        [
          [128.603, 36.362],
          [128.604, 36.362],
          [128.604, 36.363],
          [128.603, 36.362],
        ],
      ],
      [
        [
          [128.62, 36.36],
          [128.63, 36.36],
          [128.63, 36.37],
          [128.62, 36.36],
        ],
      ],
    ],
  };
  await page.locator('#rep-geojson').click();
  await page.locator('#gj-text').fill(JSON.stringify(geometry));
  await page
    .locator('#modal-actions button')
    .filter({ hasText: '적용' })
    .click();
  await page.locator('#rep-save').click();
  await expect
    .poll(
      () =>
        calls.filter(
          (c) =>
            c.method === 'POST' &&
            new URL(c.url).pathname === '/api/v1/incidents',
        ).length,
    )
    .toBe(1);
  const body = calls.find(
    (c) =>
      c.method === 'POST' && new URL(c.url).pathname === '/api/v1/incidents',
  )!.body!;
  expect(body).not.toHaveProperty('name');
  expect(body).not.toHaveProperty('intake');
  expect(body).not.toHaveProperty('official_stage');
  expect((body.initial_perimeter as { geometry: unknown }).geometry).toEqual(
    geometry,
  );
  await expect(page.locator('#rep-addr')).toHaveValue('경북 의성군 보고 시험');
  expect(errors).toEqual([]);
});

test('AI correction stays unsaved until confirmation and polls the returned regeneration job', async ({
  page,
}) => {
  const { calls, errors } = await server(page, {
    'AI-01': 'assistant-preview',
  });
  await login(page);
  await predict(page);
  await page.locator('#chat-fab').click();
  await page.locator('#chat-input').fill('헬기 2대 투입');
  await page.locator('#btn-chat-send').click();
  await expect(page.locator('#modal-bg')).toHaveClass(/on/);
  expect(
    calls.filter((c) => c.url.includes('/corrections') && c.method === 'POST'),
  ).toHaveLength(0);
  await page
    .locator('#modal-actions button')
    .filter({ hasText: '확인 · 저장 후 재생성' })
    .click();
  await expect
    .poll(
      () =>
        calls.filter(
          (c) => c.url.includes('/corrections') && c.method === 'POST',
        ).length,
    )
    .toBe(1);
  await expect
    .poll(() => calls.filter((c) => c.url.includes('/operations/')).length)
    .toBeGreaterThanOrEqual(6);
  expect(errors).toEqual([]);
});

test('administrator controls remain; unconfirmed writes and missing issuance jurisdiction never fake success', async ({
  page,
}) => {
  const { calls, errors } = await server(page);
  await login(page, 'admin');
  await page.locator('[data-reissue]').first().click();
  await expect(page.locator('#sys-alert')).toContainText('[NULL]');
  await page.locator('#ac-name').fill('테스트 계정');
  await page.locator('#ac-org').fill('테스트 기관');
  await page.locator('#ac-role').selectOption('viewer');
  await page.locator('#ac-add').click();
  await expect(page.locator('#sys-alert')).toContainText('admin_area_id');
  expect(
    calls.filter((c) => c.url.includes('/admin/') && c.method !== 'GET'),
  ).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('existing perimeter report and correction use PER-02/03 without writing incident metadata', async ({
  page,
}) => {
  const { calls, errors } = await server(page);
  await login(page, 'reporter');
  await page.locator('#rep-perim').click();
  await page.locator('#rep-save').click();
  await expect(page.locator('#rep-perim-cur')).toContainText('v2');
  await page.locator('#rep-perim').click();
  await page.locator('input[name="pmode"][value="correct"]').check();
  await page.locator('#rep-save').click();
  await expect(page.locator('#rep-perim-cur')).toContainText('v3');
  const writes = calls.filter(
    (call) => call.method === 'POST' && call.url.includes('/perimeters'),
  );
  expect(writes).toHaveLength(2);
  expect(writes[0]!.body).toHaveProperty('expected_perimeter_id');
  expect(writes[1]!.url).toContain('/corrections');
  expect(writes[1]!.body).not.toHaveProperty('expected_perimeter_id');
  expect(
    writes.every(
      (call) => !('name' in call.body!) && !('intake' in call.body!),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('failed regeneration retries PROP-05 without saving COR-01 twice', async ({
  page,
}) => {
  const scenarios: MockOptions['scenarios'] = { 'AI-01': 'assistant-preview' };
  const { calls, errors } = await server(page, scenarios);
  await login(page);
  await predict(page);
  scenarios['PRED-05'] = 'operation-failed';
  await page.locator('#chat-fab').click();
  await page.locator('#chat-input').fill('헬기 2대 투입');
  await page.locator('#btn-chat-send').click();
  await page
    .locator('#modal-actions button')
    .filter({ hasText: '확인 · 저장 후 재생성' })
    .click();
  await expect(page.locator('#modal-title')).toHaveText('제안 재생성 실패', {
    timeout: 12_000,
  });
  delete scenarios['PRED-05'];
  await page
    .locator('#modal-actions button')
    .filter({ hasText: '재생성 재시도' })
    .click();
  await expect
    .poll(
      () =>
        calls.filter(
          (call) =>
            call.url.includes('/proposal-regenerations') &&
            call.method === 'POST',
        ).length,
    )
    .toBe(1);
  await expect
    .poll(() => page.evaluate(() => window.__mock.IS().runs.length), {
      timeout: 12_000,
    })
    .toBe(2);
  expect(
    calls.filter(
      (call) => call.url.includes('/corrections') && call.method === 'POST',
    ),
  ).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('expired authentication returns to the original login instead of falling back to demo data', async ({
  page,
}) => {
  const { errors } = await server(page, { 'RISK-01': 'unauthorized' });
  await login(page);
  await page.locator('#btn-predict').click();
  await expect(page.locator('#login-overlay')).toBeVisible({ timeout: 12_000 });
  expect(await page.evaluate(() => window.__mock.state.role)).toBe(null);
  expect(errors).toEqual([]);
});
