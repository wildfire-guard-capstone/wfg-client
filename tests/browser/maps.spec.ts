import { test, expect } from '@playwright/test';
import { createMockFetch } from '../../src/api/mock/transport';
import { screenMockOptions } from '../../src/api/screen/mock-seed';
import { createScenario } from '../../src/data/scenario';
import { calculateRisk } from '../../src/models/risk';
test.use({ screenshot: 'off' });
async function backend(page, failed = false) {
  const S = createScenario();
  const fetcher = createMockFetch({ ...screenMockOptions(S, calculateRisk(S.risk_model, S.incidents[0]!.risk_demo_runs![0]!.values, [])), latencyMs: 0, scenarios: failed ? { 'MAP-02': 'unavailable' } : {} });
  const calls: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/v1/**', async route => {
    const r = route.request(); calls.push(new URL(r.url()).pathname);
    const response = await fetcher(r.url(), { method: r.method(), headers: r.headers(), ...(r.postData() ? { body: r.postData()! } : {}) });
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }).catch(() => {});
  });
  await page.goto('/'); await page.locator('#login-btn').click();
  await expect(page.locator('#login-overlay')).toBeHidden();
  return { calls, errors };
}
test('HTTP map data drives unchanged markers, source geometry and layer toggles; selecting an object calls MAP-03', async ({ page }) => {
  const { calls, errors } = await backend(page);
  await expect.poll(() => page.evaluate(() => window.__mock.S.villages.length)).toBeGreaterThan(0);
  expect(calls).toContain('/api/v1/admin-areas');
  expect(calls).toContain('/api/v1/map/layers');
  const marker = page.locator('.mk.village').first();
  await marker.evaluate((el: HTMLElement) => el.click());
  await expect(page.locator('.map-popup')).toContainText('목업 마을');
  expect(calls.some(path => path.startsWith('/api/v1/map/entities/village/'))).toBe(true);
  await page.locator('.lyr-btn[data-layer="villages"]').click();
  await expect(marker).toBeHidden();
  await page.locator('.lyr-btn[data-layer="villages"]').click();
  await expect(marker).toBeVisible();
  expect(await page.evaluate(async () => (await window.__mock.map.getSource('houses').getData()).features.every(f => f.geometry.type === 'Point'))).toBe(true);
  expect(errors).toEqual([]);
});
test('failed map layers leave the original controls available without scenario geography', async ({ page }) => {
  const { calls, errors } = await backend(page, true);
  await expect(page.locator('#sys-alert')).toContainText('지도 일부 조회 실패');
  expect(await page.evaluate(() => [window.__mock.S.villages.length, window.__mock.S.facilities.length, window.__mock.S.routes.length])).toEqual([0,0,0]);
  await expect(page.locator('.lyr-btn[data-layer="water"]')).toBeVisible();
  expect(calls.some(path => path.endsWith('/features'))).toBe(true);
  expect(errors).toEqual([]);
});
