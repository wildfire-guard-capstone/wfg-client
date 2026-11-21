import {test,expect} from '@playwright/test';
import {createFixtures} from '../../src/api/mock/fixtures';
import {createMockFetch} from '../../src/api/mock/transport';
import {screenMockOptions} from '../../src/api/screen/mock-seed';
import {createScenario} from '../../src/data/scenario';
import {calculateRisk} from '../../src/models/risk';
import {fillScenarioLogin} from './helpers/login';
test.use({screenshot:'off'});

test('resource popup hides missing cells, preserves zero/counts/model/filter and reuses existing PNG favicon',async({page})=>{
  const S=createScenario(),options=screenMockOptions(S,calculateRisk(S.risk_model,S.incidents[0]!.risk_demo_runs![0]!.values,[]));
  const fetcher=createMockFetch({...options,latencyMs:0});
  const writes:string[]=[];
  await page.route('**/api/v1/**',async route=>{
    const r=route.request(),path=new URL(r.url()).pathname;
    if(r.method()!=='GET'&&!path.endsWith('/auth/login')) {writes.push(path);await route.abort();return;}
    // Deterministic test-only aggregate: actual zero and unknown crew coexist.
    if(r.method()==='GET' && ['/api/v1/resources','/api/v1/resources/summary'].includes(path)) {
      const resource={...createFixtures()['RES-01'].items[0]!,kind:'VEHICLE',status:'AVAILABLE',name:'QA 전용 자원'};
      const data=path.endsWith('/summary')
        ? {bases:[{base_id:resource.base_id,kind:'VEHICLE',total:1,available:1,deployed:0,maintenance:0}],incident_deployed:null,incident_linked:{HELICOPTER:0,VEHICLE:0}}
        : {items:[resource],has_more:false,next_cursor:null};
      await route.fulfill({json:{data,meta:{request_id:'qa-resource-fixture'}}});return;
    }
    const response=await fetcher(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()!}:{})});
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()}).catch(()=>{});
  });
  await page.goto('/');
  const icon=page.locator('link[rel="icon"]');await expect(icon).toHaveAttribute('type','image/png');
  const href=await icon.getAttribute('href');expect(href).toContain('logo.png');
  const response=await page.request.get(href!);expect(response.ok()).toBe(true);
  expect([...((await response.body()).subarray(0,8))]).toEqual([137,80,78,71,13,10,26,10]);
  await fillScenarioLogin(page);await page.locator('#login-btn').click();await expect(page.locator('#login-overlay')).toBeHidden();
  await page.locator('#btn-resources').click();
  const panel=page.locator('#lp-body');await expect(panel.locator('table tbody tr')).not.toHaveCount(0);
  await expect(panel).not.toContainText('정보 미제공');
  await expect(panel.locator('thead th')).toHaveText(['구분','명칭·호출부호','소속','수량','상태']);
  const org=panel.locator('tbody tr td:nth-child(3)');expect((await org.allTextContents()).every(t=>t==='')).toBe(true);
  const counts=await panel.locator('.cnt b').allTextContents();expect(counts).toContain('0');expect(counts).toContain('');
  const original=await page.evaluate(()=>JSON.stringify(window.__mock.S.resources));
  expect(await page.evaluate(()=>window.__mock.S.resources.every(r=>r.org==='정보 미제공'))).toBe(true);
  const available=panel.locator('input[data-rs="대기"]');await available.uncheck();
  await expect(panel.locator('tbody tr')).toHaveCount(0);
  await available.check();await expect(panel.locator('tbody tr')).not.toHaveCount(0);
  expect(await page.evaluate(()=>JSON.stringify(window.__mock.S.resources))).toBe(original);
  expect(writes).toEqual([]);
});
