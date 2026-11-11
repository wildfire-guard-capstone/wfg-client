import type { EventLog } from '../contracts.ts';
import { ApiError, isRecord } from '../errors.ts';
import type { MockEvent } from '../../types/domain.ts';

export function validateEvents(rows: EventLog[], incidentId?: string): EventLog[] {
  const id = (value: unknown) => typeof value === 'string' && /^[1-9]\d*$/.test(value);
  for (const row of rows) {
    if (!isRecord(row) || !id(row.id) || typeof row.created_at !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(row.created_at) || !Number.isFinite(Date.parse(row.created_at)) || typeof row.action !== 'string' || (row.user_id !== null && !id(row.user_id)) || row.incident_id !== (incidentId ?? null) || (row.details !== null && !isRecord(row.details)))
      throw new ApiError({ endpoint: 'LOG-01', kind: 'protocol', code: 'INVALID_RESPONSE', message: '[필요한 정보: 선택 산불의 유효한 이벤트 로그 ID·시각·행위·상세 응답]' });
  }
  return rows;
}
export function eventView(log: EventLog): MockEvent {
  return {
    t: new Date(log.created_at).toLocaleTimeString('ko-KR', { hour12: false, timeZone: 'Asia/Seoul' }),
    kind: log.action,
    text: log.details === null ? '[필요한 정보: 이벤트 상세 details]' : JSON.stringify(log.details),
    inc: log.incident_id,
    user: log.user_id,
  };
}
