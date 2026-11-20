/**
 * 새로고침 뒤 세션 복원 중에는 로그인 화면을 잠깐 숨긴다.
 * 모듈을 불러오는 순간(첫 화면 그리기 전) 실행되어 로그인 화면이 깜빡이지 않게 한다.
 * 복원이 끝나면(성공·실패 모두) endResumeHint()로 원래대로 돌린다.
 */
const RESUME_CLASS = 'wfg-resuming';
const TOKEN_KEY = 'wfg-api-access-token';

try {
  if (globalThis.sessionStorage?.getItem(TOKEN_KEY))
    globalThis.document?.documentElement.classList.add(RESUME_CLASS);
} catch {
  /* storage blocked: nothing to resume */
}

export function endResumeHint() {
  globalThis.document?.documentElement.classList.remove(RESUME_CLASS);
}
