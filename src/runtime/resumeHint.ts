/**
 * 새로고침 뒤 세션 복원 중에는 로그인 화면을 잠깐 숨긴다.
 * 모듈을 불러오는 순간(첫 화면 그리기 전) 실행되어 로그인 화면이 깜빡이지 않게 한다.
 * 런타임이 개발 모드(StrictMode)에서 두 번 만들어져도, 마지막 복원이 끝날 때까지 숨김을 유지한다.
 */
const RESUME_CLASS = 'wfg-resuming';
const TOKEN_KEY = 'wfg-api-access-token';
let pending = 0;

function hasStoredToken() {
  try {
    return Boolean(globalThis.sessionStorage?.getItem(TOKEN_KEY));
  } catch {
    return false;
  }
}
function setHidden(hidden: boolean) {
  globalThis.document?.documentElement.classList.toggle(RESUME_CLASS, hidden);
}

if (hasStoredToken()) setHidden(true);

/** 복원을 시작할 때 부른다. 끝나면 반드시 endResumeHint()를 한 번 부른다. */
export function beginResumeHint() {
  pending++;
  if (hasStoredToken()) setHidden(true);
}
export function endResumeHint() {
  pending = Math.max(0, pending - 1);
  if (pending === 0) setHidden(false);
}
