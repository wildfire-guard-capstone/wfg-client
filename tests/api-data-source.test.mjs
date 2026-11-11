import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createApiClient,
  createApiDataSource,
  allPages,
} from '../src/api/index.ts';

test('data snapshots preserve per-endpoint failures and nulls, without turning errors into empty success', async () => {
  const source = createApiDataSource(
    createApiClient({
      mode: 'mock',
      mock: {
        latencyMs: 0,
        scenarios: { 'WTH-01': 'unavailable', 'RISK-01': 'empty' },
      },
    }),
  );
  await source.api.auth.login({
    body: {
      login_id: 'mock-commander',
      password: 'mock-password',
      role: 'COMMANDER',
    },
  });
  const result = await source.loadIncident('100', 'COMMANDER');
  assert.equal(result.incident.id, '100');
  assert.equal(result.now.status, 'error');
  assert.equal(result.now.error.status, 503);
  assert.deepEqual(result.risk, { status: 'ready', data: null });
  assert.equal(result.slices.data.features.length, 8);
  assert.equal(result.weather.data.hours.length, 9);
  assert.equal(result.proposal.data.items.length, 12);
});
test('reporter data scope never calls analysis-only endpoints', async () => {
  const source = createApiDataSource(
    createApiClient({ mode: 'mock', mock: { latencyMs: 0 } }),
  );
  await source.api.auth.login({
    body: {
      login_id: 'mock-reporter',
      password: 'mock-password',
      role: 'REPORTER',
    },
  });
  const result = await source.loadIncident('100', 'REPORTER');
  assert.equal(result.perimeters.status, 'ready');
  assert.deepEqual(result.proposal, { status: 'not-requested' });
  assert.deepEqual(result.risk, { status: 'not-requested' });
});
test('pagination collects full data and refuses missing or cyclic cursors', async () => {
  assert.deepEqual(
    await allPages(async (cursor) =>
      cursor
        ? { items: [2], has_more: false, next_cursor: null }
        : { items: [1], has_more: true, next_cursor: 'opaque-token' },
    ),
    [1, 2],
  );
  await assert.rejects(
    allPages(async () => ({ items: [], has_more: true, next_cursor: 'same' })),
    /커서/,
  );
  await assert.rejects(
    allPages(async () => ({ items: [], has_more: true, next_cursor: null })),
    /커서/,
  );
});
