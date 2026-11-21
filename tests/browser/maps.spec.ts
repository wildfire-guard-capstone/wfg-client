import { fillScenarioLogin } from './helpers/login';
import { test, expect } from '@playwright/test';
import { createMockFetch } from '../../src/api/mock/transport';
import { screenMockOptions } from '../../src/api/screen/mock-seed';
import { createScenario } from '../../src/data/scenario';
import { calculateRisk } from '../../src/models/risk';
test.use({ screenshot: 'off' });
async function backend(page, failed = false) {
  const S = createScenario();
  const fetcher = createMockFetch({ ...screenMockOptions(S, calculateRisk(S.risk_model, S.incidents[0]!.risk_demo_runs![0]!.values, [])), latencyMs: 0, scenarios: failed ? { 'MAP-02': 'unavailable' } : {} });
  // Fixed test-only facility coordinates; application HTTP data is never replaced.
  const facility = {id:'qa-hall',type:'SHELTER',subtype:'마을회관',name:'QA 전용 마을회관',capacity:20,capacity_unit:'명',address:null,phone:null,village_id:null,sigungu_id:'10',attrs:{}};
  const point = {type:'Point',coordinates:[128.64,36.38]};
  const features = (items: unknown[]) => ({data:{type:'FeatureCollection',features:items,next_cursor:null,has_more:false},meta:{request_id:'qa-community-map'}});
  const shape = {type:'MultiPolygon',coordinates:[[[[128.638,36.378],[128.644,36.378],[128.644,36.384],[128.638,36.378]]]]};
  const hall = {id:'qa-admin-hall',village_id:'61',name:'QA 행정리',seq:1,hall_name:'QA 전용 경로당',hall_point:{...point,coordinates:[128.641,36.38]},hall_source:'테스트 전용',houses_est:null,attrs:{}};
  const calls: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/v1/**', async route => {
    const r = route.request(), path = new URL(r.url()).pathname; calls.push(path);
    if (!failed && path === '/api/v1/map/layers/villages/features') {
      // A fixed legal-ri fixture also covers the narrow viewport's tiny bbox.
      await route.fulfill({json:features([{type:'Feature',geometry:shape,properties:{
        id:'qa-legal-ri',code:'test-ri',name:'QA 법정리',admin_area_id:'11',label_point:point,
        population:20,population_month:'2026-11-01',pop65_est:null,pop0_14_est:null,houses_est:null,
      }}])}); return;
    }
    if (!failed && path === '/api/v1/map/layers/facilities/features') {
      await route.fulfill({json:features([
        {type:'Feature',geometry:point,properties:facility},
        {type:'Feature',geometry:{...point,coordinates:[128.642,36.38]},properties:{...facility,id:'qa-shelter',subtype:'학교',name:'QA 전용 대피소'}},
      ])}); return;
    }
    if (!failed && path === '/api/v1/map/layers/admin_villages/features') {
      await route.fulfill({json:features([
        {type:'Feature',geometry:shape,properties:hall},
        {type:'Feature',geometry:shape,properties:{...hall,id:'duplicate',hall_name:facility.name,hall_point:point}},
        {type:'Feature',geometry:shape,properties:{...hall,id:'unnamed',hall_name:null}},
        {type:'Feature',geometry:shape,properties:{...hall,id:'no-point',hall_point:null}},
      ])}); return;
    }
    if (path === '/api/v1/map/entities/facility/qa-hall' || path === '/api/v1/map/entities/admin_village/qa-admin-hall') {
      const admin = path.includes('/admin_village/');
      await route.fulfill({json:{data:{entity_type:admin?'admin_village':'facility',entity:admin?hall:{...facility,geometry:point}},meta:{request_id:'qa-community-detail'}}}); return;
    }
    const response = await fetcher(r.url(), { method: r.method(), headers: r.headers(), ...(r.postData() ? { body: r.postData()! } : {}) });
    if (!failed && path === '/api/v1/map/layers' && response.ok) {
      const body = await response.json();
      body.data.push({id:'admin_villages',name:'행정리 마을 구역',entity_type:'admin_village',available:true,source:'테스트 전용',reference_date:null,attribution:null});
      await route.fulfill({json:body}); return;
    }
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }).catch(() => {});
  });
  await page.goto('/'); await fillScenarioLogin(page); await page.locator('#login-btn').click();
  await expect(page.locator('#login-overlay')).toBeHidden();
  return { calls, errors };
}
for (const width of [1440,390]) test(`HTTP legal-ri boundaries and confirmed community icons at ${width}px retain styles, details and toggles`, async ({ page }) => {
  await page.setViewportSize({width,height:960});
  const { calls, errors } = await backend(page);
  await expect.poll(() => page.evaluate(() => window.__mock.S.villages.length)).toBeGreaterThan(0);
  expect(calls).toContain('/api/v1/admin-areas');
  expect(calls).toContain('/api/v1/map/layers');
  await expect(page.locator('.mk.village')).toHaveCount(2);
  await expect(page.locator('.mk.shelter')).toHaveCount(1);
  const markers = await page.evaluate(() => Object.keys(window.__mock.state.markers).filter(k=>k.startsWith('v:')));
  expect(markers.sort()).toEqual(['v:admin_village:qa-admin-hall','v:facility:qa-hall']);
  const geometry = await page.evaluate(async () => {
    const map=window.__mock.map, source=await map.getSource('admin').getData();
    return {features:source.features,source:map.getLayer('admin-sig').source,color:map.getPaintProperty('admin-sig','line-color'),width:map.getPaintProperty('admin-sig','line-width')};
  });
  expect(geometry.features.length).toBeGreaterThan(0);
  expect(geometry.features.every(f=>f.properties.api_entity_type==='village' && ['Polygon','MultiPolygon'].includes(f.geometry.type))).toBe(true);
  expect(geometry.features.some(f=>f.properties.id==='qa-admin-hall')).toBe(false);
  expect(geometry.source).toBe('admin'); expect(geometry.color).toBe('#ffd400'); expect(geometry.width).toBe(4);
  const marker=page.locator('.mk.village').filter({hasText:'QA 전용 마을회관'});
  await marker.evaluate((el:HTMLElement)=>el.click());
  await expect(page.locator('.map-popup')).toContainText('QA 전용 마을회관');
  expect(calls).toContain('/api/v1/map/entities/facility/qa-hall');
  await page.locator('.mk.village').filter({hasText:'QA 전용 경로당'}).evaluate((el:HTMLElement)=>el.click());
  await expect(page.locator('.map-popup')).toContainText('QA 전용 경로당');
  await expect(page.locator('.map-popup')).not.toContainText('QA 행정리');
  expect(calls).toContain('/api/v1/map/entities/admin_village/qa-admin-hall');
  await page.locator('.lyr-btn[data-layer="villages"]').click();
  await expect.poll(()=>marker.evaluate((el:HTMLElement)=>el.style.display)).toBe('none');
  await page.locator('.lyr-btn[data-layer="villages"]').click();
  await expect.poll(()=>marker.evaluate((el:HTMLElement)=>el.style.display)).toBe('');
  const coordinates=await page.evaluate(()=>window.__mock.state.markers['v:facility:qa-hall'].getLngLat().toArray());
  expect(coordinates).toEqual([128.64,36.38]);
  expect(await page.evaluate(async () => (await window.__mock.map.getSource('houses').getData()).features.every(f => f.geometry.type === 'Point'))).toBe(true);
  expect(errors).toEqual([]);
});
test('failed map layers leave the original controls available without scenario geography', async ({ page }) => {
  const { calls, errors } = await backend(page, true);
  await expect(page.locator('#sys-alert')).toContainText('지도 일부 조회 실패');
  expect(await page.evaluate(() => [window.__mock.S.villages.length, window.__mock.S.facilities.length, window.__mock.S.routes.length])).toEqual([0,0,0]);
  await expect(page.locator('.lyr-btn[data-layer="water"]')).toBeVisible();
  expect(calls.some(path => path.endsWith('/features'))).toBe(true);
  expect(errors).toEqual([]);
});
