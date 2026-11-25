import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceHTML } from '../src/api/screen/source-text.ts';
const count = (html, re) => (html.match(re) || []).length;

test('출처 원문: 합쳐진 머리 칸 · 왼쪽 이름 칸을 합쳐 표로 그린다', () => {
  const html = sourceHTML(
    '<산불재난 주민대피 5단계 및 기준>\n| 대피단계 | 준비 | 실행 대기 (Set) | 실행 대기 (Set) |\n| 위험기준 | 조기주의 | 8시간 | 8시간 |\n| 단계구분 | 1 | 2 | 3 |\n| 단계구분 | 마음 준비 | 대피 준비 | 사전 대피 |\n※ 안내',
  );
  assert.match(html, /<th colspan="2"><div class="src-line">실행 대기 \(Set\)/);
  assert.match(html, /<td rowspan="2" class="src-label"><div class="src-line">단계구분/);
  assert.match(html, /<td colspan="2"><div class="src-line">8시간/);
  assert.equal(count(html, /<thead>/g), 1);
  assert.match(html, /&lt;산불재난 주민대피 5단계 및 기준&gt;/);
  assert.match(html, /src-line l2">※ 안내/);
  assert.doesNotMatch(html, /원문을 보존|\|/);
});

test('출처 원문: 이어지는 표는 앞줄에 적힌 머리를 쓰고, 나뉜 이름 칸은 짧은 줄을 넓힌다', () => {
  const html = sourceHTML(
    '<표: 3) 심각(Red) 가) 징후와 기관별 임무 및 역할 — p.93에서 이어지는 표(구 분 | 임무 및 역할)>\n| 경찰청 | o 교통통제<br>- 즉시 통제 |\n| 실무기관 | 지방자치단체 | o 지역대책본부 가동 |',
  );
  assert.match(html, /<th colspan="2"><div class="src-line">구 분/);
  assert.match(html, /<td colspan="2" class="src-label"><div class="src-line">경찰청/);
  assert.match(html, /src-line l1">o 교통통제<\/div><div class="src-line l2">- 즉시 통제/);
  assert.match(html, /src-note">p\.93에서 이어지는 표</);
  assert.equal(count(html, /<tr>/g), 3);
});

test('출처 원문: 두 줄 머리 · 마지막 칸이 합쳐진 줄', () => {
  const html = sourceHTML(
    '| 대응단계 | 초기대응 | 확산대응 | 확산대응 |\n| 대응단계 | 초기대응 | 1단계 | 2단계 |\n| 지휘권자 | 시장 | 시장 | 도지사 |\n| 지휘권자 | ① 둘 이상 시·군 ② 둘 이상 시·도 |',
  );
  assert.match(html, /<th rowspan="2"><div class="src-line">대응단계/);
  assert.match(html, /<th rowspan="2"><div class="src-line">초기대응/);
  assert.match(html, /<td colspan="3"><div class="src-line l1">① 둘 이상 시·군<\/div><div class="src-line l1">② /);
});

test('출처 원문: 값이 우연히 같은 아래 칸은 합치지 않는다', () => {
  const html = sourceHTML('| 구분 | 값 | 비고 |\n| 가 | 10 | x |\n| 나 | 10 | x |');
  assert.doesNotMatch(html, /rowspan/);
  assert.equal(count(html, /<td/g), 6);
});

test('출처 원문: 윗줄과 같은 표 이름은 되풀이하지 않는다', () => {
  const html = sourceHTML('3 본부장 책임과 역할\n<표: 본부장 책임과 역할>\n| 단계별 | 책임과 역할 |\n| 대응 | o 파악 |');
  assert.equal(count(html, /본부장 책임과 역할/g), 1);
});

test('출처 원문: 한 줄로 이어진 별표는 줄로, 「구분: … / …」 줄은 표로', () => {
  const lines = sourceHTML(
    '[별표 1] 조치사항 2단계 / 확산 > □ 동원 진화자원\no 산림청(헬기, 차량) o 소방관서 진화자원 <진화기관> o 국방부',
  );
  assert.equal(count(lines, /src-line l1/g), 3);
  assert.match(lines, /\[별표 1\] 조치사항 2단계 \/ 확산 &gt; □ 동원 진화자원/);
  const table = sourceHTML(
    '구분: 공중진화자원 / 초기 대응: o 반경 50㎞ / 확산 대응 1단계: o 반경 100㎞\n구분: 공중진화자원 / * 대상기관: 산림청, 소방청',
  );
  assert.match(table, /<th><div class="src-line">초기 대응/);
  assert.match(table, /<td rowspan="2" class="src-label">/);
  assert.match(table, /<td colspan="2"><div class="src-line l2">\* 대상기관/);
});

test('출처 원문: 서버 글의 태그는 실행되지 않고, 표가 아닌 글은 그대로 남는다', () => {
  const html = sourceHTML(
    '| 구분 | 내용 |\n| <img src=x onerror=alert(1)> | <script>x</script> |\n일반 A | B 문장',
  );
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /일반 A \| B 문장/);
});
