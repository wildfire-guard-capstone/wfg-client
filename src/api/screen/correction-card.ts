/** 상황 정정 확인 카드의 줄(2026-11-25): 서버 값(false · true · deployed)을 우리말로 보인다. */
import type { CorrectionChange } from '../contracts.ts';

const VILLAGE: Record<string, string> = {
  evacuated: '대피 완료',
  evac_order: '대피명령',
  pre_evac_done: '사전대피 완료',
};
const GROUP_ORDER = ['helicopter', 'vehicle', 'crew'];
const yesNo = (value: unknown) => (value ? '예' : '아니오');
const isTotal = (change: CorrectionChange) => change.target === 'deployed' && change.item.endsWith('.total');

/** 마을 → 재난문자 → 헬기 · 차량 · 인력(기관 먼저, 합계 나중). 그 밖의 순서는 서버 그대로. */
function rank(change: CorrectionChange): number {
  if (change.target === 'village') return 0;
  if (change.target !== 'deployed') return 1;
  return 2 + GROUP_ORDER.indexOf(change.item.split('.')[0]!) * 2 + (isTotal(change) ? 1 : 0);
}

function row(change: CorrectionChange): string[] {
  if (change.target === 'village')
    return [
      change.target_name || change.target_id,
      VILLAGE[change.item] ?? change.item,
      yesNo(change.before),
      yesNo(change.after),
    ];
  if (change.target === 'deployed') {
    // 서버 이름표 「투입 헬기(산림청) 0 → 3대」에서 종류 · 기관 · 단위를 읽는다
    const m = /^(투입 [^()]+)\(([^()]+)\).*→\s*[\d,]+\s*(\D*)$/.exec(change.label);
    return m
      ? [m[1]!, m[2]!, `${change.before}${m[3]}`, `${change.after}${m[3]}`]
      : ['투입 자원', change.label || change.item, String(change.before), String(change.after)];
  }
  return ['재난문자', '송출', yesNo(change.before), yesNo(change.after)];
}

export function correctionCard(changes: CorrectionChange[]): { rows: string[][]; count: number } {
  return {
    rows: changes.slice().sort((a, b) => rank(a) - rank(b)).map(row),
    // 합계 줄은 기관 줄에서 따라 나온 것이라 「해석한 변화」로 세지 않는다
    count: changes.filter((c) => !isTotal(c)).length,
  };
}
