import type { Correction, EventLog } from '../contracts.ts';
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

// 이벤트 로그 화면(QA): 지휘권자가 「누가 언제 무엇을 했고 화선·예측·제안서가 어떻게 바뀌었나」를
// 보도록 핵심 이벤트만 한 조작 = 한 줄로 보인다. 서버는 action 코드·details만 주고 구분·문장은
// 화면이 만든다(DB 설계 event_logs). 목록에 없는 action은 숨긴다.

/** 상황 보고자만 할 수 있는 action(서버 권한). 나머지 핵심 이벤트는 통합지휘권자만 만든다. */
const REPORTER_ACTIONS = new Set(['INCIDENT_REPORTED', 'PERIMETER_REPORTED', 'PERIMETER_CORRECTED']);
const KST = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
function kstParts(date: Date) {
  const p = Object.fromEntries(KST.formatToParts(date).map(({ type, value }) => [type, value]));
  return { day: `${p.year}-${p.month}-${p.day}`, md: `${p.month}.${p.day}`, hm: `${p.hour}:${p.minute}`, s: p.second };
}
/** 오늘(KST)은 「16:00:29」, 다른 날은 「11.18 16:13」. */
export function eventTime(createdAt: string, now: Date = new Date()): string {
  const at = kstParts(new Date(createdAt));
  return at.day === kstParts(now).day ? `${at.hm}:${at.s}` : `${at.md} ${at.hm}`;
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const count = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null);
const version = (value: unknown) => (count(value) === null ? null : `v${value}`);
const clip = (value: string, max = 40) => (value.length > max ? `${value.slice(0, max)}…` : value);
const key = (value: unknown) => (typeof value === 'number' || typeof value === 'string' ? String(value) : null);
const join = (...parts: (string | null | false | undefined)[]) => parts.filter(Boolean).join(' · ');

export interface EventContext {
  /** COR-02 정정 이력 — SITUATION_CORRECTED에 정정 문장을 붙인다. */
  corrections?: readonly Correction[];
  now?: Date;
}

/** LOG-01 행(최신순) → 화면 행(최신순). 핵심이 아닌 행은 빼거나 다른 행에 합친다. */
export function eventViews(logs: readonly EventLog[], context: EventContext = {}): MockEvent[] {
  const detail = (log: EventLog) => log.details ?? {};
  // 최초 보고와 같은 트랜잭션(같은 시각)에 저장된 첫 실측 화선은 최초 보고 행에 합친다.
  const reportedAt = new Set(logs.filter((log) => log.action === 'INCIDENT_REPORTED').map((log) => log.created_at));
  const firstPerimeter = new Map<string, string>();
  for (const log of logs)
    if (log.action === 'PERIMETER_REPORTED' && reportedAt.has(log.created_at)) {
      const v = version(detail(log).version_no);
      if (v) firstPerimeter.set(log.created_at, v);
    }
  // 근거 부족으로 뺀 제안 항목은 그 제안서 행에 개수로 붙인다.
  const noEvidence = new Map<string, number>();
  for (const log of logs)
    if (log.action === 'ITEM_NO_EVIDENCE') {
      const id = key(detail(log).proposal_id);
      if (id) noEvidence.set(id, (noEvidence.get(id) ?? 0) + 1);
    }
  const corrections = new Map((context.corrections ?? []).map((row) => [row.id, row.input_text]));

  function view(log: EventLog): { kind: string; text: string } | null {
    const d = detail(log);
    switch (log.action) {
      case 'INCIDENT_REPORTED': {
        const v = firstPerimeter.get(log.created_at);
        return { kind: '입력', text: join('산불 최초 보고', v && `실측 화선 ${v}`) };
      }
      case 'PERIMETER_REPORTED': {
        if (reportedAt.has(log.created_at)) return null;
        const v = version(d.version_no);
        return { kind: '입력', text: v ? `실측 화선 ${v} 보고` : '실측 화선 보고' };
      }
      case 'PERIMETER_CORRECTED': {
        const v = version(d.version_no);
        return { kind: '입력', text: v ? `실측 화선 정정 → ${v}` : '실측 화선 정정' };
      }
      case 'PROPOSAL_CREATED': {
        const v = text(d.version);
        const proposal = v ? `대응 제안 ${v}` : '대응 제안';
        const changed = count(d.changed_items), omitted = noEvidence.get(key(d.proposal_id) ?? '') ?? 0;
        const tail = [changed !== null && changed > 0 && `변경 ${changed}건`, omitted > 0 && `근거 부족 ${omitted}항목 제외`];
        if (d.trigger === 'PREDICTION') return { kind: '예측', text: join(`확산 예측 · ${proposal} 생성`, ...tail) };
        if (d.trigger === 'CORRECTION') return { kind: '제안', text: join(`${proposal} 재생성`, ...tail) };
        return { kind: '제안', text: join(`${proposal} 생성`, ...tail) };
      }
      case 'PREDICTION_FAILED': {
        const message = text(d.message);
        return { kind: '예측', text: message ? `확산 예측 실패 — ${message}` : '확산 예측 실패' };
      }
      case 'SITUATION_CORRECTED': {
        const input = text(corrections.get(key(d.correction_id) ?? ''));
        return { kind: '정정', text: input ? `상황 정정 「${clip(input)}」` : '상황 정정' };
      }
      case 'PROPOSAL_FAILED': {
        const message = text(d.message);
        // 정정이 없으면 예측 뒤 첫 제안서 생성(두 묶음, 11/24)
        const what = 'correction_id' in d && d.correction_id === null ? '대응 제안 생성 실패' : '대응 제안 재생성 실패';
        return { kind: '제안', text: message ? `${what} — ${message}` : what };
      }
      case 'QA_NO_EVIDENCE': {
        if (d.full === true) return { kind: '근거 부족', text: 'AI 답변 근거 없음' };
        const missing = Array.isArray(d.missing) ? d.missing.map(text).filter((m): m is string => !!m) : [];
        return { kind: '근거 부족', text: missing.length ? `AI 답변 근거 부족 — ${clip(missing.join(', '))}` : 'AI 답변 근거 부족' };
      }
      case 'INCIDENT_ENDED': {
        const released = Array.isArray(d.released_resource_ids) ? d.released_resource_ids.length : 0;
        return { kind: '종료', text: join('산불 종료', released > 0 && `투입 자원 ${released}대 대기 전환`) };
      }
      default:
        // PREDICTION_CREATED(같은 트랜잭션의 예측 계기 제안 행이 대신함) · ITEM_NO_EVIDENCE(제안 행에 합침)
        // · RESOURCE_UPDATED(종료 행에 합침) · 그 밖의 action은 보이지 않는다.
        return null;
    }
  }

  const rows: MockEvent[] = [];
  for (const log of logs) {
    const shown = view(log);
    if (!shown) continue;
    rows.push({
      t: eventTime(log.created_at, context.now),
      kind: shown.kind,
      text: shown.text,
      inc: log.incident_id,
      user: log.user_id === null ? null : REPORTER_ACTIONS.has(log.action) ? '보고자' : '지휘권자',
    });
  }
  return rows;
}
