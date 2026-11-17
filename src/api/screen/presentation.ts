import type { Remote } from '../data-source.ts';
import type { ProposalSection } from '../contracts.ts';
import { tableText, type TextPart } from './table-text.ts';
export const MISSING_TEXT = '정보 미제공';
export type DataState =
  | 'ready'
  | 'absent'
  | 'not-generated'
  | 'error'
  | 'forbidden'
  | 'partial'
  | 'loading';
export function remoteState(
  remote: Remote<unknown> | undefined,
  options: { loading?: boolean; partial?: boolean; generated?: boolean } = {},
): DataState {
  if (options.loading) return 'loading';
  if (!remote || remote.status === 'not-requested')
    return options.generated === false ? 'not-generated' : 'absent';
  if (remote.status === 'error')
    return (remote.error as { status?: number })?.status === 403
      ? 'forbidden'
      : 'error';
  if (options.partial) return 'partial';
  if (
    remote.data == null ||
    (Array.isArray(remote.data) && remote.data.length === 0)
  )
    return options.generated === false ? 'not-generated' : 'absent';
  return 'ready';
}
export const stateText = (state: DataState, subject: string) =>
  ({
    ready: `${subject} 조회 완료`,
    absent: `${subject} 데이터 없음`,
    'not-generated': `${subject} 생성 전`,
    error: `${subject} 조회 실패`,
    forbidden: `${subject} 조회 권한 없음`,
    partial: `${subject} 일부 제공`,
    loading: `${subject} 불러오는 중…`,
  })[state];
export const escapeHTML = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
/** Only br tokens become line breaks. Every other server tag remains escaped text.
 *  규칙 엔진 목록의 굵게 표기(`**괴산리**`)는 굵은 글씨로, 짝이 맞지 않는 `**`는 지운다(2026-11-17). */
export function richText(value: unknown, blockId?: string): string {
  const escaped = escapeHTML(
    String(value ?? '').replace(/<br\s*\/?\s*>/gi, '\n'),
  )
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*\*/g, '');
  const lines = escaped.replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');
  return blockId === undefined
    ? lines
    : lines.replace(
        /\[(\d+)\]/g,
        (_, k) =>
          `<span class="cite" data-b="${escapeHTML(blockId)}" data-k="${k}">${k}</span>`,
      );
}
/** A reference suffix must not become an extra cell in the final table row. */
export function withCitations(value: string, references: string[]): string {
  if (!references.length) return value;
  const separator = tableText(value).some((part) => part.type !== 'text')
    ? '\n'
    : '';
  return value + separator + references.join('');
}
type Difference = { text?: string; side: 'before' | 'after' };
const breaks = (text: string) => text.replace(/<br\s*\/?\s*>/gi, '\n');

/** Escape each token before adding our own diff markup; cap the LCS matrix. */
function inlineHTML(
  value: string,
  blockId?: string,
  difference?: Difference,
): string {
  if (!difference || value === difference.text) return richText(value, blockId);
  const tag = difference.side === 'before' ? 'del' : 'ins';
  const mark = (text: string) =>
    '<' + tag + ' class="wd">' + richText(text, blockId) + '</' + tag + '>';
  if (difference.text === undefined) return mark(value);
  const current = breaks(value).split(/(\s+)/).filter(Boolean);
  const other = breaks(difference.text).split(/(\s+)/).filter(Boolean);
  if (!current.length) return '';
  if (
    !other.length ||
    current.length > 5_000 ||
    other.length > 5_000 ||
    current.length * other.length > 250_000
  )
    return mark(value);
  const lengths = Array.from(
    { length: current.length + 1 },
    () => new Uint32Array(other.length + 1),
  );
  for (let i = current.length - 1; i >= 0; i--)
    for (let j = other.length - 1; j >= 0; j--)
      lengths[i]![j] =
        current[i] === other[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
  let i = 0,
    j = 0,
    html = '';
  while (i < current.length) {
    if (current[i] === other[j]) {
      html += richText(current[i], blockId);
      i++;
      j++;
    } else if (j < other.length && lengths[i]![j + 1]! > lengths[i + 1]![j]!)
      j++;
    else html += mark(current[i++]!);
  }
  return html;
}
type Table = Extract<TextPart, { type: 'table' }>;
function tableHTML(
  table: Table,
  blockId?: string,
  other?: Table,
  side?: Difference['side'],
  format: string = table.format,
): string {
  const cell = (value: string, previous?: string) =>
    inlineHTML(value, blockId, side ? { text: previous, side } : undefined);
  const note =
    table.format === 'pipe'
      ? '<div class="proposal-table-note small muted">원문 행·열만 표시했습니다. 제목·병합 셀 관계는 확인이 필요합니다.</div>'
      : '';
  return (
    '<div class="proposal-table" tabindex="0" role="region" aria-label="제안 표">' +
    note +
    '<table class="grid" data-table-format="' +
    format +
    '">' +
    (table.head
      ? '<thead><tr>' +
        table.head
          .map((value, i) => '<th>' + cell(value, other?.head?.[i]) + '</th>')
          .join('') +
        '</tr></thead>'
      : '') +
    '<tbody>' +
    table.rows
      .map(
        (row, r) =>
          '<tr>' +
          row
            .map(
              (value, c) => '<td>' + cell(value, other?.rows[r]?.[c]) + '</td>',
            )
            .join('') +
          '</tr>',
      )
      .join('') +
    '</tbody></table></div>'
  );
}

/** Only our table markup is HTML; every string cell still goes through richText. */
export function contentHTML(
  value: unknown,
  blockId?: string,
  difference?: Difference,
): string {
  const parts = tableText(value),
    other = difference ? tableText(difference.text) : [];
  return parts
    .map((part, i) => {
      const previous = other[i];
      if (part.type === 'table')
        return tableHTML(
          part,
          blockId,
          previous?.type === 'table' ? previous : undefined,
          difference?.side,
        );
      const text = inlineHTML(
        part.text,
        blockId,
        difference
          ? {
              side: difference.side,
              text:
                previous && previous.type !== 'table'
                  ? previous.text
                  : undefined,
            }
          : undefined,
      );
      return part.type === 'unresolved'
        ? '<div class="proposal-table-raw"><div class="proposal-table-note small muted" role="note">표 구조를 확정할 수 없어 원문을 보존했습니다. 제목·열·병합 관계 확인이 필요합니다.</div><div class="proposal-table-original">' +
            text +
            '</div></div>'
        : text;
    })
    .join('');
}
function proseHTML(value: string, blockId: string, difference?: Difference) {
  const html = contentHTML(value, blockId, difference);
  return html.includes('<div class="proposal-table')
    ? '<div class="proposal-prose">' + html + '</div>'
    : '<p>' + html + '</p>';
}
// 목록 줄이 스스로 가진 번호: ①~⑳, 「1.」 「1)」
const OWN_NUMBER = /^\s*(?:[①-⑳]|\d+[.)])/;
// 제안 문장마다 그 구분(즉시 · 대기 · 협의 · 요청)을 앞에 붙인다(2026-11-17 — 카드 머리에 모아 붙이면
// 한 항목에 「즉시」와 「대기」가 함께 보여 어느 할 일이 어느 구분인지 알 수 없었다)
const CATEGORY_LABEL: Record<string, string> = {
  IMMEDIATE: '즉시',
  STANDBY: '대기',
  CONSULT: '협의',
  REQUEST: '요청',
};
function withCategory(category: string | undefined, html: string): string {
  const label = category ? CATEGORY_LABEL[category] : undefined;
  if (!label) return html;
  const tag =
    '<span class="badge b-' + label + ' prop-cat">' + label + '</span> ';
  return html.startsWith('<p>')
    ? '<p>' + tag + html.slice(3)
    : '<div class="prop-cat-row">' + tag + '</div>' + html;
}
type SectionDifference = {
  sections: ProposalSection[];
  chunks: Record<string, number>;
  side: Difference['side'];
};
type Block = ProposalSection['blocks'][number];
type DetailBlock = NonNullable<
  Extract<Block, { type: 'paragraph' }>['details']
>[number];
export interface SectionOptions {
  /** ※ 안내(note)를 섹션에 두지 않고 빼 둔다 — missingHTML이 「빠진 정보」 한 곳에 모은다 */
  gatherNotes?: boolean;
}
/** 접기 단추(누르는 동작은 createMockRuntime이 `.fold-toggle`에 붙인다) */
const foldToggle = (open: boolean, text: string) =>
  '<button type="button" class="fold-toggle" aria-expanded="' +
  open +
  '">' +
  escapeHTML(text) +
  '</button>';
/** 접히는 부분: fixed(버전 비교 화면)면 단추 없이 펼친 채 제목만 */
function foldHTML(
  className: string,
  title: string,
  body: string,
  open: boolean,
  fixed: boolean,
): string {
  return (
    '<div class="' +
    className +
    ' fold' +
    (open || fixed ? ' open' : '') +
    '" role="group" aria-label="' +
    escapeHTML(title) +
    '">' +
    (fixed
      ? '<b class="part-title">' + escapeHTML(title) + '</b>'
      : foldToggle(open, title)) +
    '<div class="fold-body">' +
    body +
    '</div></div>'
  );
}
export function sectionHTML(
  sections: ProposalSection[],
  chunks: Record<string, number>,
  blockId: string,
  comparison?: SectionDifference,
  options: SectionOptions = {},
): string {
  const fixed = Boolean(comparison);
  const paragraph = (
    block: Extract<Block, { type: 'paragraph' }>,
    refs: Record<string, number>,
  ) =>
    withCitations(
      block.body,
      block.evidence
        .filter(
          (id) =>
            Object.hasOwn(refs, id) &&
            Number.isInteger(refs[id]) &&
            refs[id]! > 0,
        )
        .map((id) => '[' + refs[id] + ']'),
    );
  const diffOf =
    (side?: Difference['side']) =>
    (text?: string): Difference | undefined =>
      side ? { side, text } : undefined;
  /** 블록 하나(목록 · 표는 제안의 자세한 자료에도 같이 쓴다) */
  const blockHTML = (
    block: Block | DetailBlock,
    old: Block | DetailBlock | undefined,
  ): string => {
    const diff = diffOf(comparison?.side);
    if (block.type === 'fact')
      return proseHTML(
        block.text,
        blockId,
        diff(old?.type === 'fact' ? old.text : undefined),
      );
    if (block.type === 'paragraph') {
      const line = withCategory(
        block.category,
        proseHTML(
          paragraph(block, chunks),
          blockId,
          diff(
            old?.type === 'paragraph'
              ? paragraph(old, comparison!.chunks)
              : undefined,
          ),
        ),
      );
      // 그 제안의 자세한 자료(서버 2026-11-18 details): 문장 밑 「자세히 보기」, 처음엔 접힘
      const details = block.details ?? [];
      const oldDetails = old?.type === 'paragraph' ? (old.details ?? []) : [];
      return details.length
        ? line +
            foldHTML(
              'prop-detail',
              '자세히 보기',
              details.map((d, i) => blockHTML(d, oldDetails[i])).join(''),
              false,
              fixed,
            )
        : line;
    }
    if (block.type === 'list') {
      const tag =
        block.style === 'ordered' || block.style === 'numbered' ? 'ol' : 'ul';
      // 줄마다 이미 번호(①, 1.)가 있으면 자동 번호를 끈다(「1. ① 인명」처럼 겹치지 않게)
      const own = block.rows.every((row) => OWN_NUMBER.test(row.text));
      return (
        '<' +
        tag +
        (own ? ' class="list-plain"' : '') +
        '>' +
        block.rows
          .map(
            (row, r) =>
              '<li>' +
              contentHTML(
                row.text,
                blockId,
                diff(old?.type === 'list' ? old.rows[r]?.text : undefined),
              ) +
              '</li>',
          )
          .join('') +
        '</' +
        tag +
        '>'
      );
    }
    if (block.type === 'table')
      return tableHTML(
        {
          type: 'table',
          format: 'markdown',
          head: block.head,
          rows: block.rows,
        },
        blockId,
        old?.type === 'table'
          ? {
              type: 'table',
              format: 'markdown',
              head: old.head,
              rows: old.rows,
            }
          : undefined,
        comparison?.side,
        'dto',
      );
    const prose = proseHTML(
      block.text,
      blockId,
      diff(
        old && (old.type === 'note' || old.type === 'failed')
          ? old.text
          : undefined,
      ),
    );
    // ※ 안내는 작고 흐리게
    return block.type === 'note'
      ? '<div class="proposal-note">' + prose + '</div>'
      : prose;
  };
  // 소제목 앞 번호(「1. 진화 우선순위」)는 뗀다 — 네 단계 배치에서는 판정 자료만 소제목을 갖는다
  const title = (value?: string) => value?.replace(/^\s*\d+\.\s*/, '');
  return sections
    .map((section, s) => {
      const previous = comparison?.sections[s];
      const keep = section.blocks
        .map((block, b) => ({ block, old: previous?.blocks[b] }))
        .filter(({ block }) => !(options.gatherNotes && block.type === 'note'));
      if (!keep.length) return ''; // ※ 안내만 있던 섹션은 「빠진 정보」로 옮겨 가 비었다
      const kept = keep.map(({ block }) => block);
      const rendered = keep.map(({ block, old }) => blockHTML(block, old));
      return (
        '<section class="proposal-section">' +
        (section.title
          ? '<b class="section-title">' +
            inlineHTML(
              title(section.title)!,
              undefined,
              diffOf(comparison?.side)(title(previous?.title)),
            ) +
            '</b>'
          : '') +
        groupedHTML(kept, rendered, fixed) +
        '</section>'
      );
    })
    .join('');
}
/**
 * 네 단계 제안서(서버 2026-11-17): 위 = 「현황」(상황 · 상태 · 판단, 처음엔 접힘), 아래 = 「제안」(paragraph와
 * 생성 실패 안내, 처음엔 펼침), 그 밑 = 남은 목록 · 표. 카드 안에 상자를 겹치지 않고 구분선으로만 나눈다.
 * 버전 비교 화면(fixed)은 단추 없이 모두 펼쳐 그린다. fact 블록이 없는 섹션(옛 제안서 · 판정 자료 섹션)은
 * 예전처럼 블록 순서대로 그린다.
 */
function groupedHTML(
  blocks: Block[],
  rendered: string[],
  fixed = false,
): string {
  if (!blocks.some((block) => block.type === 'fact')) return rendered.join('');
  const pick = (keep: (block: Block) => boolean) =>
    blocks.map((block, b) => (keep(block) ? rendered[b] : '')).join('');
  const step = (name: string) =>
    pick((block) => block.type === 'fact' && block.step === name);
  const facts = step('situation') + step('status') + step('judgment');
  const actions = pick(
    (block) => block.type === 'paragraph' || block.type === 'failed',
  );
  const rest = pick(
    (block) =>
      block.type !== 'fact' &&
      block.type !== 'paragraph' &&
      block.type !== 'failed',
  );
  return (
    foldHTML('proposal-facts', '현황', facts, false, fixed) +
    (actions
      ? foldHTML('proposal-actions', '제안', actions, true, fixed)
      : '') +
    rest
  );
}
/**
 * 「빠진 정보」 한 곳(2026-11-18): 섹션의 ※ 안내(note)와 항목의 판단하지 않은 것(withheld)을 모아 카드 맨 아래에
 * 접어 둔다. 모을 것이 없으면 빈 글. sectionHTML(…, { gatherNotes: true })와 함께 쓴다.
 */
export function missingHTML(
  sections: ProposalSection[],
  withheld: { field: string; reason?: string | null }[] = [],
): string {
  const notes = sections.flatMap((section) =>
    section.blocks.flatMap((block) =>
      block.type === 'note' ? [block.text.replace(/^\s*※\s*/, '')] : [],
    ),
  );
  const rows = [
    ...notes.map((text) => richText(text)),
    ...withheld.map(
      (w) =>
        '<b>' +
        escapeHTML(w.field) +
        '</b>' +
        (w.reason ? ' — ' + richText(w.reason) : ''),
    ),
  ];
  if (!rows.length) return '';
  return foldHTML(
    'proposal-missing',
    '빠진 정보',
    '<ul>' + rows.map((row) => '<li>' + row + '</li>').join('') + '</ul>',
    false,
    false,
  );
}
interface ComparisonBlock {
  id: string;
  text: string;
  apiSections?: ProposalSection[];
  apiChunks?: Record<string, number>;
}
export function comparisonHTML(
  before: ComparisonBlock,
  after: ComparisonBlock,
): [string, string] {
  const render = (
    current: ComparisonBlock,
    other: ComparisonBlock,
    side: Difference['side'],
  ) =>
    current.apiSections
      ? sectionHTML(current.apiSections, current.apiChunks ?? {}, current.id, {
          sections: other.apiSections ?? [],
          chunks: other.apiChunks ?? {},
          side,
        })
      : contentHTML(current.text, current.id, { text: other.text, side });
  return [render(before, after, 'before'), render(after, before, 'after')];
}
export function observedAt(
  value: string,
  minimum?: string,
  now = Date.now(),
): string {
  if (!value || !Number.isFinite(Date.parse(value)))
    throw new Error('실측 화선의 관측시각을 입력해주세요.');
  const at = Date.parse(value);
  // Backend incidents router: FUTURE_SLACK_S=300, current/previous observation lower bound.
  if (at > now + 300_000)
    throw new Error('관측시각은 현재보다 5분 넘게 미래일 수 없습니다.');
  if (minimum && at < Date.parse(minimum))
    throw new Error('직전 화선보다 앞선 관측시각입니다.');
  return new Date(value).toISOString();
}
export function canCorrectPerimeter(version: number, geometry: string) {
  return version > 0 && (geometry === 'Polygon' || geometry === 'MultiPolygon');
}
