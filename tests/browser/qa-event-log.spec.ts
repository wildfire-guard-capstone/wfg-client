import {test,expect,type Page} from '@playwright/test';
import {createMockFetch} from '../../src/api/mock/transport';
import {createFixtures} from '../../src/api/mock/fixtures';
import {screenMockOptions} from '../../src/api/screen/mock-seed';
import {createScenario} from '../../src/data/scenario';
import {calculateRisk} from '../../src/models/risk';
import {fillScenarioLogin} from './helpers/login';

// QA 이벤트 로그: EC2 실데이터 모양(코드 · JSON · 숫자 ID)이 핵심 이벤트 한국어 한 줄로 보이는지
const ago=(minutes:number)=>new Date(Date.now()-minutes*60_000).toISOString();
async function setup(page:Page) {
  const S=createScenario(),fixtures=createFixtures();
  const options=screenMockOptions(S,calculateRisk(S.risk_model,S.incidents[0]!.risk_demo_runs![0]!.values,[]));
  const incident={...options.seed!.incidents[0]!,latest_prediction_id:'41'};
  options.seed!.incidents=[incident];
  options.fixtures!['PRED-02']={...fixtures['PRED-02'],perimeter_id:options.seed!.perimeters[0]!.id};
  const fetcher=createMockFetch({...options,latencyMs:0});
  const id=incident.id,day=new Date(Date.now()-24*3600_000).toISOString().slice(0,10);
  const ev=(n:string,created_at:string,user_id:string,action:string,details:Record<string,unknown>|null)=>({id:n,created_at,user_id,incident_id:id,action,details});
  const logs=[
    ev('12',ago(5),'6','QA_NO_EVIDENCE',{full:false,qa_id:15,missing:['인력 보유 · 대기 수']}),
    ev('11',ago(20),'6','ITEM_NO_EVIDENCE',{item_code:'S6',proposal_id:18}),
    ev('10',ago(20),'6','PROPOSAL_CREATED',{trigger:'CORRECTION',version:'v2.2',proposal_id:18,changed_items:11}),
    ev('9',ago(20),'6','SITUATION_CORRECTED',{changes:2,correction_id:4}),
    ev('8',ago(40),'6','PROPOSAL_CREATED',{trigger:'PREDICTION',version:'v2.1',proposal_id:17,changed_items:null}),
    ev('7',ago(40),'6','PREDICTION_CREATED',{mode:'LIVE',predictor:'elmfire',prediction_id:19,worker:'http://wfg-worker:8100',weather_input:{stations:['279','806','838']}}),
    ev('6',ago(70),'7','PERIMETER_CORRECTED',{version_no:2,corrected_id:14,perimeter_id:15}),
    ev('5',`${day}T05:13:38Z`,'7','PERIMETER_REPORTED',{version_no:1,perimeter_id:24}),
    ev('4',`${day}T05:13:38Z`,'7','INCIDENT_REPORTED',null),
  ];
  const correction={id:'4',incident_id:id,user_id:'6',input_text:'의성임차-2 헬기 1대 출동',changes:[],created_at:ago(20)};
  await page.route('**/api/v1/**',async route=>{
    const r=route.request(),url=new URL(r.url());
    if(r.method()!=='GET'&&!/\/auth\/(login|logout)$/.test(r.url()))return route.abort();
    const page_=(items:unknown[])=>route.fulfill({status:200,json:{data:{items,next_cursor:null,has_more:false},meta:{request_id:'qa-event-log'}}}).catch(()=>{});
    if(url.pathname==='/api/v1/event-logs'&&url.searchParams.get('incident_id')===id)return page_(logs);
    if(url.pathname===`/api/v1/incidents/${id}/corrections`)return page_([correction]);
    const saved=url.pathname.match(new RegExp(`^/api/v1/incidents/${id}/predictions/41(?:/(slices|weather|risk))?$`));
    if(saved) {
      const data=saved[1]==='slices'?fixtures['PRED-03']:saved[1]==='weather'?fixtures['PRED-04']:saved[1]==='risk'?fixtures['RISK-01']:options.fixtures!['PRED-02'];
      return route.fulfill({status:200,json:{data,meta:{request_id:'qa-event-log-saved'}}}).catch(()=>{});
    }
    const response=await fetcher(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()!}:{})});
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()}).catch(()=>{});
  });
  await page.goto('/');await fillScenarioLogin(page,'commander');await page.locator('#login-btn').click();
  await expect(page.locator('#login-overlay')).toBeHidden();
}
// 데스크톱(시연) 폭. 390px에서는 기존 배치상 패널이 지도 영역에 눌려 좁다(이 변경과 무관).
test('QA event log 1440px: key events only, Korean one-liners, no overflow',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await setup(page);
  await page.locator('#btn-log').click();
  const rows=page.locator('#hist-events tbody tr');
  await expect(rows).toHaveCount(6);
  const cells=await rows.evaluateAll(trs=>trs.map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent)));
  expect(cells.map(c=>c.slice(1))).toEqual([
    ['근거 부족','AI 답변 근거 부족 — 인력 보유 · 대기 수','지휘권자'],
    ['제안','대응 제안 v2.2 재생성 · 변경 11건 · 근거 부족 1항목 제외','지휘권자'],
    ['정정','상황 정정 「의성임차-2 헬기 1대 출동」','지휘권자'],
    ['예측','확산 예측 · 대응 제안 v2.1 생성','지휘권자'],
    ['입력','실측 화선 정정 → v2','보고자'],
    ['입력','산불 최초 보고 · 실측 화선 v1','보고자'],
  ]);
  expect(cells[0]![0]).toMatch(/^\d{2}:\d{2}:\d{2}$/); // 오늘
  expect(cells[5]![0]).toMatch(/^\d{2}\.\d{2} \d{2}:\d{2}$/); // 어제
  const text=await page.locator('#hist-events').innerText();
  for(const raw of ['PREDICTION_CREATED','SITUATION_CORRECTED','wfg-worker','{"','[필요한 정보','COR-'])expect(text).not.toContain(raw);
  const style=await page.locator('#hist-events tbody tr td').first().evaluate(td=>{const s=getComputedStyle(td);return {color:s.color,weight:s.fontWeight};});
  expect(style.weight).toBe('400');expect(style.color).not.toBe('rgb(208, 52, 44)'); // --red
  // 구분 · 시각 칸 글자가 옆 칸으로 넘치지 않음
  const overflow=await rows.evaluateAll(trs=>trs.flatMap(tr=>[...tr.querySelectorAll('td')].slice(0,2).map(td=>td.scrollWidth-td.clientWidth)));
  expect(Math.max(...overflow)).toBeLessThanOrEqual(0);
  await page.locator('#log-panel').screenshot({path:'test-results/qa-event-log-1440.png'});
});
