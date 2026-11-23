import { MISSING_TEXT } from './presentation.ts';
import type { Incident } from '../contracts.ts';

/** 단계 코드를 화면 이름으로. 서버 current_stage 코드와 기존 데모 시나리오의
 * 한글 단계 이름을 모두 받는다(11/20 회의: 공식 단계는 초기·1·2단계만). */
export function overviewOfficialStage(value: unknown): string {
  switch (value) {
    case 'INITIAL': case '초기': case '초기대응': return '초기';
    case 'STAGE1': case '1단계': case '확산대응 1단계': return '1단계';
    case 'STAGE2': case '2단계': case '확산대응 2단계': return '2단계';
    default: return MISSING_TEXT;
  }
}

export interface OverviewStage {
  /** 칸에 보이는 단계(초기 · 1단계 · 2단계) 또는 「판정 전」 */
  text: string;
  /** missing: 산불 정보 없음 · before: 첫 예측 전 · judged: 규칙 엔진이 판정한 값 */
  state: 'missing' | 'before' | 'judged';
  /** 단계 뒤 작은 글씨. 없으면 빈 문자열 */
  note: string;
}
export const STAGE_BEFORE_JUDGEMENT = '판정 전';
export const STAGE_JUDGE_HINT = '확산 예측을 실행하면 판정됩니다';
export const STAGE_PREVIOUS_PREDICTION = '(직전 예측 기준)';

/** 산불현황 '공식 단계'(QA 3-1, 11/23). INC-03 current_stage는 서버 규칙 엔진이
 * 확산 예측(PRED-01)·정정 재생성 때 피해면적(P0·P5)·풍속·P5 안 시설 동수 중
 * 가장 높은 요소로 판정해 저장한 값이다. 첫 예측 전에는 판정하지 않은 기본값
 * (INITIAL)이라 보이지 않고 「판정 전」으로 둔다. 예측 뒤 새 실측 화선이 들어와
 * 재예측이 필요하면 그 단계는 직전 예측 기준임을 함께 알린다. 종료된 산불은 예측할
 * 수 없으므로 예측 실행 안내를 붙이지 않는다. */
export function overviewStage(
  incident: Pick<Incident, 'status' | 'current_stage' | 'latest_prediction_id' | 'needs_reprediction'> | null | undefined,
): OverviewStage {
  if (!incident) return { text: MISSING_TEXT, state: 'missing', note: '' };
  if (!incident.latest_prediction_id)
    return {
      text: STAGE_BEFORE_JUDGEMENT,
      state: 'before',
      note: incident.status === 'ENDED' ? '' : STAGE_JUDGE_HINT,
    };
  return {
    text: overviewOfficialStage(incident.current_stage),
    state: 'judged',
    note: incident.needs_reprediction ? STAGE_PREVIOUS_PREDICTION : '',
  };
}

/** GeoJSON order is longitude, latitude. Do not round the source coordinates. */
export function overviewCoordinates(value: unknown): string {
  if (!Array.isArray(value) || value.length < 2) return `위도·경도 ${MISSING_TEXT}`;
  const [lng, lat] = value;
  if (typeof lng !== 'number' || typeof lat !== 'number' ||
      !Number.isFinite(lng) || !Number.isFinite(lat) ||
      Math.abs(lng) > 180 || Math.abs(lat) > 90) return `위도·경도 ${MISSING_TEXT}`;
  return `위도 ${Math.abs(lat)}° ${lat < 0 ? 'S' : 'N'} · 경도 ${Math.abs(lng)}° ${lng < 0 ? 'W' : 'E'}`;
}
