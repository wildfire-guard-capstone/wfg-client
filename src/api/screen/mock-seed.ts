import type * as C from '../contracts.ts';
import type { Scenario } from '../../types/scenario.ts';
import type { MockOptions } from '../mock/transport.ts';
import { createGeometry } from '../../models/geometry.ts';
import type { RiskResult } from '../../types/domain.ts';
import { createFixtures } from '../mock/fixtures.ts';

/** Reuse main's geometry as API-shaped demo DATA. Rendering is still main's
 * original MapLibre code; this never runs for an HTTP server response. */
export function screenMockOptions(
  S: Scenario,
  result: Pick<RiskResult, 'score' | 'factors' | 'vars'>,
): MockOptions {
  const fixtures = createFixtures();
  const users = S.accounts.map((account, index) => ({
    user: {
      id: String(index + 1),
      login_id: account.id,
      name: account.name,
      organization: account.org,
      role: account.role.toUpperCase() as C.UserRole,
      admin_area_id: account.role === 'admin' ? null : '10',
    },
    password: account.pw,
  }));
  const perimeters: C.Perimeter[] = [];
  const incidents = S.incidents.map((i, index): C.Incident => {
    const id = String(100 + index),
      last = i.perimeters.at(-1);
    if (last)
      perimeters.push({
        id: String(21 + index),
        incident_id: id,
        version_no: last.version,
        geometry: { type: 'MultiPolygon', coordinates: [[last.ring]] },
        observed_at: last.at,
        reported_by: '3',
        created_at: last.at,
        corrected_at: null,
        area_ha: createGeometry(
          S.incidents[0]!.ignition,
          S.fire_model,
        ).ringAreaHa(last.ring),
      });
    else
      perimeters.push({
        id: String(21 + index),
        incident_id: id,
        version_no: 0,
        geometry: { type: 'Point', coordinates: i.ignition },
        observed_at: i.start_time ?? i.report_time,
        reported_by: '3',
        created_at: i.report_time,
        corrected_at: null,
        area_ha: 0,
      });
    return {
      id,
      name: i.name,
      ignition_point: { type: 'Point', coordinates: i.ignition },
      address: i.addr,
      admin_area_id: '11',
      started_at: i.start_time,
      reported_at: i.report_time,
      report_text: i.report_text,
      reporter_org: i.caller.org || null,
      reporter_name: i.caller.name || null,
      reporter_phone: i.caller.phone || null,
      status: i.status === '종료' ? 'ENDED' : 'IN_PROGRESS',
      current_stage: 'INITIAL',
      situation: {},
      reported_by: '3',
      created_at: i.report_time,
      ended_at: i.ended_at,
      ended_by: i.ended_by,
      current_perimeter_id: String(21 + index),
      current_perimeter_version: last?.version ?? 0,
      latest_prediction_id: null,
      latest_proposal_id: null,
      needs_reprediction: false,
      proposal_stale: false,
      situation_revision: 'rev-0',
      running_operation_id: null,
    };
  });
  fixtures['USR-01'] = {
    items: users.map(({ user }) => ({
      ...user,
      failed_login_count: 0,
      created_at: S.meta.now,
      updated_at: S.meta.now,
      deleted_at: null,
    })),
    has_more: false,
    next_cursor: null,
  };
  fixtures['LOG-01'] = { items: [], has_more: false, next_cursor: null };
  const baseNames = [...new Set(S.resources.map((r) => r.base || '목업 기지'))];
  const bases: C.ResourceBase[] = baseNames.map((name, index) => ({
    id: String(300 + index),
    name,
    org_type: 'MOCK',
    geometry: null,
    coverage_area_ids: [],
    distance_km: null,
    jurisdiction: null,
  }));
  const resources: C.Resource[] = S.resources
    .filter((r) => r.type === '헬기' || r.type === '차량')
    .map((r, index) => ({
      id: String(500 + index),
      kind: r.type === '헬기' ? 'HELICOPTER' : 'VEHICLE',
      name: r.name,
      base_id: bases.find((b) => b.name === (r.base || '목업 기지'))!.id,
      status:
        r.status === '투입'
          ? 'DEPLOYED'
          : r.status === '정비'
            ? 'MAINTENANCE'
            : 'AVAILABLE',
      attrs: {},
      deployed_incident_id: r.status === '투입' ? '100' : null,
    }));
  fixtures['BASE-01'] = { items: bases, has_more: false, next_cursor: null };
  fixtures['RES-01'] = { items: resources, has_more: false, next_cursor: null };
  fixtures['RES-02'] = {
    bases: bases.flatMap((base) =>
      (['HELICOPTER', 'VEHICLE'] as const).map((kind) => {
        const rows = resources.filter(
          (r) => r.base_id === base.id && r.kind === kind,
        );
        return {
          base_id: base.id,
          kind,
          total: rows.length,
          available: rows.filter((r) => r.status === 'AVAILABLE').length,
          deployed: rows.filter((r) => r.status === 'DEPLOYED').length,
          maintenance: rows.filter((r) => r.status === 'MAINTENANCE').length,
        };
      }),
    ),
    incident_deployed: null,
    incident_linked: null,
  };
  incidents[0]!.situation.deployed = {
    helicopter: {
      total: S.resources.filter((r) => r.type === '헬기' && r.status === '투입')
        .length,
    },
    vehicle: {
      total: S.resources.filter((r) => r.type === '차량' && r.status === '투입')
        .length,
    },
    crew: {
      total: S.resources
        .filter((r) => r.type === '인력' && r.status === '투입')
        .reduce((sum, r) => sum + r.qty, 0),
    },
  };
  const w = S.weather.series[0]!;
  fixtures['WTH-01'] = {
    observed_at: S.weather.received_at,
    source: S.weather.source,
    wind_dir: w.wind_dir,
    wind_dir_name: null,
    wind_speed: w.wind_ms,
    temp: w.temp_c,
    humidity: w.rh,
    precip: null,
    next_refresh_at: null,
    stale: false,
  };
  const model = createGeometry(S.incidents[0]!.ignition, S.fire_model);
  fixtures['RISK-01'] = {
    prediction_id: '41',
    status: 'READY',
    score: result.score,
    grade: null,
    axes: Object.fromEntries(
      result.factors.map((f) => [
        f.key === 'infra' ? 'infrastructure' : f.key,
        f.score,
      ]),
    ) as C.Risk['axes'],
    included_weight_sum: result.vars.reduce(
      (sum, v) => sum + (v.grade == null ? 0 : v.w),
      0,
    ),
    factors: result.vars.map((v) => ({
      code: v.key,
      name: v.name,
      axis: (v.axis === 'infra' ? 'infrastructure' : v.axis) as C.RiskAxis,
      raw_value: v.value,
      grade: v.grade,
      weight: v.w,
      included: v.grade != null,
      contribution: v.grade == null || v.wn == null ? null : v.wn * v.grade,
      reason: null,
      source: '기존 main 시연 데이터',
      value_at: S.meta.now,
    })),
    method_version: 'main-demo',
    unavailable_reasons: [],
  };
  return {
    fixtures,
    seed: { incidents, perimeters, accounts: users },
    predictionSlices(incident, prediction, perimeter) {
      const actual = perimeter.geometry;
      const rings = model.buildSlices(
        incident.ignition_point.coordinates,
        { ms: w.wind_ms, dir: w.wind_dir },
        actual?.type === 'MultiPolygon'
          ? (actual.coordinates[0]![0] as [number, number][])
          : null,
      );
      return {
        type: 'FeatureCollection',
        features: rings.map((ring, index) => ({
          type: 'Feature',
          geometry: { type: 'MultiPolygon', coordinates: [[ring]] },
          properties: {
            prediction_id: prediction.id,
            hour: (index + 1) as C.PredictionHour,
            at: prediction.slices[index]!.at,
            area_ha: model.ringAreaHa(ring),
          },
        })),
      };
    },
  };
}
