import test from 'node:test';
import assert from 'node:assert/strict';
import { correctionCard } from '../src/api/screen/correction-card.ts';
const deployed = (item, label, before, after) => ({ target: 'deployed', item, label, before, after });

test('정정 확인 카드: 마을 줄은 예 · 아니오로 보인다', () => {
  const card = correctionCard([
    { target: 'village', target_id: '19', target_name: '단촌면 구계리', item: 'evac_order', before: false, after: true, label: '단촌면 구계리 대피명령 예(전: 아니오)' },
    { target: 'village', target_id: '28', item: 'pre_evac_done', before: true, after: false, label: '' },
  ]);
  assert.deepEqual(card.rows, [
    ['단촌면 구계리', '대피명령', '아니오', '예'],
    ['28', '사전대피 완료', '예', '아니오'],
  ]);
  assert.equal(card.count, 2);
});

test('정정 확인 카드: 투입 자원은 종류 · 기관 · 단위로, 합계는 그 종류 끝에 두고 변화로 세지 않는다', () => {
  const card = correctionCard([
    deployed('crew.special_crew', '투입 인력(진화대) 0 → 40명', 0, 40),
    deployed('crew.total', '투입 인력(합계) 0 → 40명', 0, 40),
    deployed('helicopter.forest', '투입 헬기(산림청) 0 → 3대', 0, 3),
    deployed('helicopter.total', '투입 헬기(합계) 0 → 5대', 0, 5),
    deployed('helicopter.local', '투입 헬기(지자체) 0 → 2대', 0, 2),
    { target: 'situation', item: 'disaster_sms_sent', before: false, after: true, label: '재난문자 송출 예' },
  ]);
  assert.deepEqual(card.rows, [
    ['재난문자', '송출', '아니오', '예'],
    ['투입 헬기', '산림청', '0대', '3대'],
    ['투입 헬기', '지자체', '0대', '2대'],
    ['투입 헬기', '합계', '0대', '5대'],
    ['투입 인력', '진화대', '0명', '40명'],
    ['투입 인력', '합계', '0명', '40명'],
  ]);
  assert.equal(card.count, 4);
});

test('정정 확인 카드: 이름표를 읽지 못하면 서버 글을 그대로 보인다', () => {
  assert.deepEqual(correctionCard([deployed('helicopter.x', '모르는 이름표', 1, 2)]).rows, [
    ['투입 자원', '모르는 이름표', '1', '2'],
  ]);
});
