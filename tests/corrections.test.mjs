import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, createApiDataSource, createFixtures, createMockFetch } from '../src/api/index.ts';
import { createScreenBridge } from '../src/api/screen/bridge.ts';
import { createScenario } from '../src/data/scenario.ts';
async function setup({ noOperation = false, delayed = false } = {}) {
  const f=createFixtures(), fields=new Map(Object.entries({ 'login-id':'mock-commander','login-pw':'mock-password','login-role':'commander','chat-input':'헬기 2대 추가' }).map(([k,value])=>[k,{value,textContent:''}]));
  const previous=globalThis.document;
  globalThis.document={getElementById:id=>fields.get(id)??{textContent:''}};
  const state={role:null,incId:'100',inc:{},events:[],predicting:false}, calls=[];
  const scenarios={'AI-01':'assistant-preview'};
  const fetcher=createMockFetch({latencyMs:0,scenarios,seed:{incidents:[{...f['INC-03'],latest_prediction_id:null,latest_proposal_id:null},{...f['INC-03'],id:'200',current_perimeter_id:'31',latest_prediction_id:null,latest_proposal_id:null}],perimeters:[f['PER-01'].items[0],{...f['PER-01'].items[0],id:'31',incident_id:'200'}],accounts:[{user:f['AUTH-02'],password:'mock-password'}]}});
  let preview, confirm, retry, resultId, release, arrived, prepared=false;
  const gate=new Promise(r=>release=r), pending=new Promise(r=>arrived=r);
  const source=createApiDataSource(createApiClient({mode:'http',fetcher:async(url,init)=>{
    const path=new URL(url,'http://test.invalid').pathname;calls.push({path,method:init.method,body:init.body?JSON.parse(init.body):null});
    if(path.includes('/operations/')){
      if(delayed&&prepared){arrived();await gate;}
      let r;for(let i=0;i<3;i++)r=await fetcher(url,init);
      resultId=(await r.clone().json()).data.result?.proposal_id;return r;
    }
    const r=await fetcher(url,init);
    if(noOperation&&init.method==='POST'&&path.endsWith('/corrections')){
      const data=(await r.json()).data;
      for(let i=0;i<3;i++)await fetcher('/api/v1/incidents/100/operations/'+data.proposal_operation.id,{method:'GET',headers:init.headers});
      data.proposal_operation=null;return Response.json({data,meta:{request_id:'saved-no-operation'}},{status:201});
    }
    return r;
  }}));
  await source.api.auth.login({body:{login_id:'mock-commander',password:'mock-password',role:'COMMANDER'}});
  const prime=await source.api.predictions.start({path:{incident_id:'100'},body:{expected_perimeter_id:'21'},idempotencyKey:'prepare-mock-result'});
  await source.api.predictions.operation({path:{incident_id:'100',operation_id:prime.id}});
  if(noOperation)scenarios['PRED-05']='operation-failed';
  prepared=true;
  const bridge=createScreenBridge(source,{S:createScenario(),state,IS:(id=state.incId)=>state.inc[id]??={},refresh(){},loginBusy(){},loginError(m){if(m)assert.fail(m);},busy(v){state.predicting=v;},chatBusy(){},notice(){},baseAt(){},selected(id){state.incId=id;},enter(a){state.role=a.role;},message(){},answer(){},preview(p,cb){preview=p;confirm=cb;},modal(title,body,actions){retry=actions.find(a=>a.label==='재생성 재시도')?.onClick;}});
  await bridge.login();await bridge.sendChat();
  return {bridge,state,calls,scenarios,pending,release,get preview(){return preview;},confirm:()=>confirm(),retry:()=>retry(),get hasRetry(){return!!retry;},get resultId(){return resultId;},close(){release();bridge.dispose();globalThis.document=previous;}};
}
test('expired or differently selected correction previews never POST',async()=>{
  for(const change of ['expired','selection']){
    const x=await setup();try{
      if(change==='expired')x.preview.expires_at=new Date(0).toISOString();else await x.bridge.select('200');
      await x.confirm();assert.equal(x.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/corrections')).length,0);
    }finally{x.close();}
  }
});
test('saved correction without an operation retries only PROP-05 and selects its exact proposal result',async()=>{
  const x=await setup({noOperation:true});try{
    await x.confirm();assert.equal(x.hasRetry,true);
    delete x.scenarios['PRED-05'];await x.retry();await x.confirm();
    const saves=x.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/corrections'));
    const retries=x.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/proposal-regenerations'));
    assert.equal(saves.length,1);assert.deepEqual(Object.keys(saves[0].body),['confirmation_token']);
    assert.equal(retries.length,1);assert.deepEqual(Object.keys(retries[0].body).sort(),['expected_prediction_id','situation_revision']);
    assert.equal(x.state.inc['100'].viewRun.apiId,x.resultId);
    assert.ok(x.calls.some(c=>c.path.endsWith('/proposals/'+x.resultId)));
  }finally{x.close();}
});
test('finished correction regeneration cannot reselect the incident left by the user',async()=>{
  const x=await setup({delayed:true});try{
    const saved=x.confirm();await x.pending;await x.bridge.select('200');x.release();await saved;
    assert.equal(x.state.incId,'200');
  }finally{x.close();}
});
test('COR-02 accepts a normal empty history and rejects records from another incident',async()=>{
  for(const items of [[],[{...createFixtures()['COR-02'].items[0],incident_id:'999'}]]){
    const source=createApiDataSource(createApiClient({mode:'http',fetcher:async()=>Response.json({data:{items,next_cursor:null,has_more:false},meta:{request_id:'history-test'}})}));
    if(items.length)await assert.rejects(source.corrections('100'),e=>e.kind==='protocol');
    else assert.deepEqual(await source.corrections('100'),[]);
  }
});
