import test from 'node:test';
import assert from 'node:assert/strict';
import { overviewOfficialStage, overviewCoordinates } from '../src/api/screen/incident-overview.ts';
import { incidentDetailsView } from '../src/api/screen/incidents.ts';
import { createFixtures } from '../src/api/mock/fixtures.ts';

test('explicit official stage has three labels and one missing state', () => {
  for(const [code,label] of [['INITIAL','초기'],['STAGE1','1단계'],['STAGE2','2단계'],['초기대응','초기']])
    assert.equal(overviewOfficialStage(code),label);
  for(const code of [null,undefined,'','UNKNOWN','정보 미제공'])
    assert.equal(overviewOfficialStage(code),'정보 미제공');
});
test('HTTP current_stage never becomes an official stage or mutates server facts', () => {
  for(const code of ['INITIAL','STAGE1','STAGE2',null,'UNKNOWN']) {
    const raw={...createFixtures()['INC-03'],current_stage:code};
    const before=structuredClone(raw),view=incidentDetailsView(raw,[]);
    assert.equal(overviewOfficialStage(view.official_stage),'정보 미제공');
    assert.equal(view.alert_level,'정보 미제공');
    assert.deepEqual(raw,before);
  }
});
test('GeoJSON coordinates preserve precision, signs, zero and original order', () => {
  for(const [point,label] of [
    [[128.61217,36.37119],'위도 36.37119° N · 경도 128.61217° E'],
    [[-128.61217123,-36.37119876],'위도 36.37119876° S · 경도 128.61217123° W'],
    [[0,0],'위도 0° N · 경도 0° E'],
    [[180,-90],'위도 90° S · 경도 180° E'],
  ]) {
    const before=structuredClone(point);
    assert.equal(overviewCoordinates(point),label);
    assert.deepEqual(point,before);
  }
});
test('absent, nonnumeric, nonfinite or out-of-range coordinates never become a point', () => {
  for(const point of [null,undefined,[],[128],[null,36],['128',36],[NaN,36],[128,Infinity],[181,0],[0,91]])
    assert.equal(overviewCoordinates(point),'위도·경도 정보 미제공');
});
