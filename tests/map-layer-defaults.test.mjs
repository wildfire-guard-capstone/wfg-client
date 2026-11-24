import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

function buttons(text) {
  const source=ts.createSourceFile('toolbar.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const result={};
  function visit(n) {
    if(ts.isJsxOpeningElement(n)&&n.tagName.getText(source)==='button') {
      const attrs=Object.fromEntries(n.attributes.properties.filter(ts.isJsxAttribute).map(p=>[p.name.getText(source),p.initializer?.text]));
      if(attrs['data-layer']) result[attrs['data-layer']]=!attrs.className.split(' ').includes('off');
    }
    ts.forEachChild(n,visit);
  }
  visit(source);return result;
}
test('QA-MAP-01: only water and routes change; rail remains OFF and all other defaults remain main values',()=>{
  const current=readFileSync(new URL('../src/components/MapToolbar.tsx',import.meta.url),'utf8');
  const baseline=execFileSync('git',['show','HEAD:src/components/MapToolbar.tsx'],{encoding:'utf8'});
  const expected={fire:true,risk:true,villages:true,houses:false,care:true,heritage:true,shelters:true,water:false,power:true,agencies:true,roads:true,rail:false,routes:false};
  assert.deepEqual(buttons(current),expected);
  const normalized=current.replace(/className="blue lyr-btn off"(\s+data-layer="(?:water|routes)")/g,'className="blue lyr-btn"$1')
    .replace(/\{'(\d)배속'\}/g,"{'$1×'}"); // QA 3-6: 재생 속도를 쉬운 말로(2× → 2배속)
  const baselineNormalized=baseline.replace(/className="blue lyr-btn off"(\s+data-layer="(?:water|routes)")/g,'className="blue lyr-btn"$1')
    .replace(/\{'(\d)배속'\}/g,"{'$1×'}"); // QA 3-6: 재생 속도를 쉬운 말로(2× → 2배속)
  assert.equal(normalized,baselineNormalized,'No label, style, event or other toolbar changes');
});
