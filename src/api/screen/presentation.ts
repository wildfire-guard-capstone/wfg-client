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
/** Only br tokens become line breaks. Every other server tag remains escaped text. */
export function richText(value: unknown, blockId?: string): string {
  const escaped = escapeHTML(
    String(value ?? '').replace(/<br\s*\/?\s*>/gi, '\n'),
  );
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
type SectionDifference = {
  sections: ProposalSection[];
  chunks: Record<string, number>;
  side: Difference['side'];
};
export function sectionHTML(
  sections: ProposalSection[],
  chunks: Record<string, number>,
  blockId: string,
  comparison?: SectionDifference,
): string {
  const paragraph = (
    block: Extract<ProposalSection['blocks'][number], { type: 'paragraph' }>,
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
  return sections
    .map((section, s) => {
      const previous = comparison?.sections[s];
      const diff = (text?: string): Difference | undefined =>
        comparison ? { side: comparison.side, text } : undefined;
      return (
        '<section class="proposal-section">' +
        (section.title
          ? '<b class="section-title">' +
            inlineHTML(section.title, undefined, diff(previous?.title)) +
            '</b>'
          : '') +
        section.blocks
          .map((block, b) => {
            const old = previous?.blocks[b];
            if (block.type === 'paragraph')
              return proseHTML(
                paragraph(block, chunks),
                blockId,
                diff(
                  old?.type === 'paragraph'
                    ? paragraph(old, comparison!.chunks)
                    : undefined,
                ),
              );
            if (block.type === 'list') {
              const tag =
                block.style === 'ordered' || block.style === 'numbered'
                  ? 'ol'
                  : 'ul';
              return (
                '<' +
                tag +
                '>' +
                block.rows
                  .map(
                    (row, r) =>
                      '<li>' +
                      contentHTML(
                        row.text,
                        blockId,
                        diff(
                          old?.type === 'list' ? old.rows[r]?.text : undefined,
                        ),
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
            return proseHTML(
              block.text,
              blockId,
              diff(
                old && (old.type === 'note' || old.type === 'failed')
                  ? old.text
                  : undefined,
              ),
            );
          })
          .join('') +
        '</section>'
      );
    })
    .join('');
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
