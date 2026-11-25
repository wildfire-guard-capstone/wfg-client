import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const baseline = JSON.parse(
  readFileSync(
    new URL('./fixtures/ui-main-c3dfe0d.json', import.meta.url),
    'utf8',
  ),
);
const root = new URL('../', import.meta.url),
  hash = (value) => createHash('sha256').update(value).digest('hex');
test('original components, CSS, map models and scenario data stay unchanged outside approved P0/P1/P2 hooks', () => {
  // Only these two existing files may change for approved API data hooks and
  // nullable response types. The rendering/map functions are guarded below.
  const dataOnlyFiles = new Set([
    'src/runtime/createMockRuntime.ts',
    'src/types/domain.ts',
  ]);
  for (const [file, expected] of Object.entries(baseline.exact_files).filter(
    ([file]) => !dataOnlyFiles.has(file),
  ))
    assert.equal(
      hash(file === 'src/types/scenario.ts'
        ? readFileSync(new URL(file, root), 'utf8').replace(
            '    /** HTTP evacuation facts keyed by village ID; absent is unknown. */\n    evacuated_by_id?: Record<string, boolean>;\n', '',
          )
        : file === 'src/components/MapStage.tsx'
          ? readFileSync(new URL(file, root), 'utf8').replace('\n      <div id="map-data-state" role="status" hidden></div>', '')
          : file === 'src/components/ReporterPanel.tsx'
          ? readFileSync(new URL(file, root), 'utf8')
            // 그리기 완료: React의 disabled prop이 클릭을 막아 제거. 활성화 여부는 renderReporter가 DOM으로 관리한다.
            .replace(`<button id="rep-draw-done" onClick`, `<button id="rep-draw-done" disabled onClick`)
            .replace(`\n        <label className="p1-observed">{'화선 관측시각 (실제 측정 시각)'}<input id="rep-observed" type="datetime-local" /></label>`, '')
            // QA 2-1: 산불명은 서버가 만들고 입력받지 않아 칸을 뺐다. 화면은 발생 장소로 산불을 가리킨다.
            // QA 2-4: 신고 기관명·신고자 성명 중 하나 필수 안내.
            .replace(`{' 신고자 정보 (기관명·성명 중 하나 필수) '}`, `{' 신고자 정보 '}`)
            .replace(`<div className="form">\n          <label className="w">\n            {'발생 장소(주소) *'}`, `<div className="form">\n          <label className="w">\n            {'산불명 *'}\n            <input id="rep-name" />\n          </label>\n          <label className="w">\n            {'발생 장소(주소) *'}`)
          : file === 'src/runtime/MockRuntimeProvider.tsx'
            ? readFileSync(new URL(file, root), 'utf8')
              .replace("  useEffect,\n", '')
              .replace("import { browserSessionStorage } from '../api/auth-session';\n", '')
              .replace(/  useEffect\(\(\) => \{[\s\S]*?  \}, \[\]\);\n/, '')
              .replace(/    const root = document.getElementById\('root'\)!;[\s\S]*?    const runtime = createMockRuntime\(\);/, '    const runtime = createMockRuntime();')
              .replace(/    void runtime.ready.finally\(\(\) => \{[\s\S]*?    \}\);\n/, '')
              .replace("      active = false;\n      if (restoring) { root.style.visibility = previousVisibility; root.removeAttribute('aria-busy'); }\n", '')
          : file === 'src/components/LoginScreen.tsx'
            ? readFileSync(new URL(file, root), 'utf8')
              .replace("import { demoAccount } from '../api/demo-accounts';\n", '')
              .replace("  const demo = demoAccount(import.meta.env, 'commander');\n  const legacy = !import.meta.env.VITE_API_MODE;\n", '')
              .replace("defaultValue={demo?.loginId ?? (legacy ? 'cmd01' : '')}", 'defaultValue="cmd01"')
              .replace("defaultValue={demo?.password ?? (legacy ? '1234' : '')}", 'defaultValue="1234"')
          : file === 'src/components/IncidentPanel.tsx'
            ? readFileSync(new URL(file, root), 'utf8')
              .replace("          <details id=\"hist-box\">\n            <summary>{'제안서 버전 이력'}</summary>\n            <div id=\"hist-runs\"></div>\n          </details>\n", '')
              .replace("<div id=\"prop-summary\" style={{ display: 'none' }}></div>", "<div id=\"prop-summary\"></div>\n          <details id=\"hist-box\">\n            <summary>{'제안서 버전 이력'}</summary>\n            <div id=\"hist-runs\"></div>\n          </details>")
              .replace("<div id=\"prop-meta\" style={{ display: 'none' }}>", '<div id="prop-meta">')
              .replace("{'진화'}", "{'진화 (S1~S7)'}")
              .replace("{'대피'}", "{'대피 (E1~E7)'}")
          : file === 'src/components/MapToolbar.tsx'
            ? readFileSync(new URL(file, root), 'utf8')
              .replace(/className="blue lyr-btn off"(\s+data-layer="(?:water|routes)")/g, 'className="blue lyr-btn"$1')
            // QA 3-6: 재생 속도를 쉬운 말로(2× → 2배속)
            .replace(/\{'(\d)배속'\}/g, "{'$1×'}")
            // 11/25: 마을 아이콘을 행정리 아이콘으로 바꿨다
            .replace('title="행정리(화선이 닿으면 빨강)"', 'title="마을(화선이 닿으면 빨강)"')
            .replace("{'행정리'}", "{'마을'}")
          : file === 'src/main.tsx'
            ? readFileSync(new URL(file, root), 'utf8').replace("import './styles/stabilization.css';\n", '')
            : readFileSync(new URL(file, root))),
      expected,
      `${file} must not change`,
    );
});
test('original map setup, layer styles, markers and drawing functions stay identical to main', () => {
  const source = ts.createSourceFile(
    'runtime.ts',
    // Normalize approved P0 text/count changes. Original CSS and map hashes plus
    // all renderers outside the explicit P1 state/text/report changes stay guarded.
    readFileSync(new URL('src/runtime/createMockRuntime.ts', root), 'utf8')
      .replace("${dataBridge ? '생성된 대응 제안이 없습니다.' : '확산 예측을 실행하면 제안이 생성됩니다.'}", '확산 예측을 실행하면 제안이 생성됩니다.')
      .replace('${state.axis} ${all.length}항목 중 발동', '${state.axis} 7항목 중 발동')
      // 11/25: 행정리 아이콘(h:)이 마을 아이콘의 화선 도달 표시 · 켜고 끄기를 이어받는다.
      .replace("      markAdminVillages(() => false);\n", '')
      .replace("    markAdminVillages((p) => t > 0 && inAny(p, t - 1));\n", '')
      .replace("show(apiMode ? 'h:' : 'v:', layerOn('villages'))", "show('v:', layerOn('villages'))")
      // 11/25: 출처 창 원문은 sourceHTML(매뉴얼 표 · 줄 나누기)로 그린다.
      .replace('`<div class="ev-highlight">${sourceHTML(c.text)}</div>` : sourceHTML(c.text)', '`<div class="ev-highlight">${contentHTML(c.text)}</div>` : contentHTML(c.text)')
      // P2 replaces the selected inline mark only with a block-safe highlight.
      .replace('`<div class="ev-highlight">${contentHTML(c.text)}</div>`', '`<mark>${contentHTML(c.text)}</mark>`'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const actual = {},
    markup = {};
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      if (name in baseline.map_functions)
        actual[name] = hash(node.getText(source));
      if (name in baseline.renderer_markup) {
        const pieces = [];
        function literals(n) {
          if (ts.isTemplateExpression(n))
            pieces.push(
              n.head.text,
              ...n.templateSpans.map((s) => s.literal.text),
            );
          else if (ts.isNoSubstitutionTemplateLiteral(n)) pieces.push(n.text);
          ts.forEachChild(n, literals);
        }
        literals(node);
        markup[name] = hash(JSON.stringify(pieces));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.deepEqual(
    actual,
    baseline.map_functions,
    'MapLibre/drawing implementation changed',
  );
  const approvedP1 = new Set(['renderProposal', 'renderReporter', 'renderResources', 'renderRiskPop', 'renderStatus']);
  assert.deepEqual(
    Object.fromEntries(Object.entries(markup).filter(([name])=>!approvedP1.has(name))),
    Object.fromEntries(Object.entries(baseline.renderer_markup).filter(([name])=>!approvedP1.has(name))),
    'existing panel/modal/card structure changed',
  );
});

test('auth restoration keeps the provider wrapper and original login design intact', () => {
  const provider = readFileSync(new URL('src/runtime/MockRuntimeProvider.tsx', root), 'utf8');
  assert.match(provider, /<RuntimeContext.Provider value=\{runtimeRef\}>\s*\{children\}\s*<\/RuntimeContext.Provider>/);
  assert.match(provider, /root.style.visibility = 'hidden'/);
});
