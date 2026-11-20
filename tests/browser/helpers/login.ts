import type { Page } from '@playwright/test';
import { createScenario } from '../../../src/data/scenario';

/** Test fixture credentials are explicit; HTTP production never prefills mock accounts. */
export async function fillScenarioLogin(page: Page, role = 'commander') {
  const account = createScenario().accounts.find(a => a.role === role && a.status === '발급');
  if (!account) throw new Error('Missing test account');
  await page.locator('#login-role').selectOption(role);
  await page.locator('#login-id').fill(account.id);
  await page.locator('#login-pw').fill(account.pw ?? '');
}
