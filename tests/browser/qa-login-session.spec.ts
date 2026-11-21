import { test, expect, type Page } from '@playwright/test';
import { createMockFetch } from '../../src/api/mock/transport';
import { screenMockOptions } from '../../src/api/screen/mock-seed';
import { createScenario } from '../../src/data/scenario';
import { calculateRisk } from '../../src/models/risk';

test.skip(process.env.VITE_DEMO_ACCOUNTS === 'false', 'Explicit demo-mode scenarios');
const ids = { reporter:'demo_rep', admin:'demo_admin', commander:'demo_cmd', viewer:'demo_view' };
const password = process.env.VITE_DEMO_PASSWORD ?? 'synthetic-demo-password'; // Synthetic test process value, never written to browser storage.
async function server(page: Page) {
  const S = createScenario();
  S.accounts = S.accounts.filter((a,i,all)=>all.findIndex(b=>b.role===a.role)===i);
  for (const a of S.accounts) { a.id=ids[a.role]; a.pw=password; }
  const fetcher = createMockFetch({ ...screenMockOptions(S,calculateRisk(S.risk_model,S.incidents[0]!.risk_demo_runs![0]!.values,[])), latencyMs:0 });
  const calls: {path:string;method:string;bearer:boolean}[]=[];
  let holdMe = false, failMe = 0, release!: () => void;
  let gate = Promise.resolve();
  await page.route('**/api/v1/**',async route=>{
    const r=route.request(), path=new URL(r.url()).pathname;
    calls.push({path,method:r.method(),bearer:!!r.headers().authorization});
    if(path.endsWith('/auth/me') && holdMe) await gate;
    if(path.endsWith('/auth/me') && failMe) {
      await route.fulfill({status:failMe,json:{error:{code:failMe===401?'INVALID_TOKEN':'UNAVAILABLE',message:'인증 조회 시험 오류',fields:[]},meta:{request_id:'qa-auth'}}}).catch(()=>{});return;
    }
    const response=await fetcher(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()!}:{})});
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()}).catch(()=>{});
  });
  return {calls,hold(){holdMe=true;gate=new Promise(resolve=>release=resolve);},release(){holdMe=false;release();},fail(status:number){failMe=status;}};
}
async function login(page: Page, role: keyof typeof ids='commander') {
  await page.goto('/');await page.locator('#login-role').selectOption(role);
  await expect(page.locator('#login-id')).toHaveValue(ids[role]);
  expect(await page.locator('#login-pw').inputValue() === password).toBe(true);
  await page.locator('#login-btn').click();
  await expect(page.locator('#login-overlay')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>window.__mock?.state.role)).toBe(role);
}
for(const role of Object.keys(ids) as (keyof typeof ids)[]) test(`demo ${role}: real HTTP login path, reload validates AUTH-02 and preserves server role`,async({page})=>{
  const api=await server(page);await login(page,role);
  const posts=api.calls.filter(c=>c.path.endsWith('/auth/login')).length;
  await page.reload();await expect(page.locator('#login-overlay')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>window.__mock?.state.role)).toBe(role);
  expect(api.calls.filter(c=>c.path.endsWith('/auth/login'))).toHaveLength(posts);
  expect(api.calls.filter(c=>c.path.endsWith('/auth/me')&&c.bearer)).toHaveLength(2);
  expect(await page.evaluate(()=>JSON.stringify({...sessionStorage,...localStorage}).includes('password'))).toBe(false);
});
test('restore waits for AUTH-02 without exposing login or protected UI; selected incident and tab survive',async({page})=>{
  const api=await server(page);await login(page);
  await page.locator('#wing-fire').click();const second=page.locator('#inc-list tr[data-inc]').nth(1);
  const id=await second.getAttribute('data-inc');await second.click();
  await expect.poll(()=>page.evaluate(()=>window.__mock?.state.incId)).toBe(id);
  await page.locator('.ip-tab[data-tab="proposal"]').click();
  api.hold();await page.reload();
  await expect(page.locator('#root')).toHaveAttribute('aria-busy','true');
  await expect(page.locator('#root')).toHaveCSS('visibility','hidden');
  expect(await page.evaluate(()=>window.__mock?.state.role)).toBeNull();
  api.release();await expect(page.locator('#root')).not.toHaveAttribute('aria-busy');
  await expect(page.locator('#login-overlay')).toBeHidden();
  expect(await page.evaluate(()=>window.__mock?.state.incId)).toBe(id);
  await expect(page.locator('.ip-tab[data-tab="proposal"]')).toHaveClass(/on/);
});
test('logout clears persistence; reload makes no AUTH-02 request; next role has no previous permissions',async({page})=>{
  const api=await server(page);await login(page);
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();
  await expect(page.locator('#login-overlay')).toBeVisible();
  const count=api.calls.filter(c=>c.path.endsWith('/auth/me')).length;
  await page.reload();await expect(page.locator('#login-overlay')).toBeVisible();
  expect(api.calls.filter(c=>c.path.endsWith('/auth/me'))).toHaveLength(count);
  expect(await page.evaluate(()=>sessionStorage.getItem('wfg-api-access-token'))).toBeNull();
  await page.locator('#login-role').selectOption('viewer');await page.locator('#login-btn').click();
  await expect(page.locator('#login-overlay')).toBeHidden();
  expect(await page.evaluate(()=>window.__mock?.state.role)).toBe('viewer');
  await expect(page.locator('#btn-predict')).toBeHidden();
});
test('expired persisted session returns to login without retrying AUTH-02 or sending logout',async({page})=>{
  const api=await server(page);await login(page);
  await page.evaluate(()=>{const saved=JSON.parse(sessionStorage.getItem('wfg-api-auth-state')!);saved.expiresAt=Date.now()-1;sessionStorage.setItem('wfg-api-auth-state',JSON.stringify(saved));});
  const count=api.calls.filter(c=>c.path.endsWith('/auth/me')).length;
  await page.reload();await expect(page.locator('#login-overlay')).toBeVisible();
  await expect(page.locator('#login-err')).toContainText('만료');
  expect(api.calls.filter(c=>c.path.endsWith('/auth/me'))).toHaveLength(count);
  expect(api.calls.filter(c=>c.path.endsWith('/auth/logout'))).toHaveLength(0);
  expect(await page.evaluate(()=>sessionStorage.getItem('wfg-api-access-token'))).toBeNull();
});
for(const status of [401,503]) test(`restore AUTH-02 ${status}: clear locally, no loop, allow manual login`,async({page})=>{
  const api=await server(page);await login(page);const count=api.calls.filter(c=>c.path.endsWith('/auth/me')).length;
  api.fail(status);await page.reload();await expect(page.locator('#login-overlay')).toBeVisible();
  await expect(page.locator('#login-btn')).toBeEnabled();
  expect(await page.evaluate(()=>sessionStorage.getItem('wfg-api-access-token'))).toBeNull();
  expect(api.calls.filter(c=>c.path.endsWith('/auth/me'))).toHaveLength(count+1);
  await page.reload();expect(api.calls.filter(c=>c.path.endsWith('/auth/me'))).toHaveLength(count+1);
  api.fail(0);await page.locator('#login-btn').click();await expect(page.locator('#login-overlay')).toBeHidden();
});
test('demo autofill remains editable; invalid credentials show an error and never authenticate locally',async({page})=>{
  const api=await server(page);await page.goto('/');
  await page.locator('#login-role').selectOption('reporter');
  await expect(page.locator('#login-id')).toHaveValue('demo_rep');
  await page.locator('#login-id').fill('invalid-account');await page.locator('#login-pw').fill('invalid-password');
  await page.locator('#login-btn').click();await expect(page.locator('#login-err')).not.toBeEmpty();
  await expect(page.locator('#login-overlay')).toBeVisible();
  expect(await page.evaluate(()=>window.__mock?.state.role)).toBeNull();
  expect(api.calls.filter(c=>c.path.endsWith('/auth/me'))).toHaveLength(0);
});

test('initial role autofills immediately and switching all roles remains editable without local authentication',async({page})=>{
  const api=await server(page);await page.goto('/');
  await expect(page.locator('#login-role')).toHaveValue('commander');
  await expect(page.locator('#login-id')).toHaveValue('demo_cmd');
  expect(await page.locator('#login-pw').inputValue()===password).toBe(true);
  for(const [role,id] of Object.entries(ids)) {
    await page.locator('#login-role').selectOption(role);
    await expect(page.locator('#login-id')).toHaveValue(id);
    expect(await page.locator('#login-pw').inputValue()===password).toBe(true);
  }
  await page.locator('#login-id').fill('manual-id');await page.locator('#login-pw').fill('synthetic-manual-password');
  await expect(page.locator('#login-id')).toHaveValue('manual-id');
  expect(await page.locator('#login-pw').inputValue()==='synthetic-manual-password').toBe(true);
  expect(api.calls.some(c=>c.path.endsWith('/auth/login'))).toBe(false);
  expect(await page.evaluate(()=>window.__mock?.state.role)).toBeNull();
});
