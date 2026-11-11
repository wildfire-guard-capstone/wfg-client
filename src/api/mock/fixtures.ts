import type * as C from '../contracts.ts';
import type { ResponseMap } from '../endpoints.ts';

/** Entirely synthetic UI fixtures; not operational fire, weather, personal, or manual data. */
export const MOCK_PASSWORD = 'mock-password';
export const MOCK_TIME = '2026-11-10T12:00:00+09:00';
export const MOCK_IDS = {
  incident: '100',
  perimeter: '21',
  prediction: '41',
  proposal: '71',
  base: '31',
  village: '1024',
} as const;
const roles: C.UserRole[] = ['COMMANDER', 'VIEWER', 'REPORTER', 'ADMIN'];
export const MOCK_ACCOUNTS: C.User[] = roles.map((role, index) => ({
  id: String(index + 1),
  login_id: `mock-${role.toLowerCase()}`,
  name: `목업 ${role}`,
  organization: 'UI 테스트 기관',
  role,
  admin_area_id: role === 'ADMIN' ? null : '10',
}));

export function mockPolygon(
  scale = 1,
): C.InitialPerimeter['geometry'] & { type: 'MultiPolygon' } {
  const x = 128.6,
    y = 36.37,
    d = 0.001 * scale;
  return {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [x - d, y - d],
          [x + d, y - d],
          [x + d, y + d],
          [x - d, y + d],
          [x - d, y - d],
        ],
      ],
    ],
  };
}
export const page = <T>(items: T[]): C.Page<T> => ({
  items,
  next_cursor: null,
  has_more: false,
});

export function createFixtures(): ResponseMap {
  const user = MOCK_ACCOUNTS[0]!;
  const adminUsers: C.AdminUser[] = MOCK_ACCOUNTS.map((u) => ({
    ...u,
    failed_login_count: 0,
    created_at: MOCK_TIME,
    updated_at: MOCK_TIME,
    deleted_at: null,
  }));
  const incident: C.Incident = {
    id: '100',
    name: '화면 검증용 목업 산불',
    ignition_point: { type: 'Point', coordinates: [128.6, 36.37] },
    address: '목업 발생 장소',
    admin_area_id: '11',
    started_at: null,
    reported_at: MOCK_TIME,
    report_text: '화면 연동 검증을 위한 가상 신고',
    reporter_org: null,
    reporter_name: null,
    reporter_phone: null,
    status: 'IN_PROGRESS',
    current_stage: 'INITIAL',
    situation: {
      villages: {
        '1024': { evacuated: false, evac_order: false, pre_evac_done: false },
      },
      deployed: {
        helicopter: { total: 2, unknown: 2 },
        crew: { total: 0, other: 0 },
      },
    },
    reported_by: '3',
    created_at: MOCK_TIME,
    ended_at: null,
    ended_by: null,
    current_perimeter_id: '21',
    current_perimeter_version: 1,
    latest_prediction_id: '41',
    latest_proposal_id: '71',
    needs_reprediction: false,
    proposal_stale: false,
    situation_revision: 'rev-0',
    running_operation_id: null,
  };
  const summary: C.IncidentSummary = {
    id: incident.id,
    name: incident.name,
    status: incident.status,
    admin_area_id: incident.admin_area_id,
    reported_at: incident.reported_at,
    current_stage: incident.current_stage,
    current_perimeter_version: 1,
    needs_reprediction: false,
    proposal_stale: false,
  };
  const perimeter: C.Perimeter = {
    id: '21',
    incident_id: '100',
    version_no: 1,
    geometry: mockPolygon(),
    observed_at: MOCK_TIME,
    reported_by: '3',
    created_at: MOCK_TIME,
    corrected_at: null,
    area_ha: 10,
  };
  const slices: C.SliceSummary[] = Array.from({ length: 8 }, (_, i) => ({
    hour: (i + 1) as C.PredictionHour,
    at: `2026-11-10T${String(13 + i).padStart(2, '0')}:00:00+09:00`,
    area_ha: 10 * (i + 2),
  }));
  const prediction: C.Prediction = {
    id: '41',
    incident_id: '100',
    perimeter_id: '21',
    perimeter_version: 1,
    base_at: MOCK_TIME,
    requested_by: '1',
    created_at: MOCK_TIME,
    slices,
  };
  const weather: C.Weather = {
    source: 'FIXED',
    issued_at: null,
    location: null,
    hours: Array.from({ length: 9 }, (_, i) => ({
      at: `2026-11-10T${12 + i}:00:00+09:00`,
      kind: '고정',
      wind_dir: 240,
      wind_speed: 3,
      temp: 18,
      humidity: 40,
      precip: 0,
    })),
  };
  const evidence: C.Evidence = {
    chunk_id: 'MOCK-EVIDENCE-001',
    label: '목업 근거',
    doc_name: 'UI 테스트용 합성 문서',
    section: null,
    page: null,
    origin: '검색',
    text: '실제 매뉴얼이 아닌 화면 검증용 합성 근거 문장입니다.',
  };
  const codes: C.ItemCode[] = [
    'S1',
    'S2',
    'S3',
    'S4',
    'S5',
    'S6',
    'E1',
    'E2',
    'E3',
    'E4',
    'E5',
    'E6',
  ];
  const items: C.ProposalItem[] = codes.map((item_code, i) => ({
    item_code,
    name: `${item_code} 목업 항목`,
    axis: i < 6 ? 'SUPPRESSION' : 'EVACUATION',
    state: i === 0 ? 'GENERATED' : 'NOT_TRIGGERED',
    categories: i === 0 ? ['CONSULT'] : [],
    finding: i === 0 ? '화면 검증용 목업 판정입니다.' : '',
    withheld:
      i === 0
        ? [{ field: '추가 자료', reason: '목업에서 제공하지 않음' }]
        : null,
    change_type: i === 0 ? 'CHANGED' : null,
    sections:
      i === 0
        ? [
            {
              title: '목업 본문',
              blocks: [
                {
                  type: 'paragraph',
                  category: 'CONSULT',
                  body: '화면 검증용 예시입니다.',
                  cite: '[목업 근거]',
                  quote: evidence.text!,
                  evidence: [evidence.chunk_id],
                  topic: 'UI 검증',
                  source: 'llm',
                },
                {
                  type: 'list',
                  style: 'bullet',
                  rows: [{ text: '목업 목록 줄' }],
                },
                {
                  type: 'table',
                  head: ['항목', '값'],
                  rows: [['자료', '정보 없음']],
                },
                {
                  type: 'note',
                  text: '실제 재난 대응에 사용할 수 없는 목업입니다.',
                },
              ],
            },
          ]
        : [],
    evidence: i === 0 ? [evidence] : [],
  }));
  const proposal: C.Proposal = {
    id: '71',
    version: 'v1.1',
    trigger: 'PREDICTION',
    created_at: MOCK_TIME,
    base_at: MOCK_TIME,
    prediction_id: '41',
    judged_stage: 'INITIAL',
    predicted_stage: 'INITIAL',
    items,
  };
  const version: C.ProposalVersion = {
    id: '71',
    version: 'v1.1',
    trigger: 'PREDICTION',
    created_at: MOCK_TIME,
    judged_stage: 'INITIAL',
    predicted_stage: 'INITIAL',
    category_counts: { IMMEDIATE: 0, STANDBY: 0, CONSULT: 1, REQUEST: 0 },
    changed_count: 1,
  };
  const diff: C.ProposalDiff = {
    version: 'v1.1',
    previous_version: 'v1.0',
    trigger: 'PREDICTION',
    created_at: MOCK_TIME,
    cause: '목업 판정 변경',
    counts: { changed: 1, wording_only: 0, same: 11 },
    items: [
      {
        item_code: 'S1',
        name: 'S1 목업 항목',
        change: 'CHANGED',
        categories: { before: ['STANDBY'], after: ['CONSULT'] },
        finding: {
          before: '이전 목업 판정',
          after: '화면 검증용 목업 판정입니다.',
        },
        proposals: [],
        rows: { added: [], removed: [] },
        note: null,
      },
    ],
    wording_only_items: [],
    same_items: codes.slice(1),
  };
  const message: C.QaMessage = {
    id: '111',
    incident_id: '100',
    user_id: '1',
    proposal_id: '71',
    item_code: null,
    question: '현재 투입 수를 보여줘',
    answer: '목업의 투입 헬기 합계는 2대입니다.',
    citations: [],
    route: 'STATUS',
    sentences: [
      {
        text: '목업의 투입 헬기 합계는 2대입니다.',
        citations: [],
        data_refs: [
          {
            ref: 'situation.deployed.helicopter.total',
            label: '목업 투입 헬기',
            value: '2대',
          },
        ],
      },
    ],
    insufficient: [],
    no_evidence: false,
    created_at: MOCK_TIME,
  };
  const change: C.CorrectionChange = {
    target: 'deployed',
    item: 'helicopter.unknown',
    before: 2,
    after: 4,
    label: '목업 투입 헬기(미상) 2 → 4대',
  };
  const correction: C.Correction = {
    id: '101',
    incident_id: '100',
    user_id: '1',
    input_text: '목업 정정 입력',
    changes: [
      change,
      {
        ...change,
        item: 'helicopter.total',
        label: '목업 투입 헬기(합계) 2 → 4대',
      },
    ],
    created_at: MOCK_TIME,
  };
  const operation: C.Operation = {
    id: 'mock-operation-1',
    kind: 'PREDICTION',
    status: 'QUEUED',
    stage: null,
    result: null,
    error: null,
  };
  const resource: C.Resource = {
    id: '51',
    kind: 'HELICOPTER',
    name: 'MOCK-HELI-01',
    base_id: '31',
    status: 'AVAILABLE',
    attrs: { model: '목업 기종', capacity_l: 1000 },
    deployed_incident_id: null,
  };
  const base: C.ResourceBase = {
    id: '31',
    name: '목업 기지',
    org_type: 'forest',
    geometry: { type: 'Point', coordinates: [128.59, 36.36] },
    coverage_area_ids: ['10'],
    distance_km: 1.5,
    jurisdiction: 'LOCAL',
  };
  const layerIds = [
    'admin_areas',
    'villages',
    'facilities',
    'road',
    'track',
    'power_line',
    'power_tower',
    'substation',
    'water',
    'house',
  ];
  const layers: C.Layer[] = layerIds.map((id) => ({
    id,
    name: `${id} 목업`,
    entity_type:
      id === 'admin_areas'
        ? 'admin_area'
        : id === 'villages'
          ? 'village'
          : id === 'facilities'
            ? 'facility'
            : 'map_feature',
    available: true,
    source: 'MOCK_FIXTURE',
    reference_date: '2026-11-10',
    attribution: 'UI 테스트용 합성 데이터',
  }));
  const map: C.MapFeatures = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: '1024',
        geometry: mockPolygon(),
        properties: {
          id: '1024',
          code: '0000000001',
          admin_area_id: '11',
          name: '목업 마을',
          label_point: incident.ignition_point,
          population: 150,
          population_month: '2026-11-01',
          pop65_est: null,
          pop0_14_est: null,
          houses_est: null,
        },
      },
    ],
    next_cursor: null,
    has_more: false,
  };
  const weights: [string, C.RiskAxis, number][] = [
    ['slope_up', 'terrain', 0.08],
    ['aspect', 'terrain', 0.06],
    ['curvature', 'terrain', 0.04],
    ['terrain_complexity', 'terrain', 0.03],
    ['elevation', 'terrain', 0.02],
    ['topographic_position', 'terrain', 0.02],
    ['water_distance', 'terrain', 0.02],
    ['fuel_load', 'fuel', 0.05],
    ['forest_type', 'fuel', 0.04],
    ['surface_fuel_depth', 'fuel', 0.04],
    ['stand_age', 'fuel', 0.02],
    ['canopy_height', 'fuel', 0.02],
    ['canopy_cover', 'fuel', 0.02],
    ['wind_speed', 'weather', 0.1],
    ['humidity', 'weather', 0.07],
    ['temperature', 'weather', 0.05],
    ['precipitation', 'weather', 0.04],
    ['ground_temperature', 'weather', 0.04],
    ['precipitation_7d', 'weather', 0.03],
    ['pressure', 'weather', 0.02],
    ['fuel_moisture', 'fuel', 0.06],
    ['vulnerable_population', 'infrastructure', 0.04],
    ['fire_station_distance', 'infrastructure', 0.03],
  ];
  const grades: Record<string, number> = {
    wind_speed: 3.25,
    humidity: 4,
    temperature: 2,
    precipitation: 3,
    vulnerable_population: 4,
    fire_station_distance: 2,
  };
  const includedWeight = weights.reduce(
    (sum, [code, , w]) => sum + (grades[code] === undefined ? 0 : w),
    0,
  );
  const factors: C.RiskFactor[] = weights.map(([code, axis, weight]) => {
    const grade = grades[code] ?? null;
    return {
      code,
      name: `목업 ${code}`,
      axis,
      raw_value: grade === null ? null : grade,
      grade,
      weight,
      included: grade !== null,
      contribution: grade === null ? null : (weight * grade) / includedWeight,
      reason: grade === null ? '목업에서 제공하지 않는 변수' : null,
      source: 'MOCK_FIXTURE',
      value_at: grade === null ? null : MOCK_TIME,
    };
  });
  const axisScore = (axis: C.RiskAxis): number | null => {
    const available = factors.filter((f) => f.axis === axis && f.included);
    const w = available.reduce((sum, f) => sum + f.weight, 0);
    return w
      ? available.reduce((sum, f) => sum + f.weight * f.grade!, 0) / w
      : null;
  };
  const risk: C.Risk = {
    prediction_id: '41',
    status: 'PARTIAL',
    score: factors.reduce((sum, f) => sum + (f.contribution ?? 0), 0),
    grade: null,
    axes: {
      terrain: axisScore('terrain'),
      fuel: axisScore('fuel'),
      weather: axisScore('weather'),
      infrastructure: axisScore('infrastructure'),
    },
    included_weight_sum: includedWeight,
    factors,
    method_version: 'mock-fixture-1',
    unavailable_reasons: [
      'UI 검증용 합성 값이며 일부 변수는 의도적으로 미제공',
    ],
  };

  return {
    'AUTH-01': {
      access_token: 'mock-token-COMMANDER',
      token_type: 'bearer',
      expires_in: 1800,
      user,
    },
    'AUTH-02': user,
    'AUTH-03': undefined,
    'INC-01': page([summary]),
    'INC-02': incident,
    'INC-03': incident,
    'INC-04': {
      ...incident,
      status: 'ENDED',
      ended_at: MOCK_TIME,
      ended_by: '1',
    },
    'PER-01': page([
      perimeter,
      {
        ...perimeter,
        id: '20',
        version_no: 0,
        geometry: incident.ignition_point,
        area_ha: 0,
      },
    ]),
    'PER-02': perimeter,
    'PER-03': { ...perimeter, id: '22', version_no: 2 },
    'PRED-01': operation,
    'PRED-02': prediction,
    'PRED-03': {
      type: 'FeatureCollection',
      features: slices.map((slice) => ({
        type: 'Feature',
        geometry: mockPolygon(slice.hour + 1),
        properties: { ...slice, prediction_id: '41' },
      })),
    },
    'PRED-04': weather,
    'PRED-05': {
      ...operation,
      status: 'SUCCEEDED',
      stage: 'COMMIT',
      result: { prediction_id: '41', proposal_id: '71' },
    },
    'RISK-01': risk,
    'WTH-01': {
      observed_at: MOCK_TIME,
      source: 'MOCK_FIXTURE',
      wind_dir: 240,
      wind_dir_name: '남서',
      wind_speed: 3,
      temp: 18,
      humidity: 40,
      precip: 0,
      next_refresh_at: null,
      stale: false,
    },
    'MAP-01': layers,
    'MAP-02': map,
    'MAP-03': { entity_type: 'village', entity: { ...map.features[0]!.properties, geometry: map.features[0]!.geometry } as C.Village },
    'MAP-04': page([{ id: '11', level: 'EMD', code: '0000000000', name: '목업 행정구역', parent_id: '10', neighbor_ids: [] }]),
    'RES-01': page([resource]),
    'RES-03': resource,
    'RES-04': resource,
    'RES-05': undefined,
    'RES-02': {
      bases: [
        {
          base_id: '31',
          kind: 'HELICOPTER',
          available: 1,
          deployed: 0,
          maintenance: 0,
          total: 1,
        },
      ],
      incident_deployed: incident.situation.deployed!,
      incident_linked: { HELICOPTER: 0, VEHICLE: 0 },
    },
    'BASE-01': page([base]),
    'BASE-02': base,
    'BASE-03': base,
    'BASE-04': undefined,
    'PROP-01': page([
      version,
      { ...version, id: '70', version: 'v1.0', changed_count: null },
    ]),
    'PROP-02': proposal,
    'PROP-03': proposal,
    'PROP-04': diff,
    'PROP-05': { ...operation, kind: 'PROPOSAL_REGENERATION' },
    'AI-01': { type: 'ANSWER', message },
    'AI-02': page([message]),
    'COR-01': {
      correction,
      situation_revision: 'rev-101',
      proposal_stale: true,
      proposal_operation: { ...operation, kind: 'PROPOSAL_REGENERATION' },
    },
    'COR-02': page<C.Correction>([]),
    'LOG-01': page([
      {
        id: '201',
        created_at: MOCK_TIME,
        user_id: '1',
        incident_id: '100',
        action: 'MOCK_EVENT',
        details: { mock: true },
      },
    ]),
    'USR-01': page(adminUsers),
    'USR-02': {
      user: adminUsers[2]!,
      temporary_password: 'mock-temporary-password',
    },
  };
}
