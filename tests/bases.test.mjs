import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, createApiDataSource, createMockFetch } from '../src/api/index.ts';
import { createScreenBridge } from '../src/api/screen/bridge.ts';
import { createScenario } from '../src/data/scenario.ts';
const body={name:'모의 기지',org_type:'테스트 기관',coverage_area_ids:['10'],geometry:{type:'Point',coordinates:[128,36]}};
const login=(s,role='ADMIN')=>s.api.auth.login({body:{login_id:'mock-'+role.toLowerCase(),password:'mock-password',role}});
const source=()=>createApiDataSource(createApiClient({mode:'http',fetcher:createMockFetch({latencyMs:0})}));
test('base CRUD preserves contract fields, whole coverage replacement, explicit null and resource dependency',async()=>{
  const s=source();await login(s);
  const base=await s.api.bases.create({body:{...body,coverage_area_ids:['10','10']}});
  assert.deepEqual(base.coverage_area_ids,['10']);assert.deepEqual(base.geometry,body.geometry);assert.equal(base.jurisdiction,null);
  assert.equal((await s.api.bases.list()).items.length,2);
  const updated=await s.api.bases.update({path:{base_id:base.id},body:{geometry:null,coverage_area_ids:[]}});
  assert.equal(updated.geometry,null);assert.deepEqual(updated.coverage_area_ids,[]);assert.equal(updated.name,body.name);
  const resource=await s.api.resources.create({body:{kind:'VEHICLE',name:'모의 차량',base_id:base.id}});
  await assert.rejects(s.api.bases.remove({path:{base_id:base.id}}),e=>e.status===409&&e.code==='BASE_IN_USE');
  assert.equal((await s.api.resources.list()).items.some(r=>r.id===resource.id),true);
  await s.api.resources.remove({path:{resource_id:resource.id}});await s.api.bases.remove({path:{base_id:base.id}});
  assert.equal((await s.api.bases.list()).items.length,1);
  await assert.rejects(s.api.bases.remove({path:{base_id:base.id}}),e=>e.status===404);
});
test('base validation and roles reject unknown coverage, empty updates and non-admin changes',async()=>{
  const s=source();await login(s);
  await assert.rejects(s.api.bases.create({body:{...body,coverage_area_ids:['11']}}),e=>e.status===422&&e.code==='INVALID_COVERAGE');
  await assert.rejects(s.api.bases.create({body:{...body,geometry:{type:'Polygon',coordinates:[]}}}),e=>e.status===422);
  await assert.rejects(s.api.bases.update({path:{base_id:'31'},body:{}}),e=>e.status===422);
  await login(s,'VIEWER');assert.equal((await s.api.bases.list({query:{incident_id:'100'}})).items.length,1);
  for(const [action,args] of [['create',{body}],['update',{path:{base_id:'31'},body:{name:'denied'}}],['remove',{path:{base_id:'31'}}]])await assert.rejects(s.api.bases[action](args),e=>e.status===403);
});
test('guarded base mutations refresh existing resource names, deduplicate and preserve cache on conflicts',async()=>{
  const previous=globalThis.document,fields=new Map(Object.entries({'login-id':'mock-admin','login-pw':'mock-password','login-role':'admin'}).map(([id,value])=>[id,{value}]));
  globalThis.document={getElementById:id=>fields.get(id)??null,querySelectorAll:()=>[]};
  const fetcher=createMockFetch({latencyMs:0});let failDelete=false,writes=0,delay=false,release;const gate=new Promise(r=>release=r);
  const s=createApiDataSource(createApiClient({mode:'http',fetcher:async(url,init)=>{
    if(init.method!=='GET'&&String(url).includes('/admin/resource-bases')){writes++;if(delay)await gate;}
    if(failDelete&&init.method==='DELETE')return Response.json({error:{code:'HISTORICAL_REFERENCE',message:'지난 제안 참조',fields:[]},meta:{request_id:'mock-history'}},{status:409});
    return fetcher(url,init);
  }}));
  const S=createScenario(),state={role:null,incId:'100',inc:{},events:[]},notices=[];
  const bridge=createScreenBridge(s,{S,state,IS:()=>({}),loginBusy(){},loginError(m){if(m)assert.fail(m);},notice:m=>notices.push(m),enter:a=>state.role=a.role,admin(){},busy(){},chatBusy(){}});
  try{
    await bridge.login();delay=true;
    const first=bridge.changeBase({action:'update',id:'31',body:{name:'새 기지명'}});
    await bridge.changeBase({action:'update',id:'31',body:{name:'중복'}});release();await first;
    assert.equal(writes,1);assert.equal(S.resources[0].base,'새 기지명');
    const known=structuredClone(S.resources);failDelete=true;
    await bridge.changeBase({action:'remove',id:'31'});assert.deepEqual(S.resources,known);assert.ok(notices.some(m=>m.includes('지난 제안')));
    state.role='viewer';await bridge.changeBase({action:'create',body});assert.equal(writes,2);
  }finally{release();bridge.dispose();globalThis.document=previous;}
});
