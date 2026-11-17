import test from 'node:test';
import assert from 'node:assert/strict';
import * as presentation from '../src/api/screen/presentation.ts';
import { tableText } from '../src/api/screen/table-text.ts';
const render = presentation.contentHTML ?? presentation.richText;

test('P2 standard Markdown tables render without mistaking ordinary pipes for tables', () => {
  const html = render(
    '일반 A | B\n\n| 구분 | 내용 |\n| :--- | ---: |\n| 대분류 | 긴 셀<br>둘째 [1] |',
    'E6',
  );
  assert.match(html, /<table/);
  assert.match(
    render('| 단일 열 |\n| --- |\n| 실제 값 |'),
    /<td>실제 값<\/td>/,
  );
  assert.match(html, /<th>구분<\/th>/);
  assert.match(
    html,
    /<td>긴 셀<br>둘째 <span class="cite" data-b="E6" data-k="1">1<\/span><\/td>/,
  );
  assert.match(html, /일반 A \| B/);
  assert.equal((html.match(/<table/g) || []).length, 1);
});
test('P2 escaped pipes and code spans stay within a cell; fenced code never becomes a table', () => {
  const input = '키 | 값\n--- | ---\na\\|b | `c|d`';
  assert.deepEqual(tableText(input)[0].rows, [['a|b', '`c|d`']]);
  assert.doesNotMatch(
    render('```text\n| a | b |\n| --- | --- |\n| c | d |\n```'),
    /<table/,
  );
  for (const text of ['일반 | 문장', '`a | b`', '| 단일 | 문장 |'])
    assert.doesNotMatch(render(text), /<table/);
});
test('P2 unambiguous nonstandard pipes preserve explicit rows without inventing headers or merged cells', () => {
  const html = render('| 경찰 | 지원 [1] |\n| 소방 | 구조<br>구급 |', 'S1');
  assert.match(html, /data-table-format="pipe"/);
  assert.doesNotMatch(html, /<th[ >]|rowspan|colspan/);
  assert.equal((html.match(/<tr>/g) || []).length, 2);
  assert.match(html, /제목·병합 셀/);
});
test('P2 ambiguous PDF tables preserve original rows and explicitly state their limit', () => {
  for (const value of [
    '| 구분 | 확산 | 확산 |\n| 단계 | 1 | 2 |',
    '<표: p.93에서 이어지는 표>\n| 경찰 | 지원 |\n| 소방 | 구조 |',
    '| 구분 | 내용 |\n| A | B | C |',
    '| 구분 | 내용 |\n| | 내용 |',
  ]) {
    const html = render(value, 'S1');
    assert.doesNotMatch(html, /<table/);
    assert.match(html, /표 구조를 확정할 수 없어 원문/);
    assert.match(html, /\|/);
  }
});
test('P2 structured DTO and string-table comparisons preserve cells, citations and safe change emphasis', () => {
  const sections = (value) => [
    {
      title: '서버',
      blocks: [
        { type: 'table', head: ['구분', '내용'], rows: [['A', value]] },
        {
          type: 'note',
          text: '| 항목 | 값 |\n| --- | --- |\n| 설명 | ' + value + ' |',
        },
      ],
    },
  ];
  const before = {
      id: 'S6',
      text: '평탄화 금지',
      apiSections: sections('이전 [1]'),
      apiChunks: {},
    },
    after = { ...before, apiSections: sections('이후 [1]') };
  assert.equal(typeof presentation.comparisonHTML, 'function');
  const pair = presentation.comparisonHTML(before, after);
  for (const html of pair) {
    assert.equal((html.match(/<table/g) || []).length, 2);
    assert.match(html, /<td>/);
    assert.match(html, /class="cite"/);
  }
  assert.match(pair[0], /<del class="wd">이전<\/del>/);
  assert.match(pair[1], /<ins class="wd">이후<\/ins>/);
});
test('P2 all table text, headers, citations and raw fallbacks escape executable server HTML', () => {
  const payload =
    '<img src=x onerror="window.P2_XSS=true"><script>window.P2_XSS=true</script>';
  for (const source of [
    '| 구분 | 내용 |\n| --- | --- |\n| a | ' + payload + ' [1] |',
    '| a | b |\n| a | ' + payload + ' |',
    '<표: 이어지는 표>\n| a | ' + payload + ' |',
  ]) {
    const html = render(source, 'S1" onclick="bad');
    assert.doesNotMatch(html, /<img|<script|onclick="bad/);
    assert.match(html, /&lt;img/);
  }
});

test('P2 irregular Markdown rows and PDF empty cells never get padded or guessed', () => {
  const value = '| 구분 | 내용 |\n| --- | --- |\n| a | b | c |';
  const parts = tableText(value);
  assert.equal(parts[0].type, 'unresolved');
  assert.equal(parts[0].text, value);
  assert.doesNotMatch(render(value), /<table/);
  assert.doesNotMatch(
    render('    | a | b |\n    | --- | --- |\n    | c | d |'),
    /<table/,
  );
});
test('P2 long comparisons cap diff work while retaining all table rows and escaped content', () => {
  const block = (value) => ({
    id: 'E6',
    text: '',
    apiSections: [
      {
        title: '표',
        blocks: [
          {
            type: 'table',
            head: ['구분', '내용'],
            rows: [
              ['A', value],
              ['B', '실제 0'],
            ],
          },
        ],
      },
    ],
  });
  const [before, after] = presentation.comparisonHTML(
    block('이전 '.repeat(1200)),
    block('이후 '.repeat(1200)),
  );
  for (const html of [before, after]) {
    assert.equal((html.match(/<tr>/g) || []).length, 3);
    assert.match(html, /실제 0/);
  }
  assert.match(before, /<del/);
  assert.match(after, /<ins/);
});

test('P2 citations appended to a Markdown table stay outside its final row', () => {
  const html = presentation.sectionHTML(
    [
      {
        title: '표',
        blocks: [
          {
            type: 'paragraph',
            body: '| 항목 | 값 |\n| --- | --- |\n| 실제 | 0 |',
            evidence: ['chunk'],
          },
        ],
      },
    ],
    { chunk: 1 },
    'E6',
  );
  assert.equal((html.match(/<table/g) || []).length, 1);
  assert.match(html, /<td>0<\/td>/);
  assert.match(html, /<\/table><\/div><span class="cite"/);
  assert.doesNotMatch(html, /proposal-table-raw/);
});
