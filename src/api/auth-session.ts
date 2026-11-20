import { createMemoryTokenStore, createSessionTokenStore } from './session.ts';

export const AUTH_STATE_KEY = 'wfg-api-auth-state';
export interface SessionView { incidentId: string; tab: 'status' | 'proposal' }
interface SavedAuth { userId: string; expiresAt: number; view?: SessionView }

export function browserSessionStorage(): Storage | undefined {
  try { return window.sessionStorage; } catch { return undefined; }
}

/** Tab-scoped JWT and expiry only. Never stores passwords or trusts a stored role. */
export function createAuthSession(storage?: Storage) {
  const memory = createMemoryTokenStore();
  const persisted = storage ? createSessionTokenStore(storage) : null;
  let saved: SavedAuth | null = null;
  try { saved = JSON.parse(storage?.getItem(AUTH_STATE_KEY) ?? 'null'); } catch { /* Invalid metadata cannot authenticate. */ }
  if (!saved || typeof saved !== 'object' || typeof saved.userId !== 'string' || !Number.isFinite(saved.expiresAt)) saved = null;
  let storageFailed = false;
  function write() {
    try {
      if (saved) storage?.setItem(AUTH_STATE_KEY, JSON.stringify(saved));
      else storage?.removeItem(AUTH_STATE_KEY);
    } catch { /* Storage disabled: current-page login still works. */ }
  }
  const tokenStore = {
    get() { try { return persisted && !storageFailed ? persisted.get() : memory.get(); } catch { return memory.get(); } },
    set(token: string) { memory.set(token); try { persisted?.set(token); } catch { storageFailed = true; } },
    clear() { memory.clear(); saved = null; write(); try { persisted?.clear(); } catch { /* Storage unavailable. */ } },
  };
  return {
    tokenStore,
    remember(userId: string, expiresIn: number) {
      saved = { userId, expiresAt: Date.now() + expiresIn * 1000 };
      write();
    },
    remainingSeconds() {
      return saved && typeof saved.userId === 'string' && Number.isFinite(saved.expiresAt)
        ? Math.max(0, (saved.expiresAt - Date.now()) / 1000) : 0;
    },
    viewFor(userId: string): SessionView | undefined {
      const v = saved?.view;
      return saved?.userId === userId && v && typeof v.incidentId === 'string' && ['status', 'proposal'].includes(v.tab)
        ? { incidentId: v.incidentId, tab: v.tab } : undefined;
    },
    rememberView(incidentId: string, tab: SessionView['tab']) {
      if (!saved || !incidentId || incidentId === '__NULL__') return;
      saved.view = { incidentId, tab };
      write();
    },
  };
}
export type AuthSession = ReturnType<typeof createAuthSession>;
