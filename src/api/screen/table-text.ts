/** Parse only explicit table syntax. Never infer merged cells or PDF header hierarchy. */
export type TextPart =
  | { type: 'text'; text: string }
  | { type: 'unresolved'; text: string }
  | {
      type: 'table';
      format: 'markdown' | 'pipe';
      head?: string[];
      rows: string[][];
    };

function cells(line: string): string[] | null {
  const source = line.trim();
  const out: string[] = [];
  let value = '',
    code = 0,
    separators = 0;
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (c === '\\' && i + 1 < source.length) {
      const next = source[++i]!;
      value += next === '|' ? '|' : c + next;
    } else if (c === '`') {
      let n = 1;
      while (source[i + 1] === '`') {
        n++;
        i++;
      }
      code = code === n ? 0 : code === 0 ? n : code;
      value += '`'.repeat(n);
    } else if (c === '|' && !code) {
      out.push(value.trim());
      value = '';
      separators++;
    } else value += c;
  }
  if (!separators || code) return null;
  out.push(value.trim());
  if (source.startsWith('|')) out.shift();
  if (source.endsWith('|') && out[out.length - 1] === '') out.pop();
  return out.length >= 1 ? out : null;
}
const bounded = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const separator = (row: string[] | null) =>
  row?.every((c) => /^:?-{3,}:?$/.test(c)) ?? false;

export function tableText(value: unknown): TextPart[] {
  const lines = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const parts: TextPart[] = [];
  let pending: string[] = [],
    fence = '';
  const flush = () => {
    if (pending.length) parts.push({ type: 'text', text: pending.join('\n') });
    pending = [];
  };
  for (let i = 0; i < lines.length;) {
    const line = lines[i]!;
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (marker || fence) {
      pending.push(line);
      i++;
      if (!fence) fence = marker!;
      else if (
        marker &&
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        /^\s*(`+|~+)\s*$/.test(line)
      )
        fence = '';
      continue;
    }
    if (/^(?: {4}|\t)/.test(line)) {
      pending.push(line);
      i++;
      continue;
    }
    const head = cells(line),
      rule = cells(lines[i + 1] ?? '');
    const markdown =
      !!head && !!rule && separator(rule) && head.length === rule.length;
    if (!head || (!markdown && (!bounded(line) || head.length < 2))) {
      pending.push(line);
      i++;
      continue;
    }
    let end = i + (markdown ? 2 : 1);
    const rows: string[][] = markdown ? [] : [head];
    while (end < lines.length) {
      const row = cells(lines[end]!);
      if (!row || (!markdown && !bounded(lines[end]!))) break;
      rows.push(row);
      end++;
    }
    const context = lines.slice(Math.max(0, i - 4), i).join('\n');
    if (
      !markdown &&
      rows.length < 2 &&
      !/<표|이어지|이어짐|병합/.test(context)
    ) {
      pending.push(line);
      i++;
      continue;
    }
    const rectangular = rows.every((row) => row.length === head.length);
    const ambiguous =
      !markdown &&
      (/이어지|이어짐|병합|계속되는|누락된/.test(context) ||
        new Set(head.filter(Boolean)).size !== head.length ||
        rows.some((row) => row.some((c) => !c)) ||
        rows.some((row) => separator(row)));
    flush();
    if (!rectangular || ambiguous)
      parts.push({ type: 'unresolved', text: lines.slice(i, end).join('\n') });
    else
      parts.push({
        type: 'table',
        format: markdown ? 'markdown' : 'pipe',
        ...(markdown ? { head } : {}),
        rows,
      });
    i = end;
  }
  flush();
  return parts;
}
