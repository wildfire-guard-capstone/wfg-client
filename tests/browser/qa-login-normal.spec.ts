import { test, expect } from '@playwright/test';

test('normal HTTP mode has no demo credentials and role selection preserves manual input', async ({page}) => {
  test.skip(process.env.VITE_DEMO_ACCOUNTS !== 'false', 'Run with VITE_DEMO_ACCOUNTS=false');
  await page.goto('/');
  await expect(page.locator('#login-id')).toHaveValue('');
  await expect(page.locator('#login-pw')).toHaveValue('');
  await page.locator('#login-id').fill('manually-entered');
  await page.locator('#login-pw').fill('synthetic-manual-password');
  await page.locator('#login-role').selectOption('reporter');
  await expect(page.locator('#login-id')).toHaveValue('manually-entered');
  expect(await page.locator('#login-pw').inputValue() === 'synthetic-manual-password').toBe(true);
  expect(await page.evaluate(()=>window.__mock?.state.role)).toBeNull();
});

test('explicit demo mode with missing password gives a safe configuration notice and still allows manual entry',async({page})=>{
  test.skip(process.env.VITE_DEMO_ACCOUNTS !== 'true' || process.env.VITE_DEMO_PASSWORD !== '', 'Run with explicit missing demo password');
  await page.goto('/');
  await expect(page.locator('#login-err')).toContainText('자동 입력 설정이 완료되지 않았습니다');
  await expect(page.locator('#login-id')).toHaveValue('');
  await expect(page.locator('#login-pw')).toHaveValue('');
  await page.locator('#login-role').selectOption('reporter');
  await expect(page.locator('#login-err')).toContainText('자동 입력 설정이 완료되지 않았습니다');
  await page.locator('#login-id').fill('manual-id');await page.locator('#login-pw').fill('synthetic-manual-password');
  await expect(page.locator('#login-btn')).toBeEnabled();
  expect(await page.evaluate(()=>window.__mock?.state.role)).toBeNull();
});
