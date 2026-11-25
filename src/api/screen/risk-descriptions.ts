/**
 * 위험도 변수 설명(요소별 지표 ⓘ 말풍선, 11/25). 서버 변수 코드(RiskFactor.code) 기준.
 * 「무엇인가 · 왜 위험과 관계있나 · 어떻게 구했나」를 짧게. 기준: wfg-docs 위험도-정리.md(risk-3, 22개).
 */
export const RISK_VAR_DESCRIPTIONS: Record<string, string> = {
  // 지형
  slope_up:
    '땅의 기울기(°)입니다. 불은 오르막에서 더 빨리 번집니다. 30 m 칸 단위 지형(DEM)으로 구해 P5 범위 안을 평균합니다.',
  aspect:
    '비탈이 바라보는 방향입니다. 남쪽을 향할수록 햇빛을 많이 받아 연료가 말라 위험합니다. 범위 안 방향별 비율로 등급을 매깁니다.',
  elevation:
    '해발 높이(m)입니다. 높은 곳일수록 바람이 강하고 접근이 어렵습니다.',
  water_distance:
    '가장 가까운 물길 · 저수지까지의 거리(km)입니다. 물에서 멀수록 땅이 마르고 불을 막는 경계가 적습니다.',
  // 연료
  fuel_load:
    '단위 면적에 탈 수 있는 나무 · 낙엽의 양(t/ha)입니다. 많을수록 불이 세고 오래 탑니다.',
  forest_type:
    '숲의 종류입니다. 소나무 같은 침엽수림은 송진이 있어 잘 타고, 참나무 같은 활엽수림은 덜 탑니다. 풀밭은 불이 가장 빨리 번집니다.',
  surface_fuel_depth:
    '땅 위에 쌓인 낙엽 · 잔가지 층의 두께(cm)입니다. 두꺼울수록 불이 잘 붙습니다. 숲은 국내 실측값이 없어 가정값을 씁니다.',
  stand_age:
    '숲의 평균 나이(년)입니다. 오래된 숲일수록 나무가 크고 탈 것이 많습니다. 임상도의 영급으로 구합니다.',
  canopy_height:
    '나무 꼭대기까지의 높이(m)입니다. 낮을수록 땅의 불이 나무 위로 옮겨붙기(수관화) 쉽습니다.',
  canopy_cover:
    '하늘을 가리는 나뭇잎의 비율(%)입니다. 빽빽할수록 나무끼리 불이 옮겨붙기 쉽습니다.',
  fuel_moisture:
    '가는 낙엽 · 잔가지에 든 수분(%)입니다. 마를수록 불이 잘 붙습니다. 습도 · 기온 · 비로 계산합니다.',
  // 기상
  wind_speed:
    '바람의 세기(m/s)입니다. 산불 확산에 가장 큰 영향을 줍니다. 앞으로 0~5시간 예보를 평균합니다.',
  humidity:
    '공기 중 수분의 비율(%)입니다. 낮을수록 건조해 불이 잘 붙습니다. 0~5시간 예보를 평균합니다.',
  temperature:
    '공기의 온도(℃)입니다. 높을수록 연료가 빨리 마릅니다. 0~5시간 예보를 평균합니다.',
  precipitation:
    '앞으로 5시간 동안 내릴 비의 양(mm)입니다. 비가 없을수록 위험합니다.',
  ground_temperature:
    '땅 표면의 온도(℃)입니다. 높을수록 땅 위 낙엽이 빨리 마릅니다. 가까운 기상청 관측소(ASOS) 값입니다.',
  precipitation_7d:
    '지난 7일 동안 내린 비의 합(mm)입니다. 적을수록 숲이 오래 말라 있었다는 뜻입니다. 기상청 관측소(ASOS) 값입니다.',
  pressure:
    '해면기압(hPa)입니다. 기압이 낮으면 날씨가 불안정해 바람이 세지기 쉽습니다. 기상청 관측소(ASOS) 값입니다.',
  // 인프라 · 규모 · 노출
  vulnerable_population:
    '불 근처(예측 범위 P5 + 1 km)에 사는 65세 이상 · 14세 이하 인원입니다. 대피에 도움이 필요한 사람이 많을수록 위험합니다.',
  fire_station_distance:
    '현재 화선에서 가장 가까운 소방서 · 119안전센터까지의 직선거리(km)입니다. 멀수록 초기 대응이 늦어집니다.',
  fire_area:
    '5시간 뒤 예측 범위(P5)의 면적(ha)입니다. 10 ha = 2등급, 100 ha = 3등급처럼 10배마다 1등급씩 오릅니다.',
  houses_nearby:
    '예측 범위(P5)와 그 바깥 1 km 안의 주택 수(동)입니다. 10배마다 1등급씩 오릅니다.',
};

/** 목업(시나리오) 변수 키 → 서버 코드. 실서비스(http)는 서버 코드가 그대로 온다 */
const SCREEN_TO_CODE: Record<string, string> = {
  slope: 'slope_up', elev: 'elevation', water: 'water_distance', load: 'fuel_load',
  species: 'forest_type', depth: 'surface_fuel_depth', age: 'stand_age', cht: 'canopy_height',
  cover: 'canopy_cover', moist: 'fuel_moisture', wind: 'wind_speed', rh: 'humidity',
  temp: 'temperature', rain: 'precipitation', gtemp: 'ground_temperature',
  rain7: 'precipitation_7d', pres: 'pressure', vuln: 'vulnerable_population',
  fire_st: 'fire_station_distance',
};

export function riskVarDescription(key: string): string | null {
  return RISK_VAR_DESCRIPTIONS[key] ?? RISK_VAR_DESCRIPTIONS[SCREEN_TO_CODE[key] ?? ''] ?? null;
}
