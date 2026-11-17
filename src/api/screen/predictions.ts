import type * as C from '../contracts.ts';
import type { ApiId } from '../endpoints.ts';
import { ApiError } from '../errors.ts';
const invalid = (endpoint: ApiId, field: string): never => {
  throw new ApiError({ endpoint, kind: 'protocol', code: 'INVALID_RESPONSE', message: `[필요한 정보: ${field}]` });
};
const at = (value: string) => Number.isFinite(Date.parse(value));
export function validatePrediction(value: C.Prediction, incidentId: string, predictionId: string) {
  if (!value || value.id !== predictionId || value.incident_id !== incidentId || !at(value.base_at)) invalid('PRED-02', '선택한 산불·예측 ID와 예측 기준 시각');
  if (!Array.isArray(value.slices) || value.slices.some(s => !Number.isInteger(s.hour) || s.hour < 1 || s.hour > 8 || !at(s.at) || !Number.isFinite(s.area_ha) || s.area_ha < 0) || new Set(value.slices.map(s => s.hour)).size !== value.slices.length) invalid('PRED-02', '예측 P1~P8의 유효한 시간');
  return value;
}
export function validateSlices(value: C.PredictionSlices, predictionId: string) {
  if (!value || value.type !== 'FeatureCollection' || !Array.isArray(value.features)) invalid('PRED-03', '예측 GeoJSON FeatureCollection');
  const hours = new Set<number>();
  for (const feature of value.features) {
    const p = feature.properties;
    if (!p || p.prediction_id !== predictionId || !Number.isInteger(p.hour) || p.hour < 1 || p.hour > 8 || hours.has(p.hour) || !at(p.at) || !Number.isFinite(p.area_ha) || p.area_ha < 0 || feature.geometry?.type !== 'MultiPolygon') invalid('PRED-03', '예측 ID·시간·면적과 실제 MultiPolygon 도형');
    hours.add(p.hour);
    for (const polygon of feature.geometry.coordinates)
      for (const ring of polygon)
        for (const position of ring)
          if (position.length < 2 || !Number.isFinite(position[0]) || !Number.isFinite(position[1]) || Math.abs(position[0]!) > 180 || Math.abs(position[1]!) > 90) invalid('PRED-03', '예측 도형의 유효한 경도·위도');
  }
  return value;
}
export function validateRisk(value: C.Risk | null, predictionId: string) {
  if (value && (!Array.isArray(value.factors) || !value.axes || [value.score,value.hazard,value.exposure].some(v=>v!=null && !Number.isFinite(v)) || value.factors.some(f=>!f || typeof f.code !== 'string' || typeof f.name !== 'string' || !Number.isFinite(f.weight) || typeof f.included !== 'boolean' || f.raw_value === undefined || typeof f.raw_value === 'number' && !Number.isFinite(f.raw_value) || f.grade != null && !Number.isFinite(f.grade)) || value.prediction_id !== predictionId || !['READY', 'PARTIAL', 'UNAVAILABLE'].includes(value.status))) invalid('RISK-01', '선택한 예측 ID와 위험도 상태');
  return value;
}

export function validateWeatherNow(value: C.WeatherNow) {
  if (!value || !at(value.observed_at) || (['wind_dir','wind_speed','temp','humidity','precip'] as const).some(key=>value[key] != null && !Number.isFinite(value[key]))) invalid('WTH-01', '기상 관측시각과 유효한 관측값');
  return value;
}
export function matchPredictionSlices(prediction: C.Prediction, slices: C.PredictionSlices) {
  for (const f of slices.features) {
    const p = prediction.slices.find(p=>p.hour===f.properties.hour);
    if (!p || Date.parse(p.at) !== Date.parse(f.properties.at) || p.area_ha !== f.properties.area_ha) invalid('PRED-03', '예측 상세와 일치하는 시간별 도형의 시각·면적');
  }
}
