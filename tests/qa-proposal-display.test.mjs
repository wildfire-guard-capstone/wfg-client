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
test('other items, other table columns, evidence and comparison paths retain complete cells',()=>{
  const dto=section('기관가, 기관나, 기관다, 기관라');
  for(const [id,options,comparison] of [['S1',{agencyPreview:true},undefined],['S6',{},undefined],['S6',{agencyPreview:true},{sections:dto,chunks:{},side:'after'}]])
    assert.doesNotMatch(sectionHTML(dto,{},id,comparison,options),/class="agency-more"/);
  dto[0].blocks[0].details[0].head[1]='다른 열';
  assert.doesNotMatch(sectionHTML(dto,{},'S6',undefined,{agencyPreview:true}),/class="agency-more"/);
});
