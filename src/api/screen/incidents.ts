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
  // QA 2-4: 신고 내용·신고자 칸은 선택 항목이라 null은 '없음'이다. 입력칸에 안내 문구를 값으로 넣지 않는다
  view.report_text = raw.report_text ?? '';
  view.caller = {
    org: raw.reporter_org ?? '',
    name: raw.reporter_name ?? '',
    phone: raw.reporter_phone ?? '',
  };
  return view;
}

export interface IncidentDirectory {
  items: IncidentSummary[];
  details: Map<string, Remote<Incident>>;
}

/** HTTP facts are joined by ID. Legacy demo data alone uses village names. */
export function villageEvacuated(
  incident: ReturnType<typeof incidentView>,
  id: string,
  name?: string,
): boolean | undefined {
  const es = incident.evacuation_state;
  if (es.evacuated_by_id !== undefined) return es.evacuated_by_id[id];
  return name === undefined ? undefined : es.completed_villages.includes(name);
}
export const evacuationText = (value: boolean | undefined) =>
  value === true
    ? '대피 완료'
    : value === false
      ? '대피 미완료'
      : '대피 완료 여부 미확인';
