import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, createApiDataSource, createFixtures, createMockFetch } from '../src/api/index.ts';
import { createScreenBridge } from '../src/api/screen/bridge.ts';
import { eventView } from '../src/api/screen/events.ts';
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
  assert.ok(eventView({...rows[0],details:null}).text.includes('[필요한 정보:'));
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
