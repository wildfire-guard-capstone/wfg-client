import {test,expect,type Page} from '@playwright/test';
import {createMockFetch} from '../../src/api/mock/transport';
import {screenMockOptions} from '../../src/api/screen/mock-seed';
import {createScenario} from '../../src/data/scenario';
import {calculateRisk} from '../../src/models/risk';
import {fillScenarioLogin} from './helpers/login';

const expected={fire:true,risk:true,villages:true,houses:false,care:true,heritage:true,shelters:true,water:false,power:true,agencies:true,roads:true,rail:false,routes:false};
// Test-only fixed MAP-02 response: the shared fixture is bbox-filtered and can be
// empty on a narrow viewport. Never add this marker to application/API data.
const waterFixture={
  data:{type:'FeatureCollection',features:[{
    type:'Feature',id:'qa-water-1',
    geometry:{type:'Point',coordinates:[128.64,36.38]},
    properties:{id:'qa-water-1',kind:'water',name:'QA 전용 담수지',attrs:{}},
  }],next_cursor:null,has_more:false},
  meta:{request_id:'qa-map-water-fixture'},
};
async function waterDisplay(page:Page,visible:boolean) {
  await expect.poll(()=>page.evaluate(()=>Object.keys(window.__mock!.state.markers).filter(k=>k.startsWith('w:')))).toEqual(['w:qa-water-1']);
  await expect(page.locator('.mk.water')).toHaveCount(1);
  await expect.poll(()=>page.evaluate(()=>window.__mock!.state.markers['w:qa-water-1']!.getElement().style.display)).toBe(visible?'':'none');
  if(visible)await expect(page.locator('.mk.water')).toBeVisible();
  else await expect(page.locator('.mk.water')).toBeHidden();
}
async function setup(page:Page,role='commander') {
  const S=createScenario();const fetcher=createMockFetch({...screenMockOptions(S,calculateRisk(S.risk_model,S.incidents[0]!.risk_demo_runs![0]!.values,[])),latencyMs:0});
  let writes=0;
  await page.route('**/api/v1/**',async route=>{
    const r=route.request();if(r.method()!=='GET'&&!/\/auth\/(login|logout)$/.test(r.url())){writes++;return route.abort();}
    if(r.method()==='GET'&&new URL(r.url()).pathname==='/api/v1/map/layers/water/features') {
      await route.fulfill({status:200,json:waterFixture}).catch(()=>{});return;
    }
    const response=await fetcher(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()!}:{})});
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()}).catch(()=>{});
  });
  await page.goto('/');await fillScenarioLogin(page,role);await page.locator('#login-btn').click();
  await expect(page.locator('#login-overlay')).toBeHidden();
  await page.waitForFunction(()=>window.__mock?.map?.getLayer('route-evac'));
  return {writes:()=>writes};
}
async function defaults(page:Page) {
  expect(await page.locator('.lyr-btn').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.getAttribute('data-layer'),!n.classList.contains('off')])))).toEqual(expected);
  for(const layer of ['rail','route-access','route-evac','route-conflict'])
    await expect.poll(()=>page.evaluate(id=>window.__mock!.map.getLayoutProperty(id,'visibility'),layer)).toBe('none');
  await waterDisplay(page,false);
}
for(const width of [1440,390]) test(`QA-MAP-01 ${width}px: defaults, native styles, actual visibility, toggles and refresh`,async({page})=>{
  await page.setViewportSize({width,height:960});const server=await setup(page);await defaults(page);
  for(const [key,layers] of [['rail',['rail']],['routes',['route-access','route-evac','route-conflict']],['water',[]]] as const) {
    const button=page.locator(`.lyr-btn[data-layer="${key}"]`);
    await page.mouse.move(0,0);
    const offColor=await button.evaluate(el=>getComputedStyle(el).backgroundColor);
    expect(offColor).toBe('rgb(179, 191, 216)');
    await button.click();await expect(button).not.toHaveClass(/\boff\b/);
    await page.mouse.move(0,0);
    expect(await button.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(offColor);
    for(const layer of layers)expect(await page.evaluate(id=>window.__mock!.map.getLayoutProperty(id,'visibility'),layer)).toBe('visible');
    if(key==='water')await waterDisplay(page,true);
    await button.click();await expect(button).toHaveClass(/\boff\b/);
    // A click leaves the pointer hovering; compare the same non-hover state.
    await expect.poll(()=>button.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(36, 79, 158)');
    for(const layer of layers)expect(await page.evaluate(id=>window.__mock!.map.getLayoutProperty(id,'visibility'),layer)).toBe('none');
    if(key==='water')await waterDisplay(page,false);
    await page.mouse.move(0,0);
    expect(await button.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(offColor);
  }
  await defaults(page);
  // Layer choices are page-local in main; an authenticated refresh uses defaults again.
  await page.locator('.lyr-btn[data-layer="water"]').click();
  await page.reload();await expect(page.locator('#login-overlay')).toBeHidden();await page.waitForFunction(()=>window.__mock?.map?.getLayer('route-evac'));await defaults(page);
  expect(await page.evaluate(()=>window.__mock?.state.role)).toBe('commander');
  expect(server.writes()).toBe(0);
});
for(const role of ['viewer','reporter'])test(`QA-MAP-01 ${role}: existing role policy and page-local choices remain`,async({page})=>{
  const server=await setup(page,role);await defaults(page);
  await page.locator('.lyr-btn[data-layer="water"]').click();
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page.locator('#login-overlay')).toBeVisible();
  await fillScenarioLogin(page,role);await page.locator('#login-btn').click();await expect(page.locator('#login-overlay')).toBeHidden();
  await expect(page.locator('.lyr-btn[data-layer="water"]')).not.toHaveClass(/\boff\b/);
  expect(await page.evaluate(()=>window.__mock?.state.role)).toBe(role);
  if(role==='viewer')await expect(page.locator('#btn-predict')).toBeHidden();
  else await expect(page.locator('#rep-panel')).toBeVisible();
  expect(server.writes()).toBe(0);
});
