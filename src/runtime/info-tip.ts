import { riskVarDescription } from '../api/screen/risk-descriptions';

/**
 * 요소별 지표의 ⓘ 말풍선(11/25). 마우스를 올리면(또는 키보드로 고르면) 변수 설명이 작게 뜨고,
 * 떼면 사라진다. 모달이 스크롤 영역이라 말풍선은 body에 하나만 두고 화면 좌표(fixed)로 띄운다.
 */
const escapeHTML = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** 변수 이름 옆 ⓘ. 설명이 없는 변수는 빈 글 */
export function riskInfoHTML(key: string, name: string): string {
  const text = riskVarDescription(key);
  if (!text) return '';
  return `<span class="rv-info" tabindex="0" role="button" aria-label="${escapeHTML(name)} 설명" data-tip="${escapeHTML(text)}">ⓘ</span>`;
}

let bound = false;
export function bindInfoTips(doc: Document = document): void {
  if (bound) return;
  bound = true;
  const tip = doc.createElement('div');
  tip.className = 'rv-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  doc.body.appendChild(tip);
  const show = (el: HTMLElement) => {
    tip.textContent = el.dataset.tip ?? '';
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
    const left = Math.max(8, Math.min(r.left, vw - w - 8));
    const below = r.bottom + 6;
    tip.style.left = `${left}px`;
    tip.style.top = `${below + h > vh - 8 ? Math.max(8, r.top - h - 6) : below}px`;
  };
  const hide = () => {
    tip.hidden = true;
  };
  const target = (e: Event) =>
    e.target instanceof Element ? e.target.closest<HTMLElement>('.rv-info') : null;
  doc.addEventListener('mouseover', (e) => {
    const el = target(e);
    if (el) show(el);
  });
  doc.addEventListener('mouseout', (e) => {
    if (target(e)) hide();
  });
  doc.addEventListener('focusin', (e) => {
    const el = target(e);
    if (el) show(el);
  });
  doc.addEventListener('focusout', (e) => {
    if (target(e)) hide();
  });
  doc.addEventListener('scroll', hide, true); // 모달을 스크롤하면 자리가 어긋나므로 닫는다
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
}
