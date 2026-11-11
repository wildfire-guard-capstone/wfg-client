import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, createApiDataSource, createFixtures, createMockFetch } from '../src/api/index.ts';
import { createScreenBridge } from '../src/api/screen/bridge.ts';
import { createScenario } from '../src/data/scenario.ts';
const login=(s,role='ADMIN')=>s.api.auth.login({body:{login_id:'mock-'+role.toLowerCase(),password:'mock-password',role}});
const make=options=>createApiDataSource(createApiClient({mode:'http',fetcher:createMockFetch({latencyMs:0,...options})}));
const issued={login_id:'mock-new-account',name:'모의 사용자',organization:'모의 기관',role:'REPORTER',admin_area_id:'10'};
test('USR-01~06 HTTP flow uses numeric IDs, partial fields, soft revocation and one-time reset passwords',async()=>{
  const fixtures=createFixtures();fixtures['USR-01'].items.find(u=>u.id==='3').failed_login_count=5;
  const s=make({fixtures});await login(s);
  const first=await s.api.users.list({query:{limit:1,include_deleted:true}});
  const next=await s.api.users.list({query:{limit:1,cursor:first.next_cursor}});assert.notEqual(first.items[0].id,next.items[0].id);
  const created=await s.api.users.create({body:issued});const path={user_id:created.user.id};
  const updated=await s.api.users.update({path,body:{name:'수정 이름',role:'VIEWER'}});
  assert.equal(updated.name,'수정 이름');assert.equal(updated.admin_area_id,'10');assert.equal(updated.organization,issued.organization);
  const password=await s.api.users.resetPassword({path:{user_id:'3'}});
  assert.equal(password.user_id,'3');assert.equal((await s.users()).find(u=>u.id==='3').failed_login_count,5);
  assert.equal((await s.api.users.unlock({path:{user_id:'3'}})).failed_login_count,0);
  assert.equal((await s.users()).some(u=>'temporary_password' in u),false);
  await s.api.users.revoke({path});await s.api.users.revoke({path});
  assert.equal((await s.api.users.list()).items.some(u=>u.id===path.user_id),false);
  assert.ok((await s.users()).find(u=>u.id===path.user_id).deleted_at);
  for(const action of ['resetPassword','unlock'])await assert.rejects(s.api.users[action]({path}),e=>e.status===409&&e.code==='ACCOUNT_REVOKED');
  await assert.rejects(s.api.users.update({path,body:{name:'revived'}}),e=>e.status===409&&e.code==='ACCOUNT_REVOKED');
});
test('USR admin, self and last-commander policies stay enforced; updates affect existing mock sessions',async()=>{
  const s=make();await login(s);
  await assert.rejects(s.api.users.update({path:{user_id:'4'},body:{role:'VIEWER',admin_area_id:'10'}}),e=>e.code==='SELF_MODIFICATION');
  await assert.rejects(s.api.users.revoke({path:{user_id:'4'}}),e=>e.code==='SELF_MODIFICATION');
  await assert.rejects(s.api.users.revoke({path:{user_id:'1'}}),e=>e.code==='LAST_COMMANDER');
  await assert.rejects(s.api.users.update({path:{user_id:'1'},body:{role:'VIEWER'}}),e=>e.code==='LAST_COMMANDER');
  await assert.rejects(s.api.users.update({path:{user_id:'3'},body:{role:'ADMIN'}}),e=>e.code==='INVALID_JURISDICTION');
  const second=createApiDataSource(createApiClient({mode:'http',fetcher:createMockFetch({latencyMs:0})}));await login(second,'VIEWER');
  for(const [action,args] of [['list',{}],['create',{body:issued}],['update',{path:{user_id:'3'},body:{name:'denied'}}],...['revoke','resetPassword','unlock'].map(action=>[action,{path:{user_id:'3'}}])])await assert.rejects(second.api.users[action](args),e=>e.status===403);
  const fetcher=createMockFetch({latencyMs:0});const admin=createApiDataSource(createApiClient({mode:'http',fetcher})), user=createApiDataSource(createApiClient({mode:'http',fetcher}));await login(admin);await login(user,'REPORTER');
  await admin.api.users.update({path:{user_id:'3'},body:{role:'VIEWER'}});assert.equal((await user.api.auth.me()).role,'VIEWER');
  await admin.api.users.revoke({path:{user_id:'3'}});await assert.rejects(user.api.auth.me(),e=>e.status===401);
});
async function setup(){
  const previous=globalThis.document,fields=new Map(Object.entries({'login-id':'mock-admin','login-pw':'mock-password','login-role':'admin'}).map(([k,value])=>[k,{value}]));
  const role={dataset:{role:'mock-reporter'},value:'viewer'},del={dataset:{del:'mock-reporter'}};
  globalThis.document={getElementById:id=>fields.get(id)??null,querySelectorAll:selector=>selector==='[data-role]'?[role]:selector==='[data-del]'?[del]:[]};
  const scenarios={},fetcher=createMockFetch({latencyMs:0,scenarios}),calls=[],notices=[],shown=[];let modal,release,delay=false,admins=0;const gate=new Promise(r=>release=r);
  const s=createApiDataSource(createApiClient({mode:'http',fetcher:async(url,init)=>{calls.push({path:new URL(url,'http://test.invalid').pathname,method:init.method,body:init.body&&JSON.parse(init.body)});if(delay&&init.method==='PATCH')await gate;return fetcher(url,init);}}));
  const S=createScenario(),state={role:null,incId:'100',inc:{},events:[]};
  const bridge=createScreenBridge(s,{S,state,IS:()=>({}),loginBusy(){},loginError(m){if(m)assert.fail(m);},notice:m=>notices.push(m),enter:a=>{state.role=a.role;state.user=a.id;},admin(){admins++;},busy(){},chatBusy(){},leave(){state.role=null;},issued:(a,p,title)=>shown.push({a,p,title}),modal:(title,body,actions)=>modal={title,body,actions}});
  await bridge.login();return {bridge,S,state,role,del,calls,notices,shown,scenarios,release,set delay(v){delay=v;},get modal(){return modal;},get admins(){return admins;},close(){release();bridge.dispose();globalThis.document=previous;}};
}
test('existing role UI maps login ID to server user ID; unsupported permanent delete never sends DELETE',async()=>{
  const x=await setup();try{
    x.role.onchange();assert.equal(x.modal.title,'권한 변경 확인');assert.equal(x.calls.filter(c=>c.method==='PATCH').length,0);
    await x.modal.actions.find(a=>a.label==='변경').onClick();
    const sent=x.calls.find(c=>c.method==='PATCH');assert.equal(sent.path,'/api/v1/admin/users/3');assert.deepEqual(sent.body,{role:'VIEWER'});
    assert.equal(x.S.accounts.find(a=>a.id==='mock-reporter').role,'viewer');
    x.del.onclick();assert.equal(x.calls.filter(c=>c.method==='DELETE').length,0);assert.ok(x.notices.some(n=>n.includes('영구 삭제 API')));
  }finally{x.close();}
});
test('user actions deduplicate, preserve failed writes and retain one-time password if list refresh fails',async()=>{
  const x=await setup();try{
    x.delay=true;const first=x.bridge.changeUser({action:'update',loginId:'mock-reporter',body:{name:'변경'}});
    await x.bridge.changeUser({action:'update',loginId:'mock-reporter',body:{name:'중복'}});x.release();await first;
    assert.equal(x.calls.filter(c=>c.method==='PATCH').length,1);
    const known=structuredClone(x.S.accounts);x.scenarios['USR-03']='server-error';
    await x.bridge.changeUser({action:'update',loginId:'mock-reporter',body:{name:'실패'}});assert.deepEqual(x.S.accounts,known);
    x.scenarios['USR-01']='server-error';await x.bridge.changeUser({action:'resetPassword',loginId:'mock-reporter'});
    assert.equal(x.shown.length,1);assert.equal(x.shown[0].title,'초기 비밀번호 재발급');assert.ok(x.shown[0].p.startsWith('mock-reset-'));
    assert.ok(x.S.accounts.every(a=>a.pw===''));assert.ok(x.notices.some(n=>n.includes('목록 재조회')));
  }finally{x.close();}
});
test('old-session user mutations cannot refresh or show passwords after session expiry',async()=>{
  const x=await setup();try{
    x.delay=true;const pending=x.bridge.changeUser({action:'update',loginId:'mock-reporter',body:{name:'이전 세션'}});
    const known=structuredClone(x.S.accounts);x.bridge.expire();const before=x.admins;x.release();await pending;
    assert.deepEqual(x.S.accounts,known);assert.equal(x.admins,before);assert.equal(x.shown.length,0);
  }finally{x.close();}
});
