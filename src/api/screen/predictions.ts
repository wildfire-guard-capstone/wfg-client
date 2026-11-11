import type * as C from '../contracts.ts';
import type { ApiId } from '../endpoints.ts';
import { ApiError } from '../errors.ts';
const invalid = (endpoint: ApiId, field: string): never => {
  throw new ApiError({ endpoint, kind: 'protocol', code: 'INVALID_RESPONSE', message: `[필요한 정보: ${field}]` });
};
const at = (value: string) => Number.isFinite(Date.parse(value));
export function validatePrediction(value: C.Prediction, incidentId: string, predictionId: string) {
  if (!value || value.id !== predictionId || value.incident_id !== incidentId || !at(value.base_at)) invalid('PRED-02', '선택한 산불·예측 ID와 예측 기준 시각');
  if (!Array.isArray(value.slices) || value.slices.some(s => !Number.isInteger(s.hour) || s.hour < 1 || s.hour > 8 || !at(s.at)) || new Set(value.slices.map(s => s.hour)).size !== value.slices.length) invalid('PRED-02', '예측 P1~P8의 유효한 시간');
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
  if (value && (value.prediction_id !== predictionId || !['READY', 'PARTIAL', 'UNAVAILABLE'].includes(value.status))) invalid('RISK-01', '선택한 예측 ID와 위험도 상태');
  return value;
}
