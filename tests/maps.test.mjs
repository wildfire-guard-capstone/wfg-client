import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/api/client.ts';
import { createApiDataSource } from '../src/api/data-source.ts';
import { createFixtures } from '../src/api/mock/fixtures.ts';
import { mapRenderData, mapPosition } from '../src/api/screen/maps.ts';
const ok = data => Response.json({ data, meta: { request_id: 'map-test' } });

test('map window collects pages, preserves failed layers and supports actual admin-area search', async () => {
  const fixture = createFixtures(), calls = [];
  const source = createApiDataSource(createApiClient({ mode: 'http', fetcher: async url => {
    const u = new URL(url, 'http://test.invalid'); calls.push(u);
    if (u.pathname === '/api/v1/map/layers') return ok(fixture['MAP-01'].filter(l => ['villages','house'].includes(l.id)));
    if (u.pathname === '/api/v1/admin-areas') return ok(fixture['MAP-04']);
    if (u.pathname.includes('/house/')) return Response.json({ error: { code: 'INTERNAL_ERROR', message: '일시적 실패', fields: [] }, meta: { request_id: 'failed-layer' } }, { status: 503 });
    const more = !u.searchParams.has('cursor');
    return ok({ ...fixture['MAP-02'], has_more: more, next_cursor: more ? 'page-2' : null });
  }}));
  const data = await source.mapWindow('128,36,129,37');
  assert.equal(data.collections.get('villages').data.features.length, 2);
  assert.equal(data.collections.get('house').error.status, 503);
  assert.equal(mapRenderData(data).houses.features.length, 0);
  await source.adminAreas({ q: '안평', level: 'EMD', parent_id: '9007199254740993' });
  const query = calls.at(-1).searchParams;
  assert.equal(query.get('q'), '안평');
  assert.equal(query.get('parent_id'), '9007199254740993');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(source.mapWindow('128,36,129,37', controller.signal), e => e.name === 'AbortError');
});

test('map view preserves GeoJSON including holes and never generates village/house coordinates or population estimates', () => {
  const fixture = createFixtures(), village = fixture['MAP-02'].features[0];
  const boundary = { ...structuredClone(village), properties: { id: '10', level: 'SIGUNGU', name: '관할' } };
  village.geometry.coordinates[0].push(structuredClone(village.geometry.coordinates[0][0]));
  const data = { layers: [], areas: { status: 'ready', data: fixture['MAP-04'].items }, collections: new Map([
    ['villages', { status: 'ready', data: fixture['MAP-02'] }],
    ['admin_areas', { status: 'ready', data: { type: 'FeatureCollection', features: [boundary] } }],
  ]) };
  const view = mapRenderData(data);
  assert.equal(view.markers.length, 0, 'village label points are not community facilities');
  assert.ok(Number.isNaN(view.villages[0].hh));
  assert.ok(Number.isNaN(view.villages[0].disabled));
  assert.equal(view.houses.features.length, 0);
  assert.equal(view.facilities.length, 0);
  assert.deepEqual(view.boundaries.features[0].geometry, village.geometry);
  assert.equal(view.boundaries.features[0].properties.api_entity_type, 'village');
  assert.equal(view.boundaries.features[0].properties.api_entity_id, village.properties.id);
  assert.equal(boundary.properties.level, 'SIGUNGU');
  assert.equal(mapPosition({ type: 'Point', coordinates: [999, 35] }), null);
});

const remoteFeatures = features => ({ status: 'ready', data: { type: 'FeatureCollection', features } });
const feature = (properties, geometry = { type: 'Point', coordinates: [128.59,36.38] }) => ({ type: 'Feature', geometry, properties });
const windowData = entries => ({ layers: [], areas: { status: 'ready', data: [] }, collections: new Map(entries.map(([id,features]) => [id,remoteFeatures(features)])) });

test('only named community facilities use real Point coordinates; shelter facts and other facilities survive', () => {
  const p = { id: 'hall', type: 'SHELTER', subtype: '경로당', name: 'QA 회관 경로당', capacity: 12 };
  const data = windowData([['facilities',[
    feature(p), feature({...p,id:'school',subtype:'학교',name:'QA 학교'}),
    feature({...p,id:'no-point'}, {type:'Polygon',coordinates:[[[128,36],[129,36],[128,37],[128,36]]]}),
    feature({...p,id:'no-name',name:null}),
    feature({...p,id:'bad-point'}, {type:'Point',coordinates:[200,36]}),
  ]]]);
  const original = structuredClone(data);
  const view = mapRenderData(data);
  assert.deepEqual(view.markers.filter(m=>m.cls==='village').map(m=>[m.id,m.entity,m.position]), [['hall','facility',[128.59,36.38]]]);
  assert.equal(view.markers.some(m=>m.id==='hall' && m.cls==='shelter'), false);
  assert.equal(view.markers.find(m=>m.id==='school').cls,'shelter');
  assert.equal(view.shelters.find(s=>s.id==='hall').capacity,12);
  assert.deepEqual(data,original);
});

test('administrative-ri inferred polygons never become boundaries or fallback coordinates; confirmed halls deduplicate', () => {
  const village = createFixtures()['MAP-02'].features[0];
  const hall = { id: 'admin-1', village_id: village.properties.id, name: 'QA 행정2리', hall_name: 'QA 실제회관', hall_source: 'backend fixture', hall_point: {type:'Point',coordinates:[128.59,36.38]} };
  const inferred = {...village.geometry};
  const data = windowData([
    ['villages',[village,feature({...village.properties,id:'point-only'},village.properties.label_point)]],
    ['admin_villages',[
      feature(hall,inferred), feature({...hall,id:'unknown',hall_name:null},inferred),
      feature({...hall,id:'center-only',hall_point:null},inferred),
      feature({...hall,id:'invalid',hall_point:{type:'Point',coordinates:[128,99]}},inferred),
    ]],
    ['facilities',[feature({id:'facility-1',type:'SHELTER',subtype:'마을회관',name:hall.hall_name})]],
  ]);
  const view = mapRenderData(data);
  assert.equal(view.boundaries.features.length,1);
  assert.equal(view.boundaries.features[0].properties.api_entity_type,'village');
  assert.equal(view.boundaries.features.some(f=>f.properties.api_entity_type==='admin_village'),false);
  assert.equal(view.markers.filter(m=>m.cls==='village').length,1);
  data.collections.delete('facilities');
  const adminHall = mapRenderData(data).markers;
  assert.equal(adminHall.length,1);
  assert.equal(adminHall[0].name,hall.hall_name);
  assert.equal(adminHall[0].entity,'admin_village');
  assert.deepEqual(adminHall[0].position,hall.hall_point.coordinates);
  assert.equal(mapRenderData(windowData([])).boundaries.features.length,0);
});
