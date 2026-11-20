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
