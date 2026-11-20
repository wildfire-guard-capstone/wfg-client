export interface DemoEnvironment {
  [key: string]: unknown;
  VITE_DEMO_ACCOUNTS?: string;
  VITE_DEMO_PASSWORD?: string;
}
const DEMO_IDS = {
  reporter: 'demo_rep', admin: 'demo_admin', commander: 'demo_cmd', viewer: 'demo_view',
} as const;

/** Public presentation accounts only; this never grants an authenticated role. */
export function demoAccount(env: DemoEnvironment, role: string) {
  if (env.VITE_DEMO_ACCOUNTS !== 'true' || !env.VITE_DEMO_PASSWORD || !Object.hasOwn(DEMO_IDS, role)) return null;
  return { loginId: DEMO_IDS[role as keyof typeof DEMO_IDS], password: env.VITE_DEMO_PASSWORD };
}
