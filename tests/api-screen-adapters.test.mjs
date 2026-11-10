import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenario } from '../src/data/scenario.ts';
import { createGeometry } from '../src/models/geometry.ts';
import { calculateRisk } from '../src/models/risk.ts';
import { createApiClient, createApiDataSource } from '../src/api/index.ts';
import { createFixtures } from '../src/api/mock/fixtures.ts';
import { screenMockOptions } from '../src/api/screen/mock-seed.ts';
import {
  NULL_TEXT,
  displayRing,
  shapeOf,
  submissionGeometry,
  containsGeometry,
  proposalView,
  riskView,
  resourceCounts,
  incidentView,
} from '../src/api/screen/adapters.ts';

test('original 14 category names stay intact; API S5 maps to UI S7, ambiguous slots stay NULL', () => {
  const S = createScenario(),
    proposal = createFixtures()['PROP-03'];
  proposal.items.forEach((item) => {
    item.state = 'GENERATED';
    item.categories = ['IMMEDIATE'];
  });
  const run = proposalView(proposal, S, null);
  assert.deepEqual(
    run.blocks.map((b) => [b.id, b.name, b.axis]),
    S.catalog.map((b) => [b.id, b.name, b.axis]),
  );
  assert.equal(run.blocks.length, 14);
  assert.equal(run.blocks.find((b) => b.id === 'S7').apiItemCode, 'S5');
  for (const id of ['S5', 'E5', 'E7']) {
    const block = run.blocks.find((b) => b.id === id);
    assert.equal(block.text, NULL_TEXT);
    assert.equal(block.apiMissing, true);
  }
  assert.equal(run.summary.즉시, 11);
  assert.ok(
    run.blocks.every(
      (b) => b.authority === NULL_TEXT && b.targets[0] === NULL_TEXT,
    ),
  );
});
test('full MultiPolygon, every interior ring and exact area survive display and resubmission', () => {
  const geometry = {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
          [0, 0],
        ],
        [
          [1, 1],
          [2, 1],
          [2, 2],
          [1, 2],
          [1, 1],
        ],
      ],
      [
        [
          [10, 10],
          [11, 10],
          [11, 11],
          [10, 10],
        ],
      ],
    ],
  };
  const ring = displayRing(geometry, 123.45);
  assert.deepEqual(submissionGeometry(ring), geometry);
  assert.equal(shapeOf(ring).area, 123.45);
  const inside = createGeometry(
    [0, 0],
    createScenario().fire_model,
  ).pointInRing;
  assert.equal(
    containsGeometry([1.5, 1.5], geometry, inside),
    false,
    'a hole is not burned',
  );
  assert.equal(containsGeometry([3, 3], geometry, inside), true);
  assert.equal(containsGeometry([10.8, 10.5], geometry, inside), true);
});
test('null risk stays null with 4 axes and 23 rows; raw risk scores are not recomputed', () => {
  const S = createScenario(),
    empty = riskView(null, S);
  assert.equal(empty.score, null);
  assert.equal(empty.vars.length, 23);
  assert.equal(empty.factors.length, 4);
  assert.ok(empty.factors.every((f) => f.score === null && f.weight === null));
  const raw = createFixtures()['RISK-01'];
  const view = riskView(raw, S);
  assert.equal(view.score, raw.score);
  assert.equal(view.computedAt, null);
  assert.ok(
    Math.abs(view.factors.reduce((sum, f) => sum + f.weight, 0) - 1) < 1e-10,
  );
});
test('official stage and reception history are never populated from judged stage or reporter organization', () => {
  const raw = createFixtures()['INC-03'];
  raw.current_stage = 'STAGE2';
  raw.reporter_org = '제공된 신고 기관';
  const view = incidentView(raw, []);
  assert.equal(view.official_stage, NULL_TEXT);
  assert.equal(view.alert_level, NULL_TEXT);
  assert.deepEqual(view.intake, []);
  assert.equal(view.caller.org, '제공된 신고 기관');
});
test('missing resource summary is NULL; an empty successful summary is a real zero; individual crew is absent', () => {
  assert.equal(resourceCounts(null).헬기.대기, NULL_TEXT);
  const empty = resourceCounts({
    bases: [],
    incident_deployed: null,
    incident_linked: null,
  });
  assert.equal(empty.헬기.대기, 0);
  assert.equal(empty.인력.대기, NULL_TEXT);
});
test('API demo uses original main fire geometry and seed accounts instead of rectangle fixtures', async () => {
  const S = createScenario(),
    geom = createGeometry(S.incidents[0].ignition, S.fire_model);
  const risk = calculateRisk(
    S.risk_model,
    S.incidents[0].risk_demo_runs[0].values,
    [],
  );
  const source = createApiDataSource(
    createApiClient({
      mode: 'mock',
      mock: { ...screenMockOptions(S, risk), latencyMs: 0 },
    }),
  );
  await source.api.auth.login({
    body: { login_id: 'cmd01', password: '1234', role: 'COMMANDER' },
  });
  const before = await source.loadIncident('100', 'COMMANDER');
  assert.deepEqual(
    before.perimeters.data[0].geometry.coordinates[0][0],
    S.incidents[0].perimeters[0].ring,
  );
  const op = await source.api.predictions.start({
    path: { incident_id: '100' },
    body: { expected_perimeter_id: '21' },
    idempotencyKey: 'seed-job',
  });
  let done;
  for (let i = 0; i < 3; i++)
    done = await source.api.predictions.operation({
      path: { incident_id: '100', operation_id: op.id },
    });
  const after = await source.loadIncident('100', 'COMMANDER');
  const expected = geom.buildSlices(
    S.incidents[0].ignition,
    { ms: S.weather.series[0].wind_ms, dir: S.weather.series[0].wind_dir },
    S.incidents[0].perimeters[0].ring,
  );
  assert.deepEqual(
    after.slices.data.features.map((f) => f.geometry.coordinates[0][0]),
    expected,
  );
  assert.equal(done.status, 'SUCCEEDED');
  assert.equal(
    after.prediction.data.slices[4].area_ha,
    after.slices.data.features[4].properties.area_ha,
  );
});
