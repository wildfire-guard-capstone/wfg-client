import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, createApiDataSource, createMockFetch, createFixtures } from '../src/api/index.ts';
import { resourceRequest } from '../src/api/screen/resources.ts';
import { createScreenBridge } from '../src/api/screen/bridge.ts';
import { createScenario } from '../src/data/scenario.ts';
const form = { type:'차량', name:'검증 자원', qty:1, base:'31', status:'대기' };
const make = () => createApiDataSource(createApiClient({ mode:'http', fetcher:createMockFetch({latencyMs:0}) }));
const login = (source,role='ADMIN') => source.api.auth.login({body:{login_id:'mock-'+role.toLowerCase(),password:'mock-password',role}});
test('resource form maps exact fields and rejects unsupported crew, quantity, base and deployment',()=>{
  const bases=createFixtures()['BASE-01'].items;
  assert.deepEqual(resourceRequest(form,bases),{kind:'VEHICLE',name:form.name,base_id:'31',status:'AVAILABLE'});
  for(const patch of [{type:'인력'},{qty:2},{base:'unknown'},{status:'투입'}]) assert.throws(()=>resourceRequest({...form,...patch},bases));
  const current={...createFixtures()['RES-01'].items[0],attrs:{capacity_l:600}};
  assert.deepEqual(resourceRequest({...form,type:'헬기',name:current.name,status:'정비'},bases,current),{status:'MAINTENANCE'});
});
test('HTTP resource CRUD returns exact records, refreshes list and summary and preserves omitted attrs',async()=>{
  const s=make();await login(s);
  const before=await s.resources();
  const row=await s.api.resources.create({body:{kind:'VEHICLE',name:form.name,base_id:'31',attrs:{capacity_l:300}}});
  assert.equal((await s.resources()).list.data.length,before.list.data.length+1);
  const updated=await s.api.resources.update({path:{resource_id:row.id},body:{status:'MAINTENANCE'}});
  assert.deepEqual(updated.attrs,{capacity_l:300});
  assert.equal((await s.resources()).summary.data.bases.find(r=>r.kind==='VEHICLE').maintenance,1);
  await s.api.resources.remove({path:{resource_id:row.id}});
  assert.equal((await s.resources()).list.data.length,before.list.data.length);
  await assert.rejects(s.api.resources.remove({path:{resource_id:row.id}}),e=>e.status===404);
});
test('resource write routes enforce ADMIN and readers require incident context',async()=>{
  const s=make();await login(s,'VIEWER');
  await assert.rejects(s.api.resources.list({}),e=>e.status===422);
  assert.equal((await s.api.resources.list({query:{incident_id:'100'}})).items.length,1);
  for(const [action,args] of [['create',{body:{kind:'VEHICLE',name:'denied',base_id:'31'}}],['update',{path:{resource_id:'61'},body:{name:'denied'}}],['remove',{path:{resource_id:'61'}}]])
    await assert.rejects(s.api.resources[action](args),e=>e.status===403);
  await login(s,'REPORTER');await assert.rejects(s.api.resources.list({query:{incident_id:'100'}}),e=>e.status===403);
});
test('admin bridge binds real resource mutations, prevents duplicate writes and preserves state on failure',async()=>{
  const previous=globalThis.document;
  const fields=new Map(Object.entries({'login-id':'mock-admin','login-pw':'mock-password','login-role':'admin'}).map(([id,value])=>[id,{value}]));
  globalThis.document={getElementById:id=>fields.get(id)??null,querySelectorAll:()=>[]};
  const scenarios={}, fetcher=createMockFetch({latencyMs:0,scenarios});let writes=0, release;
  const gate=new Promise(r=>release=r);let delay=false;
  const source=createApiDataSource(createApiClient({mode:'http',fetcher:async(url,init)=>{if(init.method!=='GET'&&String(url).includes('/admin/resources')){writes++;if(delay)await gate;}return fetcher(url,init);}}));
  const S=createScenario(),state={role:null,incId:'100',inc:{},events:[]}, notices=[];
  const bridge=createScreenBridge(source,{S,state,IS:()=>({}),loginBusy(){},loginError(m){if(m)assert.fail(m);},notice:m=>notices.push(m),enter:a=>state.role=a.role,admin(){},busy(){},chatBusy(){}});
  try{
    await bridge.login();const initial=structuredClone(S.resources);delay=true;
    const first=bridge.changeResource('create',undefined,form);
    await bridge.changeResource('create',undefined,form);release();await first;
    assert.equal(writes,1);assert.equal(S.resources.length,initial.length+1);
    scenarios['RES-04']='server-error';const known=structuredClone(S.resources);
    const row=S.resources.find(r=>r.name===form.name);
    await bridge.changeResource('update',row.id,{...form,name:'failed change'});
    assert.deepEqual(S.resources,known);assert.ok(notices.length);
    delete scenarios['RES-04'];scenarios['RES-01']='server-error';
    await bridge.changeResource('update',row.id,{...form,name:'saved but refresh failed'});
    assert.deepEqual(S.resources,known);
  }finally{release();bridge.dispose();globalThis.document=previous;}
});
