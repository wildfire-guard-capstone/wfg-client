import type { Incident, IncidentSummary, Perimeter } from '../contracts.ts';
import type { Remote } from '../data-source.ts';
import { incidentView } from './adapters.ts';

export const needed = (field: string) => `[필요한 정보: ${field}]`;

/** List rows do not need geometry. Never fabricate a full Incident from a summary. */
export function incidentListRow(summary: IncidentSummary, detail?: Incident) {
  return {
    id: summary.id,
    name: detail?.name ?? summary.name,
    status: (detail?.status ?? summary.status) === 'ENDED' ? '종료' : '진행 중',
    addr: detail?.address ?? needed('산불 발생 주소'),
    start_time: detail?.started_at ?? null,
  };
}

export function incidentDetailsView(raw: Incident, perimeters: Perimeter[]) {
  const view = incidentView(raw, perimeters);
  view.report_text = raw.report_text ?? needed('신고 내용');
  view.caller = {
    org: raw.reporter_org ?? needed('신고 기관명'),
    name: raw.reporter_name ?? needed('신고자 성명'),
    phone: raw.reporter_phone ?? needed('신고자 연락처'),
  };
  return view;
}

export interface IncidentDirectory {
  items: IncidentSummary[];
  details: Map<string, Remote<Incident>>;
}
