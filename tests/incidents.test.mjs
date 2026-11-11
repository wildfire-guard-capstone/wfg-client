import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/api/client.ts';
import { createApiDataSource } from '../src/api/data-source.ts';
import { createFixtures } from '../src/api/mock/fixtures.ts';
import {
  incidentListRow,
  incidentDetailsView,
} from '../src/api/screen/incidents.ts';

const ok = (data) =>
  Response.json({ data, meta: { request_id: 'incident-test' } });
const summary = (id) => ({ ...createFixtures()['INC-01'].items[0], id });
const detail = (id) => ({ ...createFixtures()['INC-03'], id });

test('INC-01 pages deduplicate IDs; detail enrichment is bounded and preserves partial failures', async () => {
  let active = 0,
    maximum = 0;
  const client = createApiClient({
    mode: 'http',
    fetcher: async (url) => {
      const parsed = new URL(url, 'http://test.invalid');
      const id = parsed.pathname.split('/').at(-1);
      if (id === 'incidents')
        return ok(
          parsed.searchParams.has('cursor')
            ? {
                items: [summary('3'), summary('4'), summary('5')],
                has_more: false,
                next_cursor: null,
              }
            : {
                items: [summary('1'), summary('2'), summary('3')],
                has_more: true,
                next_cursor: 'page-2',
              },
        );
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return id === '2'
        ? Response.json(
            {
              error: {
                code: 'FORBIDDEN_ROLE',
                message: '권한 부족',
                fields: [],
              },
              meta: { request_id: 'denied-detail' },
            },
            { status: 403 },
          )
        : ok(detail(id));
    },
  });
  const result = await createApiDataSource(client).incidentDirectory();
  assert.deepEqual(
    result.items.map((row) => row.id),
    ['1', '2', '3', '4', '5'],
  );
  assert.ok(maximum <= 4 && maximum > 1);
  assert.equal(result.details.get('2').status, 'error');
  assert.equal(result.details.get('2').error.status, 403);
  assert.equal(result.details.get('1').data.id, '1');
});

test('summary rows never invent geometry, addresses or occurrence times', () => {
  const row = incidentListRow(summary('123'));
  assert.equal(row.id, '123');
  assert.match(row.addr, /\[필요한 정보: 산불 발생 주소\]/);
  assert.equal(row.start_time, null);
  assert.ok(!('ignition' in row) && !('ignition_point' in row));
  const raw = {
    ...detail('123'),
    started_at: null,
    address: '서버가 제공한 주소',
    reporter_org: null,
    report_text: null,
  };
  assert.equal(incidentListRow(summary('123'), raw).addr, raw.address);
  assert.equal(incidentListRow(summary('123'), raw).start_time, null);
  const view = incidentDetailsView(raw, []);
  assert.match(view.report_text, /필요한 정보: 신고 내용/);
  assert.match(view.caller.org, /필요한 정보: 신고 기관명/);
  assert.deepEqual(view.ignition, raw.ignition_point.coordinates);
});

test('INC-03 identity/geometry errors remain protocol failures, never fabricated points', async () => {
  for (const raw of [
    { ...detail('1'), id: '2' },
    { ...detail('1'), ignition_point: null },
    {
      ...detail('1'),
      ignition_point: { type: 'Point', coordinates: [128, 999] },
    },
  ]) {
    const source = createApiDataSource(
      createApiClient({ mode: 'http', fetcher: async () => ok(raw) }),
    );
    await assert.rejects(
      source.loadIncident('1', 'REPORTER'),
      (error) =>
        error.kind === 'protocol' && error.message.includes('[필요한 정보:'),
    );
  }
});

test('normal empty list, server outage and caller cancellation remain distinct', async () => {
  const source = createApiDataSource(
    createApiClient({
      mode: 'http',
      fetcher: async () =>
        ok({ items: [], has_more: false, next_cursor: null }),
    }),
  );
  const empty = await source.incidentDirectory();
  assert.deepEqual(empty.items, []);
  assert.equal(empty.details.size, 0);
  const failed = createApiDataSource(
    createApiClient({
      mode: 'http',
      fetcher: async () =>
        Response.json(
          {
            error: {
              code: 'INTERNAL_ERROR',
              message: '일시적 오류',
              fields: [],
            },
            meta: { request_id: 'failure' },
          },
          { status: 503 },
        ),
    }),
  );
  await assert.rejects(
    failed.incidentDirectory(),
    (error) => error.status === 503,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    source.incidentDirectory(controller.signal),
    (error) => error.name === 'AbortError',
  );
});
