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
test('original components, CSS, map models and scenario stay byte-identical to main', () => {
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
      hash(readFileSync(new URL(file, root))),
      expected,
      `${file} must not change`,
    );
});
test('original map setup, layer styles, markers and drawing functions stay identical to main', () => {
  const source = ts.createSourceFile(
    'runtime.ts',
    readFileSync(new URL('src/runtime/createMockRuntime.ts', root), 'utf8'),
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
  assert.deepEqual(
    markup,
    baseline.renderer_markup,
    'existing panel/modal/card structure changed',
  );
});
