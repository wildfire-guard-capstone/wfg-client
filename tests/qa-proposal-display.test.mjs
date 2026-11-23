import test from 'node:test';
import assert from 'node:assert/strict';
import {sectionHTML} from '../src/api/screen/presentation.ts';

const section=(names)=>[{title:'제안',blocks:[{type:'paragraph',body:'협조 요청',evidence:[],details:[{
  type:'table',head:['구분','세부 대상(기관명)','임무'],rows:[['지원',names,'원래 임무']],
}]}]}];
test('agency cell previews the first three in server order, retaining the remaining names and DTO',()=>{
  const dto=section('기관가, 기관나, 기관다, 기관라, 기관마'),before=structuredClone(dto);
  const html=sectionHTML(dto,{},'S6',undefined,{agencyPreview:true});
  assert.match(html,/기관가<br>기관나<br>기관다<details/);
  assert.match(html,/외 2개 더 보기/);assert.match(html,/<div>기관라<br>기관마<\/div>/);
  assert.match(html,/<td>지원<\/td>/);assert.match(html,/<td>원래 임무<\/td>/);
  assert.deepEqual(dto,before);
});
test('three or fewer, missing and ambiguous prose keep the original rendering without a toggle',()=>{
  for(const value of ['', '정보 미제공','기관가, 기관나, 기관다','중앙상황실 또는 도상황실']) {
    const html=sectionHTML(section(value),{},'S6',undefined,{agencyPreview:true});
    assert.doesNotMatch(html,/class="agency-more"/);
  }
});
test('names with parenthesized commas and line breaks are safe; server tags never execute',()=>{
  const html=sectionHTML(section('기관가(구조, 구급)\n기관나<br>기관다, <img src=x onerror=bad()>'),{},'S6',undefined,{agencyPreview:true});
  assert.match(html,/외 1개 더 보기/);assert.match(html,/기관가\(구조, 구급\)/);
  assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);
});
test('comparison path retains complete cells; card tables of every item and column preview long lists (2026-11-24)',()=>{
  const dto=section('기관가, 기관나, 기관다, 기관라');
  // 버전 비교 화면은 모두 펼친다
  assert.doesNotMatch(sectionHTML(dto,{},'S6',{sections:dto,chunks:{},side:'after'},{agencyPreview:true}),/class="agency-more"/);
  // 카드 안 표는 항목 · 열과 상관없이 이름이 넷 이상이면 앞 3개 + 더 보기(사용자 「가독성」)
  for(const [id,options] of [['S1',{agencyPreview:true}],['S6',{}]])
    assert.match(sectionHTML(dto,{},id,undefined,options),/class="agency-more"/);
  dto[0].blocks[0].details[0].head[1]='다른 열';
  assert.match(sectionHTML(dto,{},'S3',undefined,{}),/기관가<br>기관나<br>기관다<details class="agency-more"/);
  assert.doesNotMatch(sectionHTML(section('기관가, 기관나, 기관다'),{},'S3',undefined,{}),/class="agency-more"/);
});
