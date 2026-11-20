import { browserSessionStorage } from '../api/auth-session';
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useEffect,
  useRef,
  type PropsWithChildren,
  type RefObject,
} from 'react';
import { createMockRuntime } from './createMockRuntime';

type Runtime = ReturnType<typeof createMockRuntime>;
type Actions = Runtime['actions'];
const RuntimeContext = createContext<RefObject<Runtime | null> | null>(null);

export function MockRuntimeProvider({ children }: PropsWithChildren) {
  const runtimeRef = useRef<Runtime | null>(null);
  useLayoutEffect(() => {
    const root = document.getElementById('root')!;
    let restoring = false;
    try { restoring = import.meta.env.VITE_API_MODE === 'http' && !!browserSessionStorage()?.getItem('wfg-api-access-token'); } catch { /* Storage unavailable. */ }
    const previousVisibility = root.style.visibility;
    if (restoring) { root.style.visibility = 'hidden'; root.setAttribute('aria-busy', 'true'); }
    let active = true;
    const runtime = createMockRuntime();
    void runtime.ready.finally(() => {
      if (!active || !restoring) return;
      root.style.visibility = previousVisibility;
      root.removeAttribute('aria-busy');
    });
    runtimeRef.current = runtime;
    return () => {
      active = false;
      if (restoring) { root.style.visibility = previousVisibility; root.removeAttribute('aria-busy'); }
      runtime.dispose();
      runtimeRef.current = null;
    };
  }, []);
  useEffect(() => {
    // StrictMode runs effect setup/cleanup twice. Start only the surviving mount.
    const timer = window.setTimeout(() => { void runtimeRef.current?.restoreSession(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <RuntimeContext.Provider value={runtimeRef}>
      {children}
    </RuntimeContext.Provider>
  );
}

/** React events call typed actions; MapLibre and the preserved demo controller own their DOM leaves. */
export function useMockActions() {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error('MockRuntimeProvider is required.');
  return useCallback(
    <K extends keyof Actions>(name: K, ...args: Parameters<Actions[K]>) => {
      const handler = runtime.current?.actions[name] as (
        ...values: Parameters<Actions[K]>
      ) => unknown;
      return handler?.(...args);
    },
    [runtime],
  );
}
