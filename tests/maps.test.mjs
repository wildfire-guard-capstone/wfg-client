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
  boundary.geometry.coordinates[0].push(structuredClone(boundary.geometry.coordinates[0][0]));
  const data = { layers: [], areas: { status: 'ready', data: fixture['MAP-04'].items }, collections: new Map([
    ['villages', { status: 'ready', data: fixture['MAP-02'] }],
    ['admin_areas', { status: 'ready', data: { type: 'FeatureCollection', features: [boundary] } }],
  ]) };
  const view = mapRenderData(data);
  assert.deepEqual(view.markers[0].position, village.properties.label_point.coordinates);
  assert.equal(view.markers[0].cls, 'beop');
  assert.deepEqual(view.beop.features.map(f => f.geometry), fixture['MAP-02'].features.map(f => f.geometry));
  assert.deepEqual(view.adminVillages, []);
  assert.ok(Number.isNaN(view.villages[0].hh));
  assert.ok(Number.isNaN(view.villages[0].disabled));
  assert.equal(view.houses.features.length, 0);
  assert.equal(view.facilities.length, 0);
  assert.deepEqual(view.boundaries.features[0].geometry, boundary.geometry);
  assert.equal(view.boundaries.features[0].properties.level, 'sigungu');
  assert.equal(boundary.properties.level, 'SIGUNGU');
  assert.equal(mapPosition({ type: 'Point', coordinates: [999, 35] }), null);
});

test('행정리는 hall_point에 이름으로 찍고 소속 법정리 · 읍면을 붙인다 — 좌표가 없으면 만들지 않는다', () => {
  const fixture = createFixtures(), village = fixture['MAP-02'].features[0];
  const hall = { type: 'Point', coordinates: [128.5997, 36.3781] };
  const row = (id, name, hall_point) => ({ type: 'Feature', id, geometry: village.geometry, properties: { id, village_id: village.properties.id, name, seq: 1, hall_name: '회관 이름', hall_point, hall_source: null, houses_est: 24, attrs: {} } });
  const view = mapRenderData({ layers: [], areas: { status: 'ready', data: fixture['MAP-04'].items }, collections: new Map([
    ['villages', { status: 'ready', data: fixture['MAP-02'] }],
    ['admin_villages', { status: 'ready', data: { type: 'FeatureCollection', features: [row('365', '괴산1리', hall), row('366', '괴산2리', null)] } }],
  ]) });
  assert.deepEqual(view.adminVillages, [{ id: '365', lng: 128.5997, lat: 36.3781 }]);
  const marker = view.markers.find(m => m.entity === 'admin_village');
  assert.equal(marker.key, 'h:365');
  assert.equal(marker.name, '괴산1리');
  assert.equal(marker.villageId, village.properties.id);
  assert.deepEqual(marker.position, hall.coordinates);
  assert.ok(marker.kind.endsWith(village.properties.name));
  assert.equal(view.markers.filter(m => m.entity === 'admin_village').length, 1);
});
