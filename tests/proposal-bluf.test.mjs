// 소제목 형식 제안서(서버 2026-11-24 BLUF, wfg-server feat/proposal-bluf-parts): 제안 → 현황 → 판단 근거 → 누락된 정보.
import assert from 'node:assert/strict';
import test from 'node:test';

const { sectionHTML, missingHTML } = await import('../src/api/screen/presentation.ts');
const { validateProposal } = await import('../src/api/screen/proposals.ts');

const SECTIONS = [
  {
    title: '',
    kind: 'facts',
    blocks: [
      { type: 'fact', step: 'situation', text: '신월리에 불이 닿았습니다.' },
      { type: 'fact', step: 'judgment', text: '송전선이 5시간 안 범위에 있습니다.' },
    ],
  },
  {
    title: '진화 우선지역·보호대상',
    kind: 'part',
    blocks: [
      { type: 'reason', text: '신월리에 불이 닿았으므로' },
      {
        type: 'paragraph',
        category: 'IMMEDIATE',
        body: '신월리부터 진화하십시오.',
        cite: '',
        quote: '',
        evidence: ['SM-1'],
        part: '진화 우선지역·보호대상',
      },
      {
        type: 'basis',
        sentences: [
          { kind: 'value', text: '신월리 128명.', evidence: [] },
          { kind: 'rule', text: '인명을 먼저 지킵니다.', evidence: ['SM-2'] },
        ],
      },
      { type: 'detail', show: true, blocks: [{ type: 'list', style: 'bullet', rows: [{ text: '① 인명: 신월리' }], caption: '진화 순서' }] },
    ],
  },
  {
    title: '시설 보호',
    kind: 'part',
    blocks: [
      { type: 'reason', text: '송전선이 5시간 안에 있으므로' },
      {
        type: 'paragraph',
        category: 'REQUEST',
        body: '한국전력공사 전류 차단 요청(S6)과 함께, 송전선 주변에 진화 인력을 배치하십시오.',
        cite: '',
        quote: '',
        evidence: ['SM-1'],
        part: '시설 보호',
      },
      { type: 'detail', show: false, blocks: [{ type: 'table', head: ['관련 기관', '대상'], rows: [['한국전력공사', '송전선']] }] },
    ],
  },
  { title: '', kind: 'notes', blocks: [{ type: 'note', text: '※ 군사시설 위치 정보가 없습니다.' }] },
];
const CHUNKS = { 'SM-1': 1, 'SM-2': 2 };

test('BLUF: 제안(펼침) 먼저, 소제목에 번호 없음, 핵심 판단 근거 「…므로,」, 현황 · 판단 근거는 접힘', () => {
  const html = sectionHTML(SECTIONS, CHUNKS, 'S2', undefined, { gatherNotes: true });
  const at = (s) => html.indexOf(s);
  assert.ok(html.includes('class="proposal-actions bluf fold open"') && html.includes('>제안</button>'));
  assert.ok(at('>제안</button>') < at('>현황</button>') && at('>현황</button>') < at('>판단 근거</button>'));
  assert.ok(html.includes('class="proposal-facts fold"') && html.includes('class="proposal-basis fold"'));
  assert.ok(html.includes('<b class="part-subtitle">진화 우선지역·보호대상</b>') && !/\d\.\s*진화 우선/.test(html));
  assert.ok(html.includes('신월리에 불이 닿았으므로,'));
  assert.ok(at('신월리에 불이 닿았으므로,') < at('신월리부터 진화하십시오.'));
  // 현황 = 상황 · 상태 · 파악 소제목 계층(없는 단계는 안 나옴)
  assert.ok(html.includes('<b class="part-subtitle">상황</b>') && html.includes('<b class="part-subtitle">파악</b>'));
  assert.ok(!html.includes('<b class="part-subtitle">상태</b>'));
  // 판단 근거: 문장마다 출처 번호(기준 문장만)
  assert.ok(html.includes('class="basis-sent"') && html.includes('인명을 먼저 지킵니다.'));
  // ※ 안내는 누락된 정보로 모으므로 섹션에는 없음
  assert.ok(!html.includes('군사시설'));
});

test('BLUF: 자세히 보기는 show가 true인 것만(제목 줄 포함), 다른 항목 언급은 문장 그대로', () => {
  const html = sectionHTML(SECTIONS, CHUNKS, 'S2', undefined, { gatherNotes: true });
  assert.equal(html.split('>자세히 보기</button>').length - 1, 1);
  assert.ok(html.includes('<div class="detail-cap">진화 순서</div>'));
  assert.ok(!html.includes('한국전력공사</td>')); // show false 표는 안 그림
  assert.ok(html.includes('한국전력공사 전류 차단 요청(S6)과 함께') && !html.includes('data-go'));
});

test('BLUF: 누락된 정보 = notes 섹션의 ※ 안내 + withheld', () => {
  const missing = missingHTML(SECTIONS, [{ field: '최대순간풍속', reason: '단기예보에 없음' }]);
  assert.ok(missing.includes('>누락된 정보</button>'));
  assert.ok(missing.includes('군사시설 위치 정보가 없습니다.') && !missing.includes('※'));
  assert.ok(missing.includes('<b>최대순간풍속</b> — 단기예보에 없음'));
});

test('BLUF: 버전 비교(fixed)는 모두 펼치고 show false 자세히 보기도 보인다', () => {
  const html = sectionHTML(SECTIONS, CHUNKS, 'S2', { sections: SECTIONS, chunks: CHUNKS, side: 'after' });
  assert.ok(html.includes('proposal-facts fold open') && html.includes('proposal-basis fold open') && !html.includes('fold-toggle'));
  assert.equal(html.split('class="prop-detail fold open"').length - 1, 2);
});

test('BLUF: 검증기는 새 블록 · 섹션 종류를 받고, 모르는 종류는 막는다', () => {
  const item = (code, i, sections) => ({
    item_code: code,
    name: code,
    axis: i < 6 ? 'SUPPRESSION' : 'EVACUATION',
    state: 'GENERATED',
    categories: [],
    finding: '',
    withheld: [],
    change_type: null,
    sections,
    evidence: [{ chunk_id: 'SM-1' }],
  });
  const codes = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6'];
  const proposal = (sections) => ({ id: '9', prediction_id: '1', version: 'v1', items: codes.map((c, i) => item(c, i, sections)) });
  assert.ok(validateProposal(proposal(SECTIONS)));
  assert.throws(() => validateProposal(proposal([{ title: '', kind: 'other', blocks: [] }])));
  assert.throws(() => validateProposal(proposal([{ title: '', kind: 'part', blocks: [{ type: 'detail', show: 'yes', blocks: [] }] }])));
});

test('긴 이름 나열은 「앞 3개 등 N곳」 + 모두 보기, 짧은 나열 · 버전 비교는 그대로', async () => {
  const { shortenList } = await import('../src/api/screen/presentation.ts');
  const names = ['일직119지역대(안동소방서)', '의성소방서-군위-119 안전센터', '안동소방서-안동_옥동-119 안전센터', '안동소방서', '구미소방서', '상주소방서-화서(신설)-119 안전센터'];
  const body = names.join(', ') + '에 송전선 인근 구간 보호를 위한 진화인력 배치를 요청하십시오.';
  const s = shortenList(body);
  assert.equal(s.text, '일직119지역대(안동소방서), 의성소방서-군위-119 안전센터, 안동소방서-안동_옥동-119 안전센터 등 6곳에 송전선 인근 구간 보호를 위한 진화인력 배치를 요청하십시오.');
  assert.deepEqual(s.names, names);
  assert.equal(shortenList('A소방서, B소방서, C소방서, D소방서, E소방서에 요청하십시오.'), null); // 5곳은 그대로
  const sections = [{ title: '', kind: 'part', blocks: [{ type: 'paragraph', category: 'REQUEST', body, cite: '', quote: '', evidence: ['SM-1'] }] }];
  const html = sectionHTML(sections, { 'SM-1': 3 }, 'S2');
  assert.ok(html.includes('등 6곳에 송전선') && html.includes('class="list-toggle"') && html.includes('▸ 6곳 모두 보기'));
  assert.ok(html.includes('<div class="list-all" hidden>') && html.includes('구미소방서'));
  const fixed = sectionHTML(sections, { 'SM-1': 3 }, 'S2', { sections, chunks: { 'SM-1': 3 }, side: 'after' });
  assert.ok(!fixed.includes('list-toggle') && fixed.includes('구미소방서, 상주소방서'));
});
