import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createFixtures, MOCK_ACCOUNTS } from '../../src/api/mock/fixtures';
import { createMockFetch } from '../../src/api/mock/transport';

const reasons = ['지면온도: 예측 기상에 없음', '7일 누적 강수량: 관측 자료 없음'];
async function setup(page: Page, status: 'PARTIAL' | 'READY' | 'UNAVAILABLE') {
  const f = createFixtures();
  const risk = structuredClone(f['RISK-01']);
  risk.status = status;
  risk.unavailable_reasons = [...reasons];
  if (status === 'UNAVAILABLE') risk.score = null;
  risk.factors.forEach((factor) => {
    factor.source = '원본 관측기관';
    factor.value_at = '2026-11-19T08:02:00Z';
  });
  risk.factors[0]!.included = false;
  risk.factors[0]!.reason = '지표별 원본 결측 사유';
  const fetcher = createMockFetch({
    latencyMs: 0,
    seed: {
      incidents: [f['INC-03']],
      perimeters: [f['PER-01'].items[0]!],
      accounts: MOCK_ACCOUNTS.map(user => ({ user, password: 'mock-password' })),
    },
  });
  const errors: string[] = [];
  const writes: string[] = [];
  const riskResponses: unknown[] = [];
  const predictionData: Record<string, unknown> = {
    '/api/v1/incidents/100': f['INC-03'],
    '/api/v1/incidents/100/predictions/41': f['PRED-02'],
    '/api/v1/incidents/100/predictions/41/slices': f['PRED-03'],
    '/api/v1/incidents/100/predictions/41/weather': f['PRED-04'],
    '/api/v1/incidents/100/predictions/41/risk': risk,
  };
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', async response => {
    if (new URL(response.url()).pathname.endsWith('/predictions/41/risk'))
      riskResponses.push((await response.json()).data);
  });
  await page.route('**/api/v1/**', async route => {
    const q = route.request();
    const path = new URL(q.url()).pathname;
    if (q.method() !== 'GET' && path !== '/api/v1/auth/login') writes.push(path);
    if (q.method() === 'GET' && path in predictionData) {
      await route.fulfill({ status: 200, json: { data: predictionData[path], meta: { request_id: 'risk-minimal' } } });
      return;
    }
    const response = await fetcher(q.url(), {
      method: q.method(), headers: q.headers(),
      ...(q.postData() ? { body: q.postData()! } : {}),
    });
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  await page.goto('/');
  await page.locator('#login-role').selectOption('commander');
  await page.locator('#login-id').fill('mock-commander');
  await page.locator('#login-pw').fill('mock-password');
  await page.locator('#login-btn').click();
  await expect(page.locator('#login-overlay')).toBeHidden();
  await expect(page.locator('#risk-box')).toHaveAttribute('title', new RegExp(status));
  return { risk, riskResponses, errors, writes };
}

test('risk removes only partial notice and factor source/time, preserving table and API data', async ({ page }) => {
  const h = await setup(page, 'PARTIAL');
  await page.locator('#risk-box').click();
  const popup = page.locator('#risk-pop-body');
  const score = popup.locator('.rk-v');
  await expect(score).toHaveText(h.risk.score!.toFixed(2));
  const scoreClass = await score.getAttribute('class');
  const popupBefore = await popup.locator('.rk-fac').innerHTML();
  const capture = process.env.WFG_RISK_CAPTURE;
  if (capture) {
    await mkdir(capture, { recursive: true });
    await page.screenshot({ path: `${capture}/${process.env.WFG_RISK_CAPTURE_LABEL}-risk.png` });
  }
  await page.locator('#btn-risk-vars').click();
  const table = page.locator('#modal table.rv');
  if (capture) await page.screenshot({ path: `${capture}/${process.env.WFG_RISK_CAPTURE_LABEL}-factors.png` });
  await expect(popup.locator('.p1-data-state')).toHaveCount(0);
  for (const reason of reasons) await expect(popup).not.toContainText(reason);
  await expect(popup).toContainText('가져오지 못한 지표');
  expect(await popup.locator('.rk-fac').innerHTML()).toBe(popupBefore);
  await expect(score).toHaveText(h.risk.score!.toFixed(2));
  await expect(score).toHaveClass(scoreClass!);
  await expect(table.locator('thead th')).toHaveText(['변수명', '값', '단위', '가중치', '위험도']);
  await expect(table.locator('tbody tr[data-factor]')).toHaveCount(h.risk.factors.length);
  await expect(table.locator('tbody tr.grp')).toHaveCount(6);
  await expect(table.locator('tbody tr.rk-grp')).toHaveCount(2);
  await expect(table).toContainText('계산 제외');
  await expect(table).toContainText('지표별 원본 결측 사유');
  await expect(table).not.toContainText('출처:');
  await expect(table).not.toContainText('관측:');
  await expect(table).not.toContainText('원본 관측기관');
  await expect(table).not.toContainText('2026-11-19');
  await expect.poll(() => h.riskResponses.length).toBeGreaterThan(0);
  expect(h.riskResponses[0]).toEqual(h.risk);
  const emptyMeta = await table.locator('.p1-factor-meta').evaluateAll(nodes => nodes.filter(n => !n.textContent?.trim()).length);
  expect(emptyMeta).toBe(0);
  expect(h.errors).toEqual([]);
  expect(h.writes).toEqual([]);
});

for (const status of ['READY', 'UNAVAILABLE'] as const)
  test(`risk retains ${status} guidance and does not display missing-reason list`, async ({ page }) => {
    const h = await setup(page, status);
    await page.locator('#risk-box').click();
    const popup = page.locator('#risk-pop-body');
    await expect(popup.locator('.p1-data-state')).toHaveText(status === 'READY' ? '위험도 조회 완료' : '위험도 데이터 없음');
    for (const reason of reasons) await expect(popup).not.toContainText(reason);
    if (status === 'UNAVAILABLE') await expect(popup).toContainText('산불 위험도 미산출');
    expect(h.errors).toEqual([]);
    expect(h.writes).toEqual([]);
  });
