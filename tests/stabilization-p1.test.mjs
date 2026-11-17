import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixtures } from '../src/api/mock/fixtures.ts';
import { createScenario } from '../src/data/scenario.ts';
import {
  text,
  numberText,
  riskView,
  proposalView,
} from '../src/api/screen/adapters.ts';

test('P1 absent values have readable labels while zero and false retain their facts', () => {
  for (const value of [null, undefined, '', NaN, Infinity])
    assert.equal(text(value), '정보 미제공');
  assert.equal(text(0), '0');
  assert.equal(text(false), 'false');
  assert.equal(numberText(NaN), '정보 미제공');
  assert.equal(numberText(0), '0.00');
});
test('P1 all 25 actual risk codes have documented units and retain missing reasons/sources', () => {
  const raw = createFixtures()['RISK-01'];
  const expected = {
    slope_up: '°',
    aspect: '°',
    curvature: '1/100 m',
    terrain_complexity: 'm',
    elevation: 'm',
    topographic_position: 'm',
    water_distance: 'km',
    fuel_load: 't/ha',
    forest_type: '',
    surface_fuel_depth: 'cm',
    stand_age: '년',
    canopy_height: 'm',
    canopy_cover: '%',
    wind_speed: 'm/s',
    humidity: '%',
    temperature: '℃',
    precipitation: 'mm',
    ground_temperature: '℃',
    precipitation_7d: 'mm',
    pressure: 'hPa',
    fuel_moisture: '%',
    vulnerable_population: '명',
    fire_station_distance: 'km',
    fire_area: 'ha',
    houses_nearby: '동',
  };
  raw.factors.forEach((f) => {
    f.raw_value = 0;
    f.reason = '원천 미수집';
    f.source = '서버 원천';
    f.value_at = '2026-11-16T00:00:00Z';
  });
  const view = riskView(raw, createScenario());
  assert.equal(view.vars.length, 25);
  for (const v of view.vars) {
    assert.equal(v.unit, expected[v.key], v.key);
    assert.equal(v.reason, '원천 미수집');
    assert.equal(v.source, '서버 원천');
    assert.equal(v.valueAt, '2026-11-16T00:00:00Z');
  }
  raw.factors.find((f) => f.code === 'wind_speed').raw_value = '분포 문자열';
  assert.equal(
    riskView(raw, createScenario()).vars.find((v) => v.key === 'wind_speed')
      .unit,
    '',
  );
});
test('P1 proposal keeps section and evidence structure for safe rendering instead of flattening the only copy', () => {
  const raw = createFixtures()['PROP-03'];
  const block = proposalView(raw, createScenario(), null).blocks[0];
  assert.deepEqual(block.apiSections, raw.items[0].sections);
});

const { richText, sectionHTML, remoteState, observedAt, canCorrectPerimeter } =
  await import('../src/api/screen/presentation.ts');
test('P1 safe breaks and structured paragraphs/lists/tables preserve content without running server HTML', () => {
  const input =
    '첫째<br>둘째<BR />셋째\n<script>alert(1)</script><img src=x onerror=alert(1)>[1]';
  const out = richText(input, 'S1" onmouseover="alert(1)');
  assert.ok(out.includes('첫째<br>둘째<br>셋째<br>'));
  assert.ok(!out.includes('<script>') && !out.includes('<img '));
  assert.ok(out.includes('&lt;script&gt;'));
  assert.ok(out.includes('&quot;'));
  const raw = createFixtures()['PROP-03'];
  const html = sectionHTML(
    raw.items[0].sections,
    { 'MOCK-EVIDENCE-001': 1 },
    'S1',
  );
  for (const tag of [
    '<section',
    '<p>',
    '<ul>',
    '<li>',
    '<table',
    '<th>',
    '<td>',
    'class="cite"',
  ])
    assert.ok(html.includes(tag), tag);
});
test('P1 remote states distinguish no generation, null, empty arrays, forbidden, server failure, partial and loading', () => {
  assert.equal(remoteState({ status: 'ready', data: 0 }), 'ready');
  assert.equal(remoteState({ status: 'ready', data: false }), 'ready');
  for (const data of [null, []])
    assert.equal(remoteState({ status: 'ready', data }), 'absent');
  assert.equal(
    remoteState({ status: 'not-requested' }, { generated: false }),
    'not-generated',
  );
  assert.equal(
    remoteState({ status: 'error', error: { status: 403 } }),
    'forbidden',
  );
  assert.equal(
    remoteState({ status: 'error', error: { status: 503 } }),
    'error',
  );
  assert.equal(
    remoteState({ status: 'ready', data: [1] }, { partial: true }),
    'partial',
  );
  assert.equal(remoteState(undefined, { loading: true }), 'loading');
});
test('P1 observed_at is explicit and valid; v0 Point never becomes a correction', () => {
  assert.throws(() => observedAt(''));
  assert.throws(() => observedAt('invalid'));
  assert.equal(observedAt('2026-11-16T01:23:00Z'), '2026-11-16T01:23:00.000Z');
  assert.equal(canCorrectPerimeter(0, 'Point'), false);
  assert.equal(canCorrectPerimeter(0, 'Polygon'), false);
  assert.equal(canCorrectPerimeter(1, 'Point'), false);
  assert.equal(canCorrectPerimeter(1, 'MultiPolygon'), true);
});
const { retainMapData } = await import('../src/api/screen/maps.ts');
const { validatePrediction, validateWeatherNow, matchPredictionSlices } =
  await import('../src/api/screen/predictions.ts');
test('P1 map failures retain known geometry; authoritative empty or unloaded layers do not retain it', () => {
  const data = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { id: 'known' },
        geometry: { type: 'Point', coordinates: [128, 36] },
      },
    ],
  };
  const prev = {
    layers: [],
    areas: { status: 'ready', data: [] },
    collections: new Map([['villages', { status: 'ready', data }]]),
  };
  for (const status of ['error', 'not-requested', 'ready']) {
    const next = {
      ...prev,
      collections: new Map([
        [
          'villages',
          status === 'ready'
            ? { status, data: { ...data, features: [] } }
            : status === 'error'
              ? { status, error: Error('503') }
              : { status },
        ],
      ]),
    };
    const merged = retainMapData(next, prev);
    if (status === 'error')
      assert.deepEqual(merged.collections.get('villages').data, data);
    else
      assert.deepEqual(
        merged.collections.get('villages'),
        next.collections.get('villages'),
      );
  }
});
test('P1 prediction partial results keep absent hours absent and reject mismatched timestamps/areas', () => {
  const f = createFixtures(),
    p = structuredClone(f['PRED-02']),
    s = structuredClone(f['PRED-03']);
  s.features = s.features.filter((x) => x.properties.hour !== 5);
  matchPredictionSlices(p, s);
  s.features[0].properties.area_ha += 1;
  assert.throws(
    () => matchPredictionSlices(p, s),
    (e) => e.kind === 'protocol',
  );
  p.slices[0].area_ha = NaN;
  assert.throws(
    () => validatePrediction(p, p.incident_id, p.id),
    (e) => e.kind === 'protocol',
  );
});
test('P1 weather zero is valid, null is absent and nonfinite/missing observation time is a protocol error', () => {
  const w = createFixtures()['WTH-01'];
  w.precip = 0;
  w.temp = 0;
  w.humidity = null;
  assert.equal(validateWeatherNow(w).precip, 0);
  assert.equal(validateWeatherNow(w).humidity, null);
  assert.throws(() => validateWeatherNow({ ...w, wind_speed: NaN }));
  assert.throws(() => validateWeatherNow({ ...w, observed_at: undefined }));
});
test('P1 observed_at respects documented 5-minute slack and previous-perimeter lower bound', () => {
  const now = Date.parse('2026-11-16T01:00:00Z');
  assert.throws(() => observedAt('2026-11-16T01:06:00Z', undefined, now));
  assert.throws(() =>
    observedAt('2026-11-16T00:58:00Z', '2026-11-16T00:59:00Z', now),
  );
  assert.equal(
    observedAt('2026-11-16T01:05:00Z', undefined, now),
    '2026-11-16T01:05:00.000Z',
  );
});
const { validateProposal } = await import('../src/api/screen/proposals.ts');
test('P1 missing required nested proposal fields are protocol errors, not undefined text', () => {
  for (const mutate of [
    (p) => delete p.items[0].sections[0].blocks[0].body,
    (p) => p.items[0].sections[0].blocks.push({ type: 'list', rows: [{}] }),
    (p) => (p.items[0].withheld = [{ field: 'target' }]),
  ]) {
    const p = createFixtures()['PROP-03'];
    mutate(p);
    assert.throws(
      () => validateProposal(p),
      (e) => e.kind === 'protocol',
    );
  }
  const p = createFixtures()['PROP-03'];
  p.items[0].evidence[0].text = null;
  assert.doesNotThrow(() => validateProposal(p));
});
test('P1 malformed resource aggregate is a protocol failure rather than NaN or fabricated zero', async () => {
  const { createApiClient, createApiDataSource } =
    await import('../src/api/index.ts');
  const source = createApiDataSource(
    createApiClient({
      mode: 'http',
      fetcher: async (url) =>
        Response.json({
          data: String(url).includes('/summary')
            ? {
                bases: [
                  {
                    kind: 'HELICOPTER',
                    base_id: '1',
                    available: 1,
                    deployed: 0,
                    maintenance: 0,
                  },
                ],
                incident_deployed: null,
              }
            : { items: [], has_more: false, next_cursor: null },
          meta: { request_id: 'bad-resource' },
        }),
    }),
  );
  const result = await source.resources('100');
  assert.equal(result.summary.status, 'error');
  assert.equal(result.summary.error.kind, 'protocol');
});
