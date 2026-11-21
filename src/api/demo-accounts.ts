export interface DemoEnvironment {
  [key: string]: unknown;
  VITE_DEMO_ACCOUNTS?: string;
  VITE_DEMO_PASSWORD?: string;
}
const DEMO_IDS = {
  reporter: 'demo_rep', admin: 'demo_admin', commander: 'demo_cmd', viewer: 'demo_view',
} as const;

const demoEnabled = (env: DemoEnvironment) => env.VITE_DEMO_ACCOUNTS?.trim().toLowerCase() === 'true';
const demoPassword = (env: DemoEnvironment) => typeof env.VITE_DEMO_PASSWORD === 'string' && env.VITE_DEMO_PASSWORD.trim() ? env.VITE_DEMO_PASSWORD : null;

/** Explicit demo mode must not silently look like broken role selection. No secrets in the message. */
export function demoAccountError(env: DemoEnvironment): string {
  return demoEnabled(env) && !demoPassword(env)
    ? '시연 계정 자동 입력 설정이 완료되지 않았습니다. 계정 정보를 직접 입력해 주세요.'
    : '';
}

/** Public presentation accounts only; this never grants an authenticated role. */
export function demoAccount(env: DemoEnvironment, role: string) {
  const password = demoPassword(env);
  if (!demoEnabled(env) || !password || !Object.hasOwn(DEMO_IDS, role)) return null;
  return { loginId: DEMO_IDS[role as keyof typeof DEMO_IDS], password };
}
