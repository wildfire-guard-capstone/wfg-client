import test from 'node:test';
import assert from 'node:assert/strict';
import { overviewOfficialStage, overviewStage, overviewCoordinates } from '../src/api/screen/incident-overview.ts';
import { incidentDetailsView } from '../src/api/screen/incidents.ts';
import { createFixtures } from '../src/api/mock/fixtures.ts';

test('explicit official stage has three labels and one missing state', () => {
  for(const [code,label] of [['INITIAL','초기'],['STAGE1','1단계'],['STAGE2','2단계'],['초기대응','초기']])
    assert.equal(overviewOfficialStage(code),label);
  for(const code of [null,undefined,'','UNKNOWN','정보 미제공'])
    assert.equal(overviewOfficialStage(code),'정보 미제공');
});
test('HTTP adapter leaves the legacy declared-stage field empty and never mutates server facts', () => {
  // 화면 '공식 단계'는 overviewStage(raw)로 그린다. 어댑터의 기존 데모 필드는 채우지 않는다.
  for(const code of ['INITIAL','STAGE1','STAGE2',null,'UNKNOWN']) {
    const raw={...createFixtures()['INC-03'],current_stage:code};
    const before=structuredClone(raw),view=incidentDetailsView(raw,[]);
    assert.equal(overviewOfficialStage(view.official_stage),'정보 미제공');
    assert.equal(view.alert_level,'정보 미제공');
    assert.deepEqual(raw,before);
  }
});
test('QA 3-1: before the first prediction current_stage is an unjudged default and shows 판정 전', () => {
  for(const code of ['INITIAL','STAGE1','STAGE2']) for(const needs of [true,false]) {
    const raw={...createFixtures()['INC-03'],current_stage:code,latest_prediction_id:null,needs_reprediction:needs};
    const before=structuredClone(raw);
    assert.deepEqual(overviewStage(raw),{text:'판정 전',state:'before',note:'확산 예측을 실행하면 판정됩니다'});
    assert.deepEqual(raw,before);
  }
  // 종료된 산불은 예측할 수 없으므로 실행 안내를 붙이지 않는다
  assert.deepEqual(overviewStage({...createFixtures()['INC-03'],status:'ENDED',latest_prediction_id:null}),{text:'판정 전',state:'before',note:''});
});
test('QA 3-1: after a prediction the rule-engine stage shows, marked when a newer perimeter needs re-prediction', () => {
  for(const [code,label] of [['INITIAL','초기'],['STAGE1','1단계'],['STAGE2','2단계']]) {
    const raw={...createFixtures()['INC-03'],current_stage:code,latest_prediction_id:'41',needs_reprediction:false};
    assert.deepEqual(overviewStage(raw),{text:label,state:'judged',note:''});
    assert.deepEqual(overviewStage({...raw,needs_reprediction:true}),{text:label,state:'judged',note:'(직전 예측 기준)'});
    assert.equal(overviewStage({...raw,status:'ENDED',needs_reprediction:true}).note,'(직전 예측 기준)');
  }
  assert.equal(overviewStage({...createFixtures()['INC-03'],current_stage:'UNKNOWN'}).text,'정보 미제공');
});
test('QA 3-1: a missing incident is missing information, not 판정 전', () => {
  for(const raw of [null,undefined]) assert.deepEqual(overviewStage(raw),{text:'정보 미제공',state:'missing',note:''});
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
