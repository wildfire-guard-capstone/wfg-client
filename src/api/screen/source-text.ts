/**
 * 출처 창의 원문(매뉴얼 · 규정 발췌)을 읽기 좋게 그린다(2026-11-25 사용자 「표로 보이게」).
 * 서버 발췌는 합쳐진 칸을 같은 글로 되풀이하고(「Set | Set」), 다른 쪽에서 이어지는 표는 앞줄 「<표: … (구 분 | 임무 및 역할)>」에
 * 머리를 적어 둔다. 그 약속으로만 표를 그린다. 원문 낱말은 바꾸지 않고 줄을 나누거나 되풀이된 칸을 합치기만 한다.
 */
import { richText } from './presentation.ts';

const TABLE_LINE = /^\s*\|.*\|\s*$/;
const RULE_CELL = /^:?-{3,}:?$/;
const same = (a: string, b: string) => a.replace(/\s+/g, '') === b.replace(/\s+/g, '');

function rowCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/** 「<표: 이름 — p.87에서 이어지는 표(구 분 | 임무 및 역할), 첫 행은 …>」 → 이름 · 머리 · 덧말 */
function captionOf(line: string): { title: string; head: string[]; note: string } | null {
  const m = /^\s*<표:\s*(.+)>\s*$/.exec(line);
  if (!m) return null;
  let body = m[1]!, head: string[] = [];
  // 머리 = 「|」가 든 가장 바깥 괄호(안에 괄호가 또 있을 수 있다: 「비상 대응 단계(중수본 운영, 필요시)」)
  for (let i = 0, depth = 0, start = 0; i < body.length; i++) {
    if (body[i] === '(' && !depth++) start = i;
    else if (body[i] === ')' && depth && !--depth && body.slice(start, i).includes('|')) {
      head = body.slice(start + 1, i).split('|').map((c) => c.trim());
      body = body.slice(0, start) + body.slice(i + 1);
      break;
    }
  }
  const cut = body.indexOf(' — ');
  return cut < 0
    ? { title: body.trim(), head, note: '' }
    : { title: body.slice(0, cut).trim(), head, note: body.slice(cut + 3).trim() };
}

/** 한 줄에 이어진 「o … o …」 「① … ② …」 「<산림청> … <진화기관> …」을 줄로 나눈다(글자는 그대로). */
function splitMarks(text: string): string[] {
  return text
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .split('\n')
    .flatMap((line) =>
      /^\s*\[(?:별표|별지)/.test(line)
        ? [line]
        : line.split(/\s+(?=(?:o|□)\s+\S)|\s+(?=[①-⑳]\s)|\s+(?=<[가-힣]{2,12}>\s)/),
    )
    .map((line) => line.trim())
    .filter(Boolean);
}
function linesHTML(text: string): string {
  return splitMarks(text)
    .map((line) => {
      const level = /^(?:o|◆|➔|[①-⑳])\s/.test(line) ? ' l1' : /^[-·*※]\s*[^\s-]/.test(line) ? ' l2' : '';
      return `<div class="src-line${level}">${richText(line)}</div>`;
    })
    .join('');
}

type Cell = { text: string; col: number; colspan: number; rowspan: number };
/** 옆 칸 · 아래 칸의 같은 글을 합친다. 아래로는 왼쪽 이름 칸끼리만(값이 우연히 같은 칸은 합치지 않음). */
function merge(rows: string[][], headRows: boolean): Cell[][] {
  const taken = rows.map((r) => r.map(() => false));
  return rows.map((row, r) => {
    const out: Cell[] = [];
    let labels = true; // 왼쪽부터 여기까지 모두 아래로 이어진 칸인가
    for (let c = 0; c < row.length; c++) {
      if (taken[r]![c]) continue;
      const text = row[c]!;
      let colspan = 1;
      while (text && c + colspan < row.length && !taken[r]![c + colspan] && same(row[c + colspan]!, text)) colspan++;
      let rowspan = 1;
      const whole = colspan === row.length;
      while (text && !whole && labels && (headRows || c + colspan < row.length) && r + rowspan < rows.length) {
        const next = rows[r + rowspan]!;
        const match = Array.from({ length: colspan }, (_, i) => same(next[c + i]!, text)).every(Boolean);
        // 아래 줄에서 더 넓게 합쳐진 칸이면 모양이 어긋나므로 합치지 않는다
        if (!match || (next[c + colspan] !== undefined && same(next[c + colspan]!, text))) break;
        rowspan++;
      }
      if (rowspan === 1) labels = false;
      for (let y = 0; y < rowspan; y++) for (let x = 0; x < colspan; x++) taken[r + y]![c + x] = true;
      out.push({ text, col: c, colspan, rowspan });
    }
    return out;
  });
}

function tableHTML(rawRows: string[][], caption: { title: string; head: string[]; note: string } | null): string {
  let rows = rawRows.filter((row) => !row.every((c) => RULE_CELL.test(c)));
  const width = Math.max(...rows.map((r) => r.length), caption?.head.length ?? 0);
  const labelSplit = Boolean(caption?.head.length && caption.head.length < width); // 「구 분」이 두 칸으로 나뉜 표
  // 짧은 줄은 합쳐진 칸이 빠진 것: 이름 칸이 나뉜 표면 첫 칸, 아니면 마지막 칸을 넓힌다
  const pad = (row: string[], first: boolean) =>
    row.length >= width || !row.length
      ? row
      : first
        ? [...Array<string>(width - row.length).fill(row[0]!), ...row]
        : [...row, ...Array<string>(width - row.length).fill(row[row.length - 1]!)];
  rows = rows.map((row) => pad(row, labelSplit));
  const firstIsHead = caption?.head.length
    ? caption.head.every((h) => rows[0]!.some((c) => same(c, h)))
    : !/이어지/.test(caption?.note ?? '');
  let head: string[][] = [];
  if (firstIsHead && rows.length > 1) {
    // 둘째 줄의 첫 칸까지 같으면 두 줄짜리 머리(「대응단계」 / 초기대응 · 확산대응 › 산불 1단계 · 2단계)
    let n = 1;
    while (n < rows.length - 1 && rows[0]![0] && same(rows[n]![0]!, rows[0]![0]!)) n++;
    head = rows.slice(0, n);
    rows = rows.slice(n);
  } else if (!firstIsHead && caption?.head.length) head = [pad(caption.head, true)];
  const tr = (cells: Cell[], tag: 'th' | 'td') =>
    '<tr>' +
    cells
      .map((c) => {
        const span = (c.colspan > 1 ? ` colspan="${c.colspan}"` : '') + (c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : '');
        const label = tag === 'td' && c.col === 0 && c.colspan < width ? ' class="src-label"' : '';
        return `<${tag}${span}${label}>${linesHTML(c.text)}</${tag}>`;
      })
      .join('') +
    '</tr>';
  return (
    (caption?.title || caption?.note
      ? `<div class="src-caption">${richText(caption.title)}${caption.note ? `<span class="src-note">${richText(caption.note)}</span>` : ''}</div>`
      : '') +
    `<div class="source-table" tabindex="0" role="region" aria-label="원문 표"><table class="grid${width > 3 ? ' wide' : ''}">` +
    (head.length ? `<thead>${merge(head, true).map((c) => tr(c, 'th')).join('')}</thead>` : '') +
    `<tbody>${merge(rows, false).map((c) => tr(c, 'td')).join('')}</tbody></table></div>`
  );
}

/** 별표를 펼친 「구분: 공중진화자원 / 초기 대응: … / 확산 대응 1단계: …」 줄 → [이름, 값] 짝(아니면 null) */
function pairsOf(line: string): [string, string][] | null {
  if (!/^(?:구\s?분|분야):\s/.test(line)) return null;
  const pairs = line.split(/\s\/\s/).map((part): [string, string] => {
    const m = /^([^:*]{1,20}):\s*([\s\S]*)$/.exec(part);
    return m ? [m[1]!.trim(), m[2]!.trim()] : ['', part.trim()];
  });
  return pairs.length > 1 ? pairs : null;
}
function pairTableHTML(lines: [string, string][][]): string {
  const head: string[] = [];
  for (const pairs of lines) for (const [k] of pairs) if (k && !head.includes(k)) head.push(k);
  // 이름 없는 값(「* 대상기관: …」)은 그 줄의 나머지 칸을 모두 쓴다
  const rows = lines.map((pairs) => {
    const rest = pairs.find(([k]) => !k);
    return head.map((h, i) => (rest && i > 0 ? rest[1] : (pairs.find(([k]) => k === h)?.[1] ?? '')));
  });
  return tableHTML([head, ...rows], null);
}

/** 출처 창 원문 HTML. 서버 글의 태그는 모두 글자로 보인다(richText). */
export function sourceHTML(value: unknown): string {
  const lines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n');
  let html = '';
  for (let i = 0; i < lines.length; ) {
    const caption = captionOf(lines[i]!);
    const at = caption ? i + 1 : i;
    let end = at;
    while (end < lines.length && TABLE_LINE.test(lines[end]!) && rowCells(lines[end]!).length > 1) end++;
    if (end - at >= 2 || (caption && end > at)) {
      // 바로 윗줄이 같은 제목(「3 본부장 책임과 역할」)이면 표 이름을 또 쓰지 않는다
      const above = (lines[i - 1] ?? '').replace(/\s+/g, '');
      const repeated = caption && above.endsWith(caption.title.replace(/\s+/g, ''));
      html += tableHTML(lines.slice(at, end).map(rowCells), repeated ? { ...caption, title: '' } : caption);
      i = end;
      continue;
    }
    const pairs: [string, string][][] = [];
    while (i + pairs.length < lines.length) {
      const p = pairsOf(lines[i + pairs.length]!);
      if (!p) break;
      pairs.push(p);
    }
    if (pairs.length) {
      html += pairTableHTML(pairs);
      i += pairs.length;
      continue;
    }
    html += linesHTML(lines[i]!);
    i++;
  }
  return html;
}
