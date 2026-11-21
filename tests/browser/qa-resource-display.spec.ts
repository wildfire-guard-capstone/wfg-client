import {test,expect} from '@playwright/test';
import {createFixtures} from '../../src/api/mock/fixtures';
import {createMockFetch} from '../../src/api/mock/transport';
import {screenMockOptions} from '../../src/api/screen/mock-seed';
import {createScenario} from '../../src/data/scenario';
import {calculateRisk} from '../../src/models/risk';
import {fillScenarioLogin} from './helpers/login';
test.use({screenshot:'off'});

const longName='QA 실제 원문 <기관> '+ 'LongResourceCallsign'.repeat(12);
for(const width of [1440,390]) test(`resource popup at ${width}px keeps counts, original facts, filters and non-overlapping long names`,async({page})=>{
  await page.setViewportSize({width,height:960});
  const S=createScenario(),options=screenMockOptions(S,calculateRisk(S.risk_model,S.incidents[0]!.risk_demo_runs![0]!.values,[]));
  const fetcher=createMockFetch({...options,latencyMs:0});
  const writes:string[]=[];
  await page.route('**/api/v1/**',async route=>{
    const r=route.request(),path=new URL(r.url()).pathname;
    if(r.method()!=='GET'&&!path.endsWith('/auth/login')) {writes.push(path);await route.abort();return;}
    // Deterministic test-only aggregate: actual zero and unknown crew coexist.
    if(r.method()==='GET' && ['/api/v1/resources','/api/v1/resources/summary'].includes(path)) {
      const resource={...createFixtures()['RES-01'].items[0]!,kind:'VEHICLE',status:'AVAILABLE',name:longName};
      const data=path.endsWith('/summary')
        ? {bases:[{base_id:resource.base_id,kind:'VEHICLE',total:1,available:1,deployed:0,maintenance:0}],incident_deployed:null,incident_linked:{HELICOPTER:0,VEHICLE:0}}
        : {items:[resource],has_more:false,next_cursor:null};
      await route.fulfill({json:{data,meta:{request_id:'qa-resource-fixture'}}});return;
    }
    const response=await fetcher(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()!}:{})});
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()}).catch(()=>{});
  });
  await page.goto('/');
  await fillScenarioLogin(page);await page.locator('#login-btn').click();await expect(page.locator('#login-overlay')).toBeHidden();
  await page.locator('#btn-resources').click();
  const panel=page.locator('#lp-body');await expect(panel.locator('table tbody tr')).not.toHaveCount(0);
  await expect(panel).not.toContainText('정보 미제공');
  await expect(panel.locator('thead th')).toHaveText(['구분','명칭·호출부호','수량','상태']);
  await expect(panel).not.toContainText('인력(명)');
  await expect(panel.locator('.cnt .h')).toHaveText(['구분','대기','투입','정비','헬기(대)','차량(대)']);
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await expect(panel.locator('tbody tr td')).toHaveCount(4);
  await expect(panel.locator('tbody tr td:nth-child(2)')).toHaveText(longName);
  await expect(panel.locator('tbody tr td:nth-child(3)')).toHaveText('1대');
  const layout=await panel.evaluate(el=>{
    const table=el.querySelector('table')!, row=table.querySelector('tbody tr')!, name=row.children[1] as HTMLElement;
    const box=table.getBoundingClientRect(),popup=el.closest('#left-panel')!.getBoundingClientRect();
    return {width:innerWidth,popupLeft:popup.left,popupRight:popup.right,tableLeft:box.left,tableRight:box.right,
      cells:[...row.children].map(c=>({left:c.getBoundingClientRect().left,right:c.getBoundingClientRect().right,width:c.clientWidth,scroll:c.scrollWidth})),
      nameHeight:name.clientHeight,lineHeight:parseFloat(getComputedStyle(name).lineHeight)};
  });
  expect(layout.popupLeft).toBeGreaterThanOrEqual(0);expect(layout.popupRight).toBeLessThanOrEqual(width);
  expect(layout.tableLeft).toBeGreaterThanOrEqual(layout.popupLeft);expect(layout.tableRight).toBeLessThanOrEqual(layout.popupRight);
  for(let i=0;i<layout.cells.length;i++) {
    const cell=layout.cells[i]!;expect(cell.scroll).toBeLessThanOrEqual(cell.width+1);
    if(i)expect(cell.left).toBeGreaterThanOrEqual(layout.cells[i-1]!.right-1);
  }
  expect(layout.nameHeight).toBeGreaterThan(layout.lineHeight*2);
  const counts=await panel.locator('.cnt b').allTextContents();expect(counts).toEqual(['0','0','0','1','0','0']);
  const original=await page.evaluate(()=>JSON.stringify(window.__mock.S.resources));
  expect(await page.evaluate(()=>window.__mock.S.resources.every(r=>r.org==='정보 미제공'))).toBe(true);
  const available=panel.locator('input[data-rs="대기"]');await available.uncheck();
  await expect(panel.locator('tbody tr')).toHaveCount(0);
  await available.check();await expect(panel.locator('tbody tr')).not.toHaveCount(0);
  expect(await page.evaluate(()=>JSON.stringify(window.__mock.S.resources))).toBe(original);
  expect(writes).toEqual([]);
});

// Existing favicon QA stays separate so resource-only verification does not repeat it.
test('existing PNG favicon is reusable',async({page})=>{
  await page.goto('/');
  const icon=page.locator('link[rel="icon"]');await expect(icon).toHaveAttribute('type','image/png');
  const href=await icon.getAttribute('href');expect(href).toContain('logo.png');
  const response=await page.request.get(href!);expect(response.ok()).toBe(true);
  expect([...((await response.body()).subarray(0,8))]).toEqual([137,80,78,71,13,10,26,10]);

});
