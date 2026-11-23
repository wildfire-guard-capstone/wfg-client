import {test,expect,type Page} from '@playwright/test';
import {createMockFetch} from '../../src/api/mock/transport';
import {createFixtures} from '../../src/api/mock/fixtures';
import {screenMockOptions} from '../../src/api/screen/mock-seed';
import {createScenario} from '../../src/data/scenario';
import {calculateRisk} from '../../src/models/risk';
import {fillScenarioLogin} from './helpers/login';

const cell=(page:Page,label:string)=>page.locator('#st-detail tr').filter({has:page.locator('td.k').filter({hasText:new RegExp(`^${label}$`)})}).locator('td').nth(1);
async function setup(page:Page,role='commander',mode:'ready'|'stale'|'failed'|'empty'|'repredict'='ready') {
  const S=createScenario(),fixtures=createFixtures();
  const options=screenMockOptions(S,calculateRisk(S.risk_model,S.incidents[0]!.risk_demo_runs![0]!.values,[]));
  const incident={...options.seed!.incidents[0]!,current_stage:'STAGE2' as const,ignition_point:{type:'Point' as const,coordinates:[128.61217123,36.37119876]},latest_prediction_id:mode==='empty'?null:'41',
    // 서버는 첫 예측 전에도 needs_reprediction을 true로 준다(QA 3-2). repredict = 예측 뒤 새 화선 보고
    needs_reprediction:mode==='empty'||mode==='repredict'};
  const perimeter={...options.seed!.perimeters[0]!,version_no:1,area_ha:22.1};
  incident.current_perimeter_version=1;
  options.seed!.incidents=[incident];
  options.seed!.perimeters=[perimeter,{...perimeter,id:'20',version_no:0,geometry:incident.ignition_point,area_ha:0}];
  options.fixtures!['PRED-02']={...fixtures['PRED-02'],perimeter_id:perimeter.id,perimeter_version:1};
  options.fixtures!['WTH-01']={...fixtures['WTH-01'],source:'KMA_NCST',wind_dir_name:'서북서',wind_speed:4.5,humidity:41,temp:4.5,precip:0,stale:mode==='stale'};
  if(mode==='empty')options.seed!.perimeters=[];
  const fetcher=createMockFetch({...options,latencyMs:0,scenarios:mode==='failed'?{'WTH-01':'unavailable'}:{}});
  const calls:{path:string;status:number}[]=[];let writes=0;
  await page.route('**/api/v1/**',async route=>{
    const r=route.request();
    if(r.method()!=='GET'&&!/\/auth\/(login|logout)$/.test(r.url())){writes++;return route.abort();}
    // Fixed saved-result DTOs avoid triggering a prediction POST in a display test.
    const saved=new URL(r.url()).pathname.match(/^\/api\/v1\/incidents\/100\/predictions\/41(?:\/(slices|weather|risk))?$/);
    if(saved) {
      const data=saved[1]==='slices'?fixtures['PRED-03']:saved[1]==='weather'?fixtures['PRED-04']:saved[1]==='risk'?fixtures['RISK-01']:options.fixtures!['PRED-02'];
      calls.push({path:new URL(r.url()).pathname,status:200});
      await route.fulfill({status:200,json:{data,meta:{request_id:'qa-incident-saved-fixture'}}}).catch(()=>{});return;
    }
    const response=await fetcher(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()!}:{})});
    calls.push({path:new URL(r.url()).pathname,status:response.status});
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()}).catch(()=>{});
  });
  await page.goto('/');await fillScenarioLogin(page,role);await page.locator('#login-btn').click();
  await expect(page.locator('#login-overlay')).toBeHidden();
  if(role==='commander'||role==='viewer')await expect(cell(page,'발생 장소')).toContainText(incident.address);
  return {incident,perimeter,weather:options.fixtures!['WTH-01']!,calls,writes:()=>writes};
}
for(const width of [1440,390])for(const role of ['commander','viewer','reporter','admin'])
test(`QA-INC overview ${role} ${width}px: display-only changes preserve role policy and layout`,async({page})=>{
  await page.setViewportSize({width,height:960});const server=await setup(page,role);
  if(role==='admin') {
    await expect(page.locator('#admin-screen')).toBeVisible();
    expect(server.calls.some(c=>/^\/api\/v1\/incidents\/\d+$/.test(c.path))).toBe(false);
    expect(server.writes()).toBe(0);return;
  }
  if(role==='reporter') {
    await expect(page.locator('#rep-panel')).toBeVisible();
    await expect(page.locator('#info-panel')).toBeHidden();
    expect(server.calls.some(c=>/\/weather\/now$|\/predictions\//.test(c.path))).toBe(false);
    expect(server.writes()).toBe(0);return;
  } else await expect(page.locator('#info-panel')).toBeVisible();
  const stage=page.locator('#st-detail tr').filter({has:page.getByText('공식 단계',{exact:true})}).locator('td').last();
  await expect(stage).toHaveText('2단계'); // QA 3-1: 예측 때 규칙 엔진이 판정한 current_stage
  await expect(cell(page,'기상')).toHaveText('풍향 서북서 · 풍속 4.5 m/s · 습도 41% · 기온 4.5℃ · 강수 0 mm');
  const vertices=(server.perimeter.geometry as {coordinates:number[][][][]}).coordinates.flat().reduce((n,r)=>n+r.length-1,0);
  await expect(cell(page,'실측 화선')).toHaveText(`v1 · 22.1 ha · 꼭짓점 ${vertices}개`);
  await expect(cell(page,'예측')).toHaveText('60 ha(5h) · 90 ha(8h)');
  await expect(cell(page,'발생 장소').locator('span')).toHaveText('위도 36.37119876° N · 경도 128.61217123° E');
  expect(await page.evaluate(()=>{
    const m=window.__mock!,i=m.S.incidents.find(i=>i.id===m.state.incId)!;
    return {point:i.ignition,perimeters:i.perimeters.map(p=>({version:p.version,at:p.at,by:p.by})),reference:m.state.inc[m.state.incId].predPerim.version};
  })).toEqual({point:server.incident.ignition_point.coordinates,perimeters:[{version:0,at:server.perimeter.observed_at,by:server.perimeter.reported_by},{version:1,at:server.perimeter.observed_at,by:server.perimeter.reported_by}],reference:1});
  expect(server.weather.source).toBe('KMA_NCST');expect(server.weather.observed_at).toBeTruthy();
  if(role!=='reporter') {
    const box=await page.locator('#st-detail table').boundingBox();expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);
    expect(await page.locator('#st-detail td').evaluateAll(cells=>cells.every(c=>c.scrollWidth<=c.clientWidth+1))).toBe(true);
    await expect(page.locator('#st-actions button')).toHaveCount(role==='commander'?1:0);
  }
  expect(server.writes()).toBe(0);
});
for(const mode of ['stale','failed','empty'] as const)test(`QA-INC ${mode}: remove metadata without hiding stale/error/missing states`,async({page})=>{
  const server=await setup(page,'viewer',mode);
  if(mode==='stale')await expect(cell(page,'기상')).toContainText('갱신 지연, 마지막 관측값');
  if(mode==='failed')await expect(cell(page,'기상')).toContainText('현재 기상 조회 실패');
  if(mode==='empty') {
    await expect(cell(page,'실측 화선')).toContainText('실측 화선 데이터 없음');
    await expect(cell(page,'예측')).toContainText('예측 결과 생성 전');
    await expect(cell(page,'예측')).not.toContainText('ha(');
  }
  await expect(cell(page,'기상')).not.toContainText('KMA_NCST');
  await expect(cell(page,'실측 화선')).not.toContainText('이전 버전');
  await expect(cell(page,'예측')).not.toContainText('기준 화선');
  expect(server.writes()).toBe(0);
});
const stageCell=(page:Page)=>page.locator('#st-detail tr').filter({has:page.getByText('공식 단계',{exact:true})}).locator('td').last();
for(const width of [1440,390])for(const mode of ['empty','ready','repredict'] as const)
test(`QA 3-1·3-2 ${mode} ${width}px: official stage is the predicted judgement; 재예측 필요 only after a prediction`,async({page})=>{
  await page.setViewportSize({width,height:960});const server=await setup(page,'commander',mode);
  const stage=stageCell(page),note=page.locator('#pred-note'),btn=page.locator('#btn-predict');
  if(mode==='empty') {
    // 첫 예측 전 current_stage(STAGE2로 넣어 둠)는 판정하지 않은 값이라 보이지 않는다
    await expect(stage.locator('span.muted').first()).toHaveText('판정 전');
    await expect(stage.locator('.small')).toHaveText('확산 예측을 실행하면 판정됩니다');
    await expect(stage).not.toContainText('2단계');
    await expect(stage).toHaveAttribute('title','');
    // needs_reprediction=true여도 예측이 없으면 재예측 배지·강조 없음. 버튼은 '확산 예측 실행'
    await expect(btn).toHaveText('확산 예측 실행');
    await expect(note).not.toContainText('재예측 필요');
    await expect(btn).not.toHaveClass(/(^|\s)stale(\s|$)/);
  } else {
    await expect(btn).toHaveText('다시 예측');
    await expect(stage).toHaveAttribute('title',/판정한 단계/);
  }
  if(mode==='ready') {
    await expect(stage).toHaveText('2단계');
    await expect(note).not.toContainText('재예측 필요');
    await expect(btn).not.toHaveClass(/(^|\s)stale(\s|$)/);
    await expect(cell(page,'예측')).not.toContainText('재예측 필요');
  }
  if(mode==='repredict') {
    await expect(stage).toContainText('2단계');
    await expect(stage.locator('.small')).toHaveText('(직전 예측 기준)');
    await expect(note).toContainText('재예측 필요');
    await expect(note).toContainText('새 실측 화선 v1 보고됨');
    await expect(btn).toHaveClass(/(^|\s)stale(\s|$)/);
    await expect(cell(page,'예측')).toContainText('재예측 필요');
  }
  expect(await page.locator('#st-detail td').evaluateAll(cells=>cells.every(c=>c.scrollWidth<=c.clientWidth+1))).toBe(true);
  expect(server.writes()).toBe(0);
});
