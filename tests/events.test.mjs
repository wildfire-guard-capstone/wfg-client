import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, createApiDataSource, createFixtures, createMockFetch } from '../src/api/index.ts';
import { createScreenBridge } from '../src/api/screen/bridge.ts';
import { eventTime, eventViews } from '../src/api/screen/events.ts';
import { createScenario } from '../src/data/scenario.ts';
const log=(id,incident_id='100',created_at='2026-11-10T12:00:00+09:00')=>({id,incident_id,created_at,user_id:'1',action:'PERIMETER_REPORTED',details:{perimeter_id:'21'}});
const login=(s,role='COMMANDER')=>s.api.auth.login({body:{login_id:'mock-'+role.toLowerCase(),password:'mock-password',role}});
test('LOG-01 serializes real filters/cursors, validates incident ownership and preserves nullable details',async()=>{
  const calls=[],rows=[log('203'),log('202'),log('201')];
  const s=createApiDataSource(createApiClient({mode:'http',fetcher:async(url,init)=>{
    const q=new URL(url,'http://test.invalid');calls.push(q);assert.equal(init.method,'GET');
    const second=q.searchParams.has('cursor');return Response.json({data:{items:second?rows.slice(2):rows.slice(0,2),has_more:!second,next_cursor:second?null:'opaque+cursor=='},meta:{request_id:'page'}});
  }}));
  assert.deepEqual(await s.events('100',undefined,{action:'PERIMETER_REPORTED',user_id:'1'}),rows);
  assert.equal(calls[1].pathname,'/api/v1/event-logs');assert.equal(calls[1].searchParams.get('cursor'),'opaque+cursor==');
  for(const q of calls){assert.equal(q.searchParams.get('incident_id'),'100');assert.equal(q.searchParams.get('action'),'PERIMETER_REPORTED');assert.equal(q.searchParams.get('user_id'),'1');assert.equal(q.searchParams.has('from_at'),false);}
  const malformed=createApiDataSource(createApiClient({mode:'http',fetcher:async()=>Response.json({data:{items:[log('1','999')],has_more:false,next_cursor:null},meta:{request_id:'wrong-incident'}})}));
  await assert.rejects(malformed.events('100'),e=>e.kind==='protocol');
});
test('LOG-01 mock matches server ordering, ADMIN system scope, required context and reader roles',async()=>{
  const s=createApiDataSource(createApiClient({mode:'http',fetcher:createMockFetch({latencyMs:0,fixtures:{'LOG-01':{items:[log('201'),log('203'),log('202'),log('204',null)],has_more:false,next_cursor:null}}})}));
  await login(s);assert.deepEqual((await s.events('100')).map(r=>r.id),['203','202','201']);
  await assert.rejects(s.api.events.list(),e=>e.status===422);
  await login(s,'ADMIN');assert.deepEqual((await s.events()).map(r=>r.id),['204']);
  await login(s,'VIEWER');await assert.rejects(s.events('100'),e=>e.status===403);
});
async function setup(role='COMMANDER'){
  const previous=globalThis.document,placeholder={textContent:''};
  const fields=new Map(Object.entries({'login-id':'mock-'+role.toLowerCase(),'login-pw':'mock-password','login-role':role.toLowerCase()}).map(([id,value])=>[id,{value,textContent:''}]));
  globalThis.document={getElementById:id=>id==='hist-events'?{querySelector:()=>placeholder}:fields.get(id)??{textContent:''}};
  const f=createFixtures(),calls=[],scenarios={},rows=[log('201'),log('202','200')];let delayed=false,release,arrived;
  const gate=new Promise(r=>release=r),pending=new Promise(r=>arrived=r);
  const fetcher=createMockFetch({latencyMs:0,scenarios,fixtures:{'LOG-01':{items:rows,has_more:false,next_cursor:null}},seed:{incidents:[{...f['INC-03'],latest_prediction_id:null,latest_proposal_id:null},{...f['INC-03'],id:'200',current_perimeter_id:'31',latest_prediction_id:null,latest_proposal_id:null}],perimeters:[f['PER-01'].items[0],{...f['PER-01'].items[0],id:'31',incident_id:'200'}],accounts:[{user:{...f['AUTH-02'],role,login_id:'mock-'+role.toLowerCase()},password:'mock-password'}]}});
  const s=createApiDataSource(createApiClient({mode:'http',fetcher:async(url,init)=>{const path=new URL(url,'http://test.invalid');calls.push(path);if(delayed&&path.pathname.endsWith('/event-logs')&&path.searchParams.get('incident_id')==='100'){arrived();await gate;}return fetcher(url,init);}}));
  const S=createScenario(),state={role:null,incId:'100',inc:{},events:[]},notices=[];
  const bridge=createScreenBridge(s,{S,state,IS:(id=state.incId)=>state.inc[id]??={},loginBusy(){},loginError(m){if(m)assert.fail(m);},notice:m=>notices.push(m),enter:a=>state.role=a.role,refresh(){},selected:id=>state.incId=id,baseAt(){},busy(){},chatBusy(){},message(){},answer(){}});
  await bridge.login();return {bridge,state,calls,scenarios,notices,placeholder,pending,release,set delayed(v){delayed=v;},close(){release();bridge.dispose();globalThis.document=previous;}};
}
test('late event responses cannot overwrite the selected incident; failed same-incident reads keep actual logs',async()=>{
  const x=await setup();try{
    assert.equal(x.state.events[0].inc,'100');x.delayed=true;
    const old=x.bridge.select('100');await x.pending;assert.equal(x.bridge.eventLogStatus(),'loading');x.bridge.bindLogs();
    await x.bridge.select('200');assert.ok(x.state.events.every(e=>e.inc==='200'));
    const known=structuredClone(x.state.events);x.release();await old;assert.deepEqual(x.state.events,known);
    x.scenarios['LOG-01']='server-error';await x.bridge.select('200');assert.deepEqual(x.state.events,known);assert.equal(x.bridge.eventLogStatus(),'error');assert.ok(x.notices.some(n=>n.includes('이벤트 로그 조회 실패')));
    x.scenarios['LOG-01']='empty';await x.bridge.select('200');assert.deepEqual(x.state.events,[]);assert.equal(x.bridge.eventLogStatus(),'ready');
  }finally{x.close();}
});
test('switching to an incident with failed logs clears previous logs; forbidden viewers never request LOG-01',async()=>{
  const x=await setup();try{
    x.scenarios['LOG-01']='forbidden';await x.bridge.select('200');assert.deepEqual(x.state.events,[]);assert.equal(x.bridge.eventLogStatus(),'error');x.bridge.bindLogs();assert.ok(x.placeholder.textContent.includes('실패'));
  }finally{x.close();}
  const v=await setup('VIEWER');try{assert.equal(v.calls.some(p=>p.pathname.endsWith('/event-logs')),false);assert.equal(v.bridge.eventLogStatus(),'forbidden');v.bridge.bindLogs();assert.ok(v.placeholder.textContent.includes('권한'));}finally{v.close();}
});
// QA 이벤트 로그: EC2 실데이터 모양(산불 #5 시연 흐름 전체, 서버 순서 = 최신순)
const ev=(id,created_at,user_id,action,details)=>({id,created_at,user_id,incident_id:'5',action,details});
const flow=[
  ev('341','2026-11-18T16:13:39+09:00','6','RESOURCE_UPDATED',{op:'released',resource_id:3,name:'의성임차-2',changed:['status','deployed_incident_id']}),
  ev('340','2026-11-18T16:13:39+09:00','6','INCIDENT_ENDED',{released_resource_ids:[3]}),
  ev('339','2026-11-18T16:06:47+09:00','6','ITEM_NO_EVIDENCE',{item_code:'S6',proposal_id:18}),
  ev('338','2026-11-18T16:06:47+09:00','6','PROPOSAL_CREATED',{trigger:'CORRECTION',version:'v3.2',proposal_id:18,changed_items:5}),
  ev('337','2026-11-18T16:06:47+09:00','6','SITUATION_CORRECTED',{changes:1,correction_id:3}),
  ev('336','2026-11-18T15:57:10+09:00','6','ITEM_NO_EVIDENCE',{item_code:'S6',proposal_id:17}),
  ev('335','2026-11-18T15:57:10+09:00','6','PROPOSAL_CREATED',{trigger:'PREDICTION',version:'v3.1',proposal_id:17,changed_items:null}),
  ev('334','2026-11-18T15:57:10+09:00','6','PREDICTION_CREATED',{mode:'LIVE',predictor:'elmfire',prediction_id:19,worker:'http://wfg-worker:8100',weather_input:{stations:['279','806']}}),
  ev('326','2026-11-18T15:28:03+09:00','7','PERIMETER_CORRECTED',{version_no:3,corrected_id:14,perimeter_id:15}),
  ev('325','2026-11-18T15:27:36+09:00','7','PERIMETER_REPORTED',{version_no:2,perimeter_id:14}),
  ev('324','2026-11-18T15:26:52+09:00','7','PERIMETER_REPORTED',{version_no:1,perimeter_id:13}),
  ev('323','2026-11-18T15:26:52+09:00','7','INCIDENT_REPORTED',null),
];
const correction={id:'3',incident_id:'5',user_id:'6',input_text:'만천리 대피 완료',changes:[],created_at:'2026-11-18T16:06:47+09:00'};
test('QA event log shows only key events, one line per action, in Korean',()=>{
  const now=new Date('2026-11-18T17:00:00+09:00');
  assert.deepEqual(eventViews(flow,{corrections:[correction],now}).map(e=>[e.t,e.kind,e.text,e.user]),[
    ['16:13:39','종료','산불 종료 · 투입 자원 1대 대기 전환','지휘권자'],
    ['16:06:47','제안','대응 제안 v3.2 재생성 · 변경 5건 · 근거 부족 1항목 제외','지휘권자'],
    ['16:06:47','정정','상황 정정 「만천리 대피 완료」','지휘권자'],
    ['15:57:10','예측','확산 예측 · 대응 제안 v3.1 생성 · 근거 부족 1항목 제외','지휘권자'],
    ['15:28:03','입력','실측 화선 정정 → v3','보고자'],
    ['15:27:36','입력','실측 화선 v2 보고','보고자'],
    ['15:26:52','입력','산불 최초 보고 · 실측 화선 v1','보고자'],
  ]);
  const shown=eventViews(flow,{now}).map(e=>[e.t,e.kind,e.text,e.user].join(' ')).join('\n');
  for(const raw of ['PREDICTION_CREATED','RESOURCE_UPDATED','wfg-worker','{"','[필요한 정보'])assert.equal(shown.includes(raw),false,raw);
  assert.ok(eventViews(flow,{now}).every(e=>e.inc==='5'));
  // 정정 이력을 못 읽어도 행은 남는다
  assert.equal(eventViews([flow[4]],{now})[0].text,'상황 정정');
});
test('QA event log covers failures, no-evidence answers, late perimeters and unknown actions',()=>{
  const now=new Date('2026-11-23T16:44:03+09:00'),at='2026-11-23T14:10:45+09:00';
  const rows=eventViews([
    ev('9','2026-11-23T16:30:00+09:00','6','SOMETHING_NEW',{a:1}),
    ev('8','2026-11-23T16:20:00+09:00','6','QA_NO_EVIDENCE',{full:false,qa_id:15,missing:['인력 보유 · 대기 수']}),
    ev('7','2026-11-23T16:19:00+09:00','6','QA_NO_EVIDENCE',{full:true,qa_id:16,missing:[]}),
    ev('6','2026-11-23T16:10:00+09:00','6','PROPOSAL_FAILED',{operation_id:'op-1',correction_id:5,code:'PROPOSAL_FAILED',message:'제안서를 만드는 중 오류가 발생했습니다.'}),
    ev('5','2026-11-23T16:00:00+09:00','6','PREDICTION_FAILED',{code:'STALE_PERIMETER',message:'계산하는 동안 화선이 바뀌었습니다.',operation_id:'op-0'}),
    ev('4','2026-11-23T15:00:00+09:00','7','PERIMETER_REPORTED',{version_no:1,perimeter_id:24}),
    ev('3',at,'7','INCIDENT_REPORTED',null),
    ev('2','2026-11-23T14:00:00+09:00','6','INCIDENT_ENDED',{released_resource_ids:[]}),
    ev('1','2026-11-23T13:00:00+09:00',null,'INCIDENT_REPORTED',null),
  ],{now});
  assert.deepEqual(rows.map(e=>[e.t,e.kind,e.text,e.user]),[
    ['16:20:00','근거 부족','AI 답변 근거 부족 — 인력 보유 · 대기 수','지휘권자'],
    ['16:19:00','근거 부족','AI 답변 근거 없음','지휘권자'],
    ['16:10:00','제안','대응 제안 재생성 실패 — 제안서를 만드는 중 오류가 발생했습니다.','지휘권자'],
    ['16:00:00','예측','확산 예측 실패 — 계산하는 동안 화선이 바뀌었습니다.','지휘권자'],
    ['15:00:00','입력','실측 화선 v1 보고','보고자'],
    ['14:10:45','입력','산불 최초 보고','보고자'],
    ['14:00:00','종료','산불 종료','지휘권자'],
    ['13:00:00','입력','산불 최초 보고',null],
  ]);
  // 오늘(KST)이 아니면 날짜를 붙인다 — 자정 근처도 KST 기준
  assert.equal(eventTime('2026-11-22T15:30:00Z',now),'00:30:00');
  assert.equal(eventTime('2026-11-22T14:59:59Z',now),'11.22 23:59');
  assert.equal(eventTime('2026-11-23T00:00:00+09:00',now),'00:00:00');
});
