import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createScenario } from '../src/data/scenario.ts';
import { createGeometry } from '../src/models/geometry.ts';
import { calculateRisk } from '../src/models/risk.ts';

const baseline = JSON.parse(
  readFileSync(new URL('./fixtures/original-v4.json', import.meta.url), 'utf8'),
);
const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('both normal risk runs match the original v4 calculations', () => {
  const scenario = createScenario();
  scenario.incidents[0].risk_demo_runs.forEach((demo, index) => {
    near(
      calculateRisk(scenario.risk_model, demo.values).score,
      baseline.risk[index],
    );
  });
});

test('merged-fire risk matches original v4', () => {
  const scenario = createScenario();
  near(
    calculateRisk(scenario.risk_model, scenario.risk_merge_demo.values).score,
    baseline.mergedRisk,
  );
});

test('all eight spread areas and first vertices match original v4', () => {
  const scenario = createScenario();
  const incident = scenario.incidents[0];
  const geometry = createGeometry(incident.ignition, scenario.fire_model);
  const rings = geometry.buildSlices(
    incident.ignition,
    { ms: 5.6, dir: 240 },
    incident.perimeters[0].ring,
  );
  assert.equal(rings.length, 8);
  rings.forEach((ring, index) => {
    near(geometry.ringAreaHa(ring), baseline.areas[index]);
    assert.deepEqual(ring[0], baseline.firstVertices[index]);
    assert.deepEqual(ring.at(-1), ring[0]);
  });
});

test('missing variables are excluded from weighted score and reported', () => {
  const scenario = createScenario();
  const result = calculateRisk(
    scenario.risk_model,
    scenario.risk_model.default_values,
    ['gtemp', 'rain7'],
  );
  assert.equal(result.missing.length, 2);
  const available = result.vars.filter((item) => item.grade != null);
  near(
    result.score,
    available.reduce((sum, item) => sum + item.w * item.grade, 0) /
      available.reduce((sum, item) => sum + item.w, 0),
  );
  assert.equal(calculateRisk(scenario.risk_model, {}, []).score, null);
});

test('React remounts receive independent mutable scenario data', () => {
  const first = createScenario();
  const second = createScenario();
  first.accounts[0].locked = true;
  first.incidents[0].status = '종료';
  first.incidents[0].perimeters[0].ring[0][0] = 0;
  assert.equal(second.accounts[0].locked, undefined);
  assert.equal(second.incidents[0].status, '진행 중');
  assert.notEqual(second.incidents[0].perimeters[0].ring[0][0], 0);
});

test('all four mock roles and report-only ignition state are preserved', () => {
  const scenario = createScenario();
  assert.deepEqual(
    [...new Set(scenario.accounts.map((account) => account.role))].sort(),
    ['admin', 'commander', 'reporter', 'viewer'],
  );
  assert.equal(scenario.incidents[1].status, '접수');
  assert.equal(scenario.incidents[1].perimeters.length, 0);
});
