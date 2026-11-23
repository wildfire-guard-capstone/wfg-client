import type { Proposal, ItemCode } from '../contracts.ts';
import { ApiError } from '../errors.ts';
export const PROPOSAL_CODES: readonly ItemCode[] = [
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
export function validateProposal(
  value: Proposal | null,
  expectedId?: string,
): Proposal | null {
  if (value === null && expectedId === undefined) return null;
  if (
    !value ||
    typeof value.id !== 'string' ||
    (expectedId !== undefined && value.id !== expectedId) ||
    typeof value.prediction_id !== 'string' ||
    typeof value.version !== 'string' ||
    !Array.isArray(value.items)
  )
    throw new ApiError({
      endpoint: expectedId ? 'PROP-03' : 'PROP-02',
      kind: 'protocol',
      code: 'INVALID_RESPONSE',
      message: '[필요한 정보: 요청한 제안 ID·버전·예측 ID 및 제안 항목]',
    });
  const states = ['GENERATED', 'PARTIAL', 'FAILED', 'REUSED', 'NOT_TRIGGERED'];
  if (
    value.items.length !== PROPOSAL_CODES.length ||
    new Set(value.items.map((i) => i?.item_code)).size !==
      PROPOSAL_CODES.length ||
    value.items.some(
      (i) =>
        !i ||
        !PROPOSAL_CODES.includes(i.item_code) ||
        i.axis !==
          (i.item_code.startsWith('S') ? 'SUPPRESSION' : 'EVACUATION') ||
        !states.includes(i.state) ||
        typeof i.name !== 'string' ||
        !i.name.trim() ||
        !Array.isArray(i.categories) ||
        !Array.isArray(i.sections) ||
        !Array.isArray(i.evidence) ||
        !validSections(i),
    )
  )
    throw new ApiError({
      endpoint: expectedId ? 'PROP-03' : 'PROP-02',
      kind: 'protocol',
      code: 'INVALID_RESPONSE',
      message:
        '[필요한 정보: S1~S6·E1~E6의 중복 없는 12개 제안 항목·이름·상태·축·본문·근거]',
    });
  return value;
}

function validSections(item: Proposal['items'][number]): boolean {
  const str = (v: unknown) => typeof v === 'string';
  const data = (b: { type: string; rows?: unknown; head?: unknown }): boolean => {
    if (b.type === 'list') return Array.isArray(b.rows) && b.rows.every(r=>r && str(r.text));
    if (b.type === 'table') return Array.isArray(b.head) && b.head.every(str) && Array.isArray(b.rows) && b.rows.every(r=>Array.isArray(r) && r.every(str));
    return false;
  };
  const kinds = ['facts', 'part', 'notes'];
  return str(item.finding) && (item.withheld == null || Array.isArray(item.withheld) && item.withheld.every(w=>w && str(w.field) && str(w.reason))) &&
    item.evidence.every(e=>e && str(e.chunk_id)) && item.sections.every(s=>s && str(s.title) && Array.isArray(s.blocks) &&
      (s.kind == null || kinds.includes(s.kind)) && s.blocks.every(b=>{
      if (!b) return false;
      // 제안 문단의 자세한 자료(details, 2026-11-18)는 목록 · 표만
      if (b.type === 'paragraph') return str(b.body) && Array.isArray(b.evidence) && b.evidence.every(str) &&
        (b.details == null || Array.isArray(b.details) && b.details.every(d=>d && data(d)));
      if (b.type === 'fact') return str(b.text) && ['situation', 'status', 'judgment'].includes(b.step);
      if (b.type === 'list' || b.type === 'table') return data(b);
      // 소제목 형식(2026-11-24): 핵심 판단 근거 · 판단 근거 문장 · 자세히 보기(목록 · 표)
      if (b.type === 'reason') return str(b.text);
      if (b.type === 'basis') return Array.isArray(b.sentences) && b.sentences.every(x=>x && str(x.text) && Array.isArray(x.evidence) && x.evidence.every(str));
      if (b.type === 'detail') return typeof b.show === 'boolean' && Array.isArray(b.blocks) && b.blocks.every(d=>d && data(d));
      return (b.type === 'note' || b.type === 'failed') && str(b.text);
    }));
}
