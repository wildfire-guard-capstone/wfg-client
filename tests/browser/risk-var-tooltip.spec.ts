import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createFixtures, MOCK_ACCOUNTS } from '../../src/api/mock/fixtures';
import { createMockFetch } from '../../src/api/mock/transport';
import { RISK_VAR_DESCRIPTIONS } from '../../src/api/screen/risk-descriptions';

async function setup(page: Page, status: 'PARTIAL' | 'READY' | 'UNAVAILABLE') {
  const f = createFixtures();
  const risk = structuredClone(f['RISK-01']);
  risk.status = status;
  risk.unavailable_reasons = [];
  // risk-3(11/25): 22개 — 지형 3개 뺌, 경사도에 지형복잡도 가중치 합침
  const dropped = ['curvature', 'terrain_complexity', 'topographic_position'];
  risk.factors = risk.factors.filter((f) => !dropped.includes(f.code));
  risk.factors.find((f) => f.code === 'slope_up')!.weight = 0.11;
  if (status === 'UNAVAILABLE') risk.score = null;
  risk.factors.forEach((factor) => {
    factor.source = '원본 관측기관';
    factor.value_at = '2026-11-19T08:02:00Z';
  });
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


test('요소별 지표: 22개 변수 모두 ⓘ — 마우스를 올리면 설명이 뜨고 떼면 사라진다', async ({ page }) => {
  const h = await setup(page, 'PARTIAL');
  await page.locator('#risk-box').click();
  await page.locator('#btn-risk-vars').click();
  const icons = page.locator('#modal table.rv .rv-info');
  await expect(icons).toHaveCount(22);
  const tip = page.locator('.rv-tip');
  await expect(tip).toBeHidden();
  const slope = page.locator('#modal tr[data-factor="slope_up"] .rv-info');
  await slope.hover();
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText(RISK_VAR_DESCRIPTIONS.slope_up!);
  const box = await tip.boundingBox(), vp = page.viewportSize()!;
  expect(box!.x >= 0 && box!.x + box!.width <= vp.width && box!.y >= 0 && box!.y + box!.height <= vp.height).toBe(true);
  const capture = process.env.WFG_RISK_CAPTURE;
  if (capture) {
    await mkdir(capture, { recursive: true });
    await page.screenshot({ path: `${capture}/risk-var-tooltip.png` });
  }
  await page.mouse.move(5, 5);
  await expect(tip).toBeHidden();
  // 다른 변수로 옮기면 그 설명으로 바뀐다 · 키보드로 골라도 뜬다
  await page.locator('#modal tr[data-factor="houses_nearby"] .rv-info').focus();
  await expect(tip).toHaveText(RISK_VAR_DESCRIPTIONS.houses_nearby!);
  await page.keyboard.press('Escape');
  expect(h.errors).toEqual([]);
});
