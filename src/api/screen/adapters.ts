import { MISSING_TEXT } from './presentation.ts';
import { riskUnit } from './risk-units.ts';
import { PROPOSAL_CODES } from './proposals.ts';
import type { Geometry, MultiPolygon, Polygon } from 'geojson';
import type * as C from '../contracts.ts';
import type {
  Incident as ScreenIncident,
  Ring,
  Scenario,
  Account,
  Resource,
} from '../../types/scenario.ts';
import type {
  ProposalRun,
  ProposalBlock,
  RiskResult,
  RulesResult,
} from '../../types/domain.ts';

export const NULL_TEXT = MISSING_TEXT;
export const text = (value: unknown): string =>
  value === null || value === undefined || value === '' || (typeof value === 'number' && !Number.isFinite(value))
    ? NULL_TEXT
    : String(value);
export const numberText = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value) ? NULL_TEXT : value.toFixed(digits);
export const roleToApi = (role: string) => role.toUpperCase() as C.UserRole;
export const stageText = (stage?: C.ResponseStage) =>
  ({ INITIAL: '초기대응', STAGE1: '확산대응 1단계', STAGE2: '확산대응 2단계' })[
    stage!
  ] ?? NULL_TEXT;

// The existing map renderer still accepts Ring objects. Retain the full wire
// geometry beside each object, including every polygon and interior ring.
const shapes = new WeakMap<Ring, { geometry: Geometry; area: number | null }>();
export function displayRing(
  geometry: Geometry,
  area: number | null = null,
): Ring {
  const ring =
    (geometry.type === 'MultiPolygon'
      ? geometry.coordinates[0]?.[0]
      : geometry.type === 'Polygon'
        ? geometry.coordinates[0]
        : []) ?? [];
  const result = structuredClone(ring) as Ring;
  shapes.set(result, { geometry: structuredClone(geometry), area });
  return result;
}
export const shapeOf = (ring: Ring) => shapes.get(ring);
export function submissionGeometry(ring: Ring): Polygon | MultiPolygon {
  const shape = shapeOf(ring)?.geometry ?? {
    type: 'Polygon' as const,
    coordinates: [ring],
  };
  if (shape.type !== 'Polygon' && shape.type !== 'MultiPolygon')
    throw new Error('제출할 폴리곤이 없습니다.');
  return structuredClone(shape);
}
export function containsGeometry(
  point: number[],
  geometry: Geometry,
  inside: (point: number[], ring: number[][]) => boolean,
) {
  const polygons =
    geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : [];
  return polygons.some(
    (rings) =>
      !!rings[0] &&
      inside(point, rings[0]) &&
      !rings.slice(1).some((hole) => inside(point, hole)),
  );
}

export function incidentView(
  raw: C.Incident,
  perimeters: C.Perimeter[],
): ScreenIncident {
  const villages = raw.situation?.villages ?? {};
  const villageStates = Object.values(villages);
  const evacuated = Object.fromEntries(Object.entries(villages)
    .filter(([, v]) => typeof v.evacuated === 'boolean')
    .map(([id, v]) => [id, v.evacuated!]));
  return {
    id: raw.id,
    name: raw.name,
    addr: raw.address,
    status: raw.status === 'ENDED' ? '종료' : '진행 중',
    ignition: raw.ignition_point.coordinates.slice(0, 2) as [number, number],
    start_time: raw.started_at,
    report_time: raw.reported_at,
    report_text: raw.report_text ?? '',
    caller: {
      org: raw.reporter_org ?? '',
      name: raw.reporter_name ?? '',
      phone: raw.reporter_phone ?? '',
    },
    reported_by: raw.reported_by,
    // 기관별 접수 기록(11/23). 화면은 접수 시각을 시:분으로 보여 준다
    intake: (raw.intake_records ?? []).map((r) => ({
      org: r.org_name,
      at: localHourMinute(r.received_at),
      channel: r.channel ?? '',
    })),
    // 기존 데모의 공식 발령 필드는 서버에 없다. 화면 '공식 단계'는 overviewStage(raw)가
    // 예측 때 판정한 current_stage로 그린다(QA 3-1)
    official_stage: NULL_TEXT,
    alert_level: NULL_TEXT,
    perimeters: perimeters
      .map((p) => ({
        version: p.version_no,
        status: p.corrected_at ? ('정정됨' as const) : ('유효' as const),
        at: p.observed_at,
        by: p.reported_by,
        source: NULL_TEXT,
        ring: displayRing(p.geometry, p.area_ha),
      }))
      .sort((a, b) => a.version - b.version),
    field_report: { expected_suppression_hours: null },
    evacuation_state: {
      order_issued: villageStates.some((v) => v.evac_order === true),
      cbs_sent: [],
      completed_villages: Object.keys(evacuated).filter(id => evacuated[id] === true),
      evacuated_by_id: evacuated,
      injuries: [],
    },
    ended_at: raw.ended_at,
    ended_by: raw.ended_by,
  };
}
const localHourMinute = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
export function emptyIncident(origin: [number, number]): ScreenIncident {
  return {
    id: '__NULL__',
    name: NULL_TEXT,
    addr: NULL_TEXT,
    status: '접수',
    ignition: [...origin],
    start_time: null,
    report_time: '',
    report_text: NULL_TEXT,
    caller: { org: NULL_TEXT, name: NULL_TEXT, phone: NULL_TEXT },
    reported_by: NULL_TEXT,
    intake: [],
    official_stage: NULL_TEXT,
    alert_level: NULL_TEXT,
    perimeters: [],
    field_report: { expected_suppression_hours: null },
    evacuation_state: {
      order_issued: false,
      cbs_sent: [],
      completed_villages: [],
      evacuated_by_id: {},
      injuries: [],
    },
    ended_at: null,
    ended_by: null,
  };
}
export function accountView(user: C.User | C.AdminUser): Account {
  const admin = 'deleted_at' in user ? user : null;
  return {
    id: user.login_id,
    pw: '',
    name: text(user.name),
    org: text(user.organization),
    role: user.role.toLowerCase() as Account['role'],
    status: admin?.deleted_at ? '회수' : '발급',
    issued: admin?.created_at?.slice(0, 10) ?? NULL_TEXT,
    failed: admin?.failed_login_count ?? 0,
    locked: admin ? admin.failed_login_count >= 5 : false,
  };
}
export function resourceViews(
  resources: C.Resource[],
  bases: C.ResourceBase[],
): Resource[] {
  return resources.map((r) => ({
    id: r.id,
    type: r.kind === 'HELICOPTER' ? '헬기' : '차량',
    name: r.name,
    org: NULL_TEXT,
    base: bases.find((b) => b.id === r.base_id)?.name ?? NULL_TEXT,
    qty: 1,
    status: { AVAILABLE: '대기', DEPLOYED: '투입', MAINTENANCE: '정비' }[
      r.status
    ],
  }));
}
export function resourceCounts(summary: C.ResourceSummary | null) {
  const output: Record<string, Record<string, number | string>> = {};
  for (const [label, kind] of [
    ['헬기', 'HELICOPTER'],
    ['차량', 'VEHICLE'],
  ] as const) {
    const rows = summary?.bases.filter((b) => b.kind === kind);
    // An empty successful aggregate means zero. A failed request means unknown.
    output[label] = Object.fromEntries(
      [
        ['보유', 'total'],
        ['대기', 'available'],
        ['투입', 'deployed'],
        ['정비', 'maintenance'],
      ].map(([name, key]) => [
        name,
        rows ? rows.reduce((sum, b) => sum + b[key as 'total'], 0) : NULL_TEXT,
      ]),
    );
  }
  output.인력 = {
    보유: NULL_TEXT,
    대기: NULL_TEXT,
    투입: summary?.incident_deployed?.crew?.total ?? NULL_TEXT,
    정비: NULL_TEXT,
  };
  return output;
}

// HTTP proposal cards use the API's twelve codes directly. The separate legacy
// demo catalogue is never used to fabricate missing HTTP response items.
export const UI_TO_API_ITEM = Object.fromEntries(
  PROPOSAL_CODES.map(code => [code, code]),
) as Record<string, C.ItemCode | undefined>;
const categories: Record<C.ItemCategory, string> = {
  IMMEDIATE: '즉시',
  STANDBY: '대기',
  CONSULT: '협의',
  REQUEST: '요청',
};
export type ScreenRun = ProposalRun & { apiId?: string; apiLoaded?: boolean };
export type ScreenBlock = ProposalBlock & {
  apiMissing?: boolean;
  apiItemCode?: C.ItemCode;
};
type EvidenceView = {
  doc: string;
  page: string;
  section: string;
  text: string;
};
export function proposalView(
  raw: C.Proposal | null,
  scenario: Scenario,
  perimeter: ProposalRun['perim'],
  seq = 1,
): ScreenRun {
  const evidence = scenario.evidence as unknown as Record<string, EvidenceView>;
  const blocks: ScreenBlock[] = (raw?.items ?? []).slice()
    .sort((a, b) => PROPOSAL_CODES.indexOf(a.item_code) - PROPOSAL_CODES.indexOf(b.item_code))
    .map((item) => {
      const base = {
        id: item.item_code,
        axis: item.axis === 'SUPPRESSION' ? '진화' : '대피',
        name: item.name,
        authority: NULL_TEXT,
        targets: [NULL_TEXT],
        conflicts: [],
        withheld: [],
      } as const;
      const refs = item.evidence.map((ev, index) => {
        const key = `api:${raw!.id}:${item.item_code}:${ev.chunk_id}`;
        evidence[key] = {
          doc: text(ev.doc_name),
          page: ev.page == null ? NULL_TEXT : String(ev.page),
          section: text(ev.section),
          text: text(ev.text),
        };
        return { k: index + 1, key, chunk: ev.chunk_id };
      });
      const paragraphs = item.sections.flatMap((section) =>
        section.blocks.flatMap((block) => {
          if (block.type === 'paragraph') {
            const citations = block.evidence
              .map((chunk) => refs.find((r) => r.chunk === chunk)?.k)
              .filter((k) => k !== undefined);
            return [block.body + citations.map((k) => `[${k}]`).join('')];
          }
          if (block.type === 'table')
            return [
              block.head.join(' · '),
              ...block.rows.map((row) => row.join(' · ')),
            ];
          if (block.type === 'list') return block.rows.map((row) => row.text);
          return [block.text];
        }),
      );
      return {
        ...base,
        targets: [NULL_TEXT],
        conflicts: [],
        apiItemCode: item.item_code,
        apiSections: item.sections,
        apiChunks: Object.fromEntries(refs.map(ref => [ref.chunk, ref.k])),
        withheld: (item.withheld ?? []).map(value => ({ slot: value.field, why: value.reason })),
        apiState: item.state,
        apiMissing: item.state === 'FAILED',
        status:
          item.state === 'NOT_TRIGGERED'
            ? ['(없음)']
            : item.categories.length
              ? item.categories.map((c) => categories[c])
              : [NULL_TEXT],
        text: paragraphs.join('\n'),
        finding: item.finding,
        evidence: refs.map(({ k, key }) => ({ k, key })),
      };
    });
  const summary = Object.fromEntries(
    Object.values(categories).map((category) => [
      category,
      blocks.filter((b) => !b.apiMissing && b.status.includes(category)).length,
    ]),
  );
  return {
    id: raw?.version ?? NULL_TEXT,
    apiId: raw?.id,
    apiLoaded: true,
    fv: perimeter?.version ?? 0,
    seq,
    createdAt: new Date(raw?.created_at ?? NaN),
    reason: raw
      ? raw.trigger === 'PREDICTION'
        ? '예측 갱신'
        : '상황 정정'
      : NULL_TEXT,
    blocks,
    summary,
    perim: perimeter,
    snapshot: { official_stage: NULL_TEXT, alert_level: NULL_TEXT },
    R: {
      t0: new Date(raw?.base_at ?? NaN),
      sunset: NULL_TEXT,
      sunrise: NULL_TEXT,
      rs: {
        heli_deployed: 0,
        heli_available: 0,
        fire_trucks_deployed: 0,
        trucks_available: 0,
        ground_crew_deployed: 0,
        crew_positions: [],
      },
      recStage: stageText(raw?.judged_stage),
      official: NULL_TEXT,
      stageUp: false,
      immediate: [],
      standby: [],
      villages: [],
      shelters: [],
      assignments: [],
      facilities: [],
      stageDrivers: [],
    } as RulesResult,
    changed: blocks
      .filter(b => {
        const change = raw?.items.find(i => i.item_code === b.apiItemCode)?.change_type;
        return change === 'CHANGED' || change === 'NEW';
      })
      .map(b => b.id),
  };
}
export function versionView(
  raw: C.ProposalVersion,
  scenario: Scenario,
): ScreenRun {
  const view = proposalView(null, scenario, null);
  return {
    ...view,
    id: raw.version,
    apiId: raw.id,
    apiLoaded: false,
    createdAt: new Date(raw.created_at),
    reason: raw.trigger === 'PREDICTION' ? '예측 갱신' : '상황 정정',
    summary: Object.fromEntries(
      Object.entries(raw.category_counts).map(([key, n]) => [
        categories[key as C.ItemCategory],
        n,
      ]),
    ),
  };
}
/** risk-2 묶음: 위해 H(기상 · 지형 · 연료 · 규모) · 노출 X(인프라 · 주변 주택) */
const HAZARD_AXES: readonly string[] = ['weather', 'terrain', 'fuel', 'scale'];
/** scenario.risk_model.axes에 없는 서버 축(risk-2에서 추가) */
const EXTRA_AXES: Record<string, string> = { scale: '규모', exposure: '노출' };
/** 서버 변수 코드(RiskFactor.code) → 화면 시나리오 변수 키(단위 · 판정 방식을 여기서 읽음) */
const SCREEN_VAR_KEY: Record<string, string> = {
  slope_up: 'slope',
  aspect: 'aspect',
  curvature: 'curv',
  terrain_complexity: 'rough',
  elevation: 'elev',
  topographic_position: 'tpi',
  water_distance: 'water',
  fuel_load: 'load',
  forest_type: 'species',
  surface_fuel_depth: 'depth',
  stand_age: 'age',
  canopy_height: 'cht',
  canopy_cover: 'cover',
  fuel_moisture: 'moist',
  wind_speed: 'wind',
  humidity: 'rh',
  temperature: 'temp',
  precipitation: 'rain',
  ground_temperature: 'gtemp',
  precipitation_7d: 'rain7',
  pressure: 'pres',
  vulnerable_population: 'vuln',
  fire_station_distance: 'fire_st',
};
// Numeric server units are preserved in risk-units.ts; strings keep their original text.
const apiAxis = (key: string) => (key === 'infra' ? 'infrastructure' : key);
const screenAxis = (key: string) => (key === 'infrastructure' ? 'infra' : key);

export function riskView(raw: C.Risk | null, scenario: Scenario): RiskResult {
  const split = raw?.combine === 'sqrt_hx';
  const groupOf = (axis: string): 'H' | 'X' =>
    HAZARD_AXES.includes(screenAxis(axis)) ? 'H' : 'X';
  // risk-2는 묶음(H · X)마다 가중치를 다시 나눈다. risk-1은 값이 있는 변수 전체로 나눈다
  const denominator = (axis: string): number => {
    if (!raw) return 0;
    if (!split) return raw.included_weight_sum;
    const g = groupOf(axis);
    return raw.factors
      .filter((f) => f.included && groupOf(f.axis) === g)
      .reduce((sum, f) => sum + f.weight, 0);
  };
  const vars =
    raw?.factors.map((f) => {
      const screenKey = SCREEN_VAR_KEY[f.code] ?? f.code;
      const meta = scenario.risk_model.vars.find((v) => v.key === screenKey);
      const den = denominator(f.axis);
      return {
        key: f.code,
        axis: screenAxis(f.axis),
        name: f.name,
        unit: riskUnit(f.code, f.raw_value),
        reason: f.reason, source: f.source, valueAt: f.value_at, included: f.included,
        w: f.weight,
        mode: f.code === 'aspect' && typeof f.raw_value !== 'number' ? '' : meta?.mode ?? '',
        value: f.raw_value,
        grade: f.grade,
        wn: f.included ? (den > 0 ? f.weight / den : null) : 0,
      };
    }) ??
    scenario.risk_model.vars.map((v) => ({
      ...v,
      value: null,
      grade: null,
      wn: null,
    }));
  const axes = [
    ...scenario.risk_model.axes,
    ...Object.entries(EXTRA_AXES)
      .filter(([key]) => raw?.factors.some((f) => f.axis === key))
      .map(([key, name]) => ({ key, name })),
  ];
  const ordered = split
    ? [
        ...axes.filter((a) => groupOf(a.key) === 'H'),
        ...axes.filter((a) => groupOf(a.key) === 'X'),
      ]
    : axes;
  return {
    score: raw?.status === 'UNAVAILABLE' ? null : raw?.score ?? null,
    ...(split
      ? { hazard: raw?.hazard ?? null, exposure: raw?.exposure ?? null }
      : {}),
    vars,
    factors: ordered.map((axis) => {
      const den = denominator(axis.key);
      const included =
        raw?.factors.filter((f) => f.axis === apiAxis(axis.key) && f.included) ??
        [];
      return {
        key: axis.key,
        name: axis.name,
        weight:
          raw && den > 0
            ? included.reduce((sum, f) => sum + f.weight, 0) / den
            : null,
        score: raw?.axes[apiAxis(axis.key) as C.RiskAxis] ?? null,
        n: included.length,
        ...(split ? { group: groupOf(axis.key) } : {}),
      };
    }),
    missing:
      raw?.factors.filter((f) => !f.included).map((f) => f.code) ??
      vars.map((v) => v.key),
    predictionId: raw?.prediction_id ?? NULL_TEXT,
    computedAt: null,
    mergedIds: [],
  };
}
