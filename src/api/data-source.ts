import type { ApiClient } from './client.ts';
import type { Incident, Id, Operation, Page, UserRole } from './contracts.ts';
import { createIdempotencyKey } from './client.ts';
import { createApiServices } from './services.ts';
import { waitForOperation } from './operations.ts';

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
  async function loadIncident(id: Id, role: UserRole, signal?: AbortSignal) {
    const path = { incident_id: id };
    const incident = await api.incidents.get({ path, signal });
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
    listIncidents: (signal?: AbortSignal) =>
      allPages((cursor) =>
        api.incidents.list({ query: { cursor, limit: 100 }, signal }),
      ),
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
