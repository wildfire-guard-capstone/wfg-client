import type { ApiClient } from './client.ts';
import type { Incident, Id, Operation, Page, UserRole, MapFeatures, AdminArea } from './contracts.ts';
import type { RequestFor } from './endpoints.ts';
import { createIdempotencyKey } from './client.ts';
import { createApiServices } from './services.ts';
import { waitForOperation } from './operations.ts';
import type { IncidentDirectory } from './screen/incidents.ts';
import { ApiError } from './errors.ts';

export type Remote<T> =
  | { status: 'ready'; data: T }
  | { status: 'error'; error: unknown }
  | { status: 'not-requested' };
export async function remote<T>(load: () => Promise<T>): Promise<Remote<T>> {
  try {
    return { status: 'ready', data: await load() };
  } catch (error) {
    return { status: 'error', error };
  }
}
export async function allPages<T>(
  load: (cursor?: string) => Promise<Page<T>>,
): Promise<T[]> {
  const items: T[] = [],
    seen = new Set<string>();
  let cursor: string | undefined;
  for (let n = 0; n < 100; n++) {
    const page = await load(cursor);
    items.push(...page.items);
    if (!page.has_more) return items;
    if (!page.next_cursor || seen.has(page.next_cursor))
      throw new Error('API 페이지 커서가 없거나 반복됩니다.');
    seen.add(page.next_cursor);
    cursor = page.next_cursor;
  }
  throw new Error(
    'API 조회가 100페이지를 넘었습니다. 범위를 좁혀 조회해주세요.',
  );
}

/** Data-only boundary. It has no React/DOM/MapLibre imports and never changes a screen. */
export function createApiDataSource(client: ApiClient) {
  const api = createApiServices(client);
  async function incidentDetail(id: Id, signal?: AbortSignal) {
    const value = await api.incidents.get({
      path: { incident_id: id },
      signal,
    });
    if (value.id !== id || !['IN_PROGRESS', 'ENDED'].includes(value.status))
      throw new ApiError({
        endpoint: 'INC-03',
        kind: 'protocol',
        code: 'INVALID_RESPONSE',
        message: '[필요한 정보: 요청한 산불 ID와 유효한 산불 상태]',
      });
    const coordinates = value.ignition_point?.coordinates;
    if (
      value.ignition_point?.type !== 'Point' ||
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      !coordinates.slice(0, 2).every(Number.isFinite) ||
      Math.abs(coordinates[0]!) > 180 ||
      Math.abs(coordinates[1]!) > 90
    )
      throw new ApiError({
        endpoint: 'INC-03',
        kind: 'protocol',
        code: 'INVALID_RESPONSE',
        message: '[필요한 정보: 산불별 발화점 경도·위도]',
      });
    return value;
  }
  async function listIncidents(signal?: AbortSignal) {
    const rows = await allPages((cursor) =>
      api.incidents.list({ query: { cursor, limit: 100 }, signal }),
    );
    if (
      rows.some(
        (row) =>
          typeof row.id !== 'string' ||
          !/^[1-9]\d*$/.test(row.id) ||
          !['IN_PROGRESS', 'ENDED'].includes(row.status),
      )
    )
      throw new ApiError({
        endpoint: 'INC-01',
        kind: 'protocol',
        code: 'INVALID_RESPONSE',
        message: '[필요한 정보: 산불 목록의 유효한 ID·상태 코드]',
      });
    return [...new Map(rows.map((row) => [row.id, row])).values()];
  }
  async function incidentDirectory(
    signal?: AbortSignal,
  ): Promise<IncidentDirectory> {
    const items = await listIncidents(signal);
    const details: IncidentDirectory['details'] = new Map();
    let index = 0;
    // Bound concurrent detail requests while preserving the server's list order.
    await Promise.all(
      Array.from({ length: Math.min(4, items.length) }, async () => {
        for (;;) {
          signal?.throwIfAborted();
          const row = items[index++];
          if (!row) return;
          details.set(
            row.id,
            await remote(() => incidentDetail(row.id, signal)),
          );
        }
      }),
    );
    signal?.throwIfAborted();
    return { items, details };
  }
  async function loadIncident(
    id: Id,
    role: UserRole,
    signal?: AbortSignal,
    known?: Incident,
  ) {
    const path = { incident_id: id };
    const incident =
      known?.id === id ? known : await incidentDetail(id, signal);
    const predictionPath = {
      ...path,
      prediction_id: incident.latest_prediction_id!,
    };
    const reader = role === 'COMMANDER' || role === 'VIEWER';
    const skipped = Promise.resolve({ status: 'not-requested' } as const);
    const [perimeters, prediction, slices, weather, now, risk, proposal] =
      await Promise.all([
        remote(() =>
          allPages((cursor) =>
            api.perimeters.list({
              path,
              query: { cursor, limit: 100 },
              signal,
            }),
          ),
        ),
        reader && incident.latest_prediction_id
          ? remote(() => api.predictions.get({ path: predictionPath, signal }))
          : skipped,
        reader && incident.latest_prediction_id
          ? remote(() =>
              api.predictions.slices({ path: predictionPath, signal }),
            )
          : skipped,
        reader && incident.latest_prediction_id
          ? remote(() =>
              api.predictions.weather({ path: predictionPath, signal }),
            )
          : skipped,
        reader ? remote(() => api.weather.now({ path, signal })) : skipped,
        reader && incident.latest_prediction_id
          ? remote(() => api.risk.get({ path: predictionPath, signal }))
          : skipped,
        role === 'COMMANDER'
          ? remote(() => api.proposals.latest({ path, signal }))
          : skipped,
      ]);
    signal?.throwIfAborted();
    return {
      incident,
      perimeters,
      prediction,
      slices,
      weather,
      now,
      risk,
      proposal,
    };
  }
  async function resources(incidentId?: Id, signal?: AbortSignal) {
    const query = incidentId ? { incident_id: incidentId } : {};
    const [list, summary, bases] = await Promise.all([
      remote(() =>
        allPages((cursor) =>
          api.resources.list({
            query: { ...query, cursor, limit: 100 },
            signal,
          }),
        ),
      ),
      remote(() => api.resources.summary({ query, signal })),
      remote(() =>
        allPages((cursor) =>
          api.resources.bases({
            query: { ...query, cursor, limit: 100 },
            signal,
          }),
        ),
      ),
    ]);
    signal?.throwIfAborted();
    return { list, summary, bases };
  }
  async function predict(
    incident: Incident,
    signal?: AbortSignal,
    onUpdate?: (op: Operation) => void,
  ) {
    const operation = await api.predictions.start({
      path: { incident_id: incident.id },
      body: { expected_perimeter_id: incident.current_perimeter_id },
      idempotencyKey: createIdempotencyKey(),
      signal,
    });
    return waitForOperation(
      client,
      { incident_id: incident.id, operation_id: operation.id },
      { signal, onUpdate },
    );
  }
  return {
    client,
    api,
    loadIncident,
    resources,
    predict,
    listIncidents,
    incidentDirectory,
    adminAreas: (query: RequestFor<'MAP-04'>['query'] = {}, signal?: AbortSignal) =>
      allPages((cursor) => api.map.adminAreas({ query: { ...query, cursor, limit: 100 }, signal })),
    async mapWindow(bbox: string, signal?: AbortSignal) {
      const [layers, areas] = await Promise.all([
        api.map.layers({ signal }),
        remote(() => allPages((cursor) => api.map.adminAreas({ query: { cursor, limit: 100 }, signal }))),
      ]);
      const collections = new Map<string, Remote<Pick<MapFeatures, 'type' | 'features'>>>();
      let index = 0;
      await Promise.all(Array.from({ length: Math.min(4, layers.length) }, async () => {
        for (;;) {
          signal?.throwIfAborted();
          const layer = layers[index++];
          if (!layer) break;
          if (!layer.available) {
            collections.set(layer.id, { status: 'error', error: new Error(`[필요한 정보: ${layer.name} 레이어 적재 데이터]`) });
            continue;
          }
          collections.set(layer.id, await remote(async () => {
            const features = await allPages(async (cursor) => {
              const value = await api.map.features({ path: { layer_id: layer.id }, query: { bbox, cursor, limit: 1000 }, signal });
              return { items: value.features, next_cursor: value.next_cursor, has_more: value.has_more };
            });
            return { type: 'FeatureCollection' as const, features };
          }));
        }
      }));
      signal?.throwIfAborted();
      return { layers, areas, collections };
    },
    proposalVersions: (incidentId: Id, signal?: AbortSignal) =>
      allPages((cursor) =>
        api.proposals.list({
          path: { incident_id: incidentId },
          query: { cursor, limit: 100 },
          signal,
        }),
      ),
    messages: (incidentId: Id, signal?: AbortSignal) =>
      allPages((cursor) =>
        api.assistant.history({
          path: { incident_id: incidentId },
          query: { cursor, limit: 100 },
          signal,
        }),
      ),
    corrections: (incidentId: Id, signal?: AbortSignal) =>
      allPages((cursor) =>
        api.corrections.history({
          path: { incident_id: incidentId },
          query: { cursor, limit: 100 },
          signal,
        }),
      ),
    events: (incidentId?: Id, signal?: AbortSignal) =>
      allPages((cursor) =>
        api.events.list({
          query: { incident_id: incidentId, cursor, limit: 100 },
          signal,
        }),
      ),
    users: (signal?: AbortSignal) =>
      allPages((cursor) =>
        api.users.list({
          query: { include_deleted: true, cursor, limit: 100 },
          signal,
        }),
      ),
    async features(layerId: string, bbox: string, signal?: AbortSignal) {
      const items = await allPages(async (cursor) => {
        const fc = await api.map.features({
          path: { layer_id: layerId },
          query: { bbox, cursor, limit: 1000 },
          signal,
        });
        return {
          items: fc.features,
          next_cursor: fc.next_cursor,
          has_more: fc.has_more,
        };
      });
      return { type: 'FeatureCollection', features: items } as const;
    },
  };
}
export type ApiDataSource = ReturnType<typeof createApiDataSource>;
export type IncidentData = Awaited<ReturnType<ApiDataSource['loadIncident']>>;
