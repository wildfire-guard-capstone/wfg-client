import {test,expect,type Page} from '@playwright/test';
import {createFixtures} from '../../src/api/mock/fixtures';
import {createMockFetch} from '../../src/api/mock/transport';
test.use({screenshot:'off'});

async function setup(page:Page,empty=false) {
  const f=createFixtures(),current=structuredClone(f['PROP-03']);
  current.items.forEach(i=>{i.state='GENERATED';i.categories=['IMMEDIATE'];i.sections=[{title:'제안',blocks:[{type:'paragraph',body:'실제 응답 형식의 검증용 제안',evidence:[]}]}];});
  for(const code of ['S2','E2']) {const i=current.items.find(i=>i.item_code===code)!;i.state='NOT_TRIGGERED';i.categories=[];}
  const agency=current.items.find(i=>i.item_code==='S6')!;
  agency.name='유관기관 동원·협조 요청';agency.categories=['REQUEST'];agency.finding='기관별 협조 필요';
  agency.evidence=[{...f['PROP-03'].items[0]!.evidence[0]!,doc_name:'검증용 근거 문서',page:7}];
  agency.sections=[{title:'제안',blocks:[{type:'paragraph',category:'REQUEST',body:'기관 협조 요청',evidence:[agency.evidence[0]!.chunk_id],details:[{
    type:'table',head:['구분','세부 대상(기관명)','임무'],rows:[
      ['지원','기관가, 기관나, 기관다, 기관라, 기관마','원래 임무'],
      ['대기','기관가, 기관나, 기관다','세 기관 임무'],['미제공','','결측 유지'],
    ],
  }]}]}];
  const previous={...structuredClone(current),id:'70',version:'v1.0'};
  const original=JSON.stringify(current);const fetcher=createMockFetch({latencyMs:0,fixtures:{'PROP-03':current}});
  let writes=0;
  await page.route('**/api/v1/**',async route=>{
    const r=route.request(),path=new URL(r.url()).pathname;
    if(r.method()!=='GET'&&!path.endsWith('/auth/login')){writes++;await route.abort();return;}
    if(empty&&r.method()==='GET'&&/\/proposals(?:\/latest)?$/.test(path)) {
      await route.fulfill({status:200,json:{data:path.endsWith('/latest')?null:{items:[],has_more:false,next_cursor:null},meta:{request_id:'qa-empty-history'}}});return;
    }
    if(r.method()==='GET'&&(/\/proposals\/(?:latest|70|71)$/.test(path))) {
      await route.fulfill({status:200,json:{data:path.endsWith('/70')?previous:current,meta:{request_id:'qa-proposal-display'}}});return;
    }
    const response=await fetcher(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()!}:{})});
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()}).catch(()=>{});
  });
  await page.goto('/');await page.locator('#login-role').selectOption('commander');
  await page.locator('#login-id').fill('mock-commander');await page.locator('#login-pw').fill('mock-password');
  await page.locator('#login-btn').click();await expect(page.locator('#login-overlay')).toBeHidden();
  await page.locator('.ip-tab[data-tab="proposal"]').click();
  await expect(page.locator('#cards .card')).toHaveCount(empty?0:5);
  return {current,original,writes:()=>writes};
}
for(const width of [1440,390])test(`QA proposal ${width}px: minimal display, agency expansion, filters and history preserve facts`,async({page})=>{
  await page.setViewportSize({width,height:960});const server=await setup(page);
  await expect(page.locator('.ptab')).toHaveText(['진화','대피']);
  await expect(page.locator('#prop-meta')).toBeHidden();await expect(page.locator('#prop-summary')).toBeHidden();
  await expect(page.locator('#ipt-proposal > :first-child')).toHaveAttribute('id','hist-box');
  await expect(page.locator('#hist-box')).toHaveCount(1);
  await expect(page.locator('.pfilter')).toHaveText(['전체','즉시','대기','협의','요청']);
  await expect(page.locator('#cards [data-id="S2"]')).toHaveCount(0);
  await page.locator('.ptab[data-axis="대피"]').click();await expect(page.locator('#cards .card')).toHaveCount(5);
  await expect(page.locator('#cards [data-id="E2"]')).toHaveCount(0);
  await page.locator('.ptab[data-axis="진화"]').click();
  await page.locator('.pfilter[data-f="요청"]').click();await expect(page.locator('#cards .card')).toHaveCount(1);
  const card=page.locator('#cards .card[data-id="S6"]');
  await expect(card.locator('.prop-cat')).toHaveText('요청');
  await card.locator('.card-basis > .fold-toggle').click();
  await expect(card.locator('.card-basis .row .k')).toHaveText(['판정 이유','근거']);
  await expect(card.locator('.card-basis')).toContainText('검증용 근거 문서');
  await expect(card.locator('.card-basis')).toContainText('7');
  await card.locator('.prop-detail > .fold-toggle').click();
  const cells=card.locator('tbody tr').first().locator('td'),target=cells.nth(1);
  expect(await target.innerText()).toContain('기관가\n기관나\n기관다');expect(await target.innerText()).not.toContain('기관라');
  await expect(target.locator('summary')).toHaveText('외 2개 더 보기');
  await target.locator('summary').click();await expect(target.locator('summary')).toHaveText('접기');
  await expect(target.locator('details div')).toBeVisible();expect(await target.innerText()).toContain('기관라\n기관마');
  await target.locator('summary').click();await expect(target.locator('details div')).toBeHidden();
  await expect(target.locator('summary')).toHaveText('외 2개 더 보기');
  await expect(cells.nth(0)).toHaveText('지원');await expect(cells.nth(2)).toHaveText('원래 임무');
  await expect(card.locator('tbody tr').nth(1).locator('details')).toHaveCount(0);
  await expect(card.locator('tbody tr').nth(2).locator('td').nth(1)).toHaveText('');
  expect(await target.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.locator('.pfilter[data-f="즉시"]').click();await expect(page.locator('#cards .card')).toHaveCount(4);
  await page.locator('.pfilter[data-f="all"]').click();await expect(page.locator('#cards .card')).toHaveCount(5);
  await page.locator('#hist-box summary').click();await expect(page.locator('#hist-runs tr button[data-view]')).toHaveCount(2);
  await page.locator('#hist-runs [data-view="v1.0"]').click();
  await expect.poll(()=>page.evaluate(()=>window.__mock!.IS().viewRun.id)).toBe('v1.0');
  await page.locator('#hist-runs [data-view="v1.1"]').click();
  await expect.poll(()=>page.evaluate(()=>window.__mock!.IS().viewRun.id)).toBe('v1.1');
  await page.locator('#hist-runs [data-diff="v1.1"]').click();await expect(page.locator('#modal-bg')).toHaveClass(/on/);await expect(page.locator('#modal-title')).toContainText('v1.0 → v1.1');
  expect(await page.evaluate(()=>window.__mock!.IS().viewRun.blocks.length)).toBe(12);
  expect(JSON.stringify(server.current)).toBe(server.original);expect(server.writes()).toBe(0);
});
test('QA proposal empty history keeps the original empty state at the top',async({page})=>{
  const server=await setup(page,true);
  await expect(page.locator('#ipt-proposal > :first-child')).toHaveAttribute('id','hist-box');
  await page.locator('#hist-box summary').click();
  await expect(page.locator('#hist-runs')).toHaveText('아직 생성된 제안서가 없습니다.');
  await expect(page.locator('#hist-runs button')).toHaveCount(0);
  expect(server.writes()).toBe(0);
});
