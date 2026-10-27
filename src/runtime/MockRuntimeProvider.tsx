import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
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
    const runtime = createMockRuntime();
    runtimeRef.current = runtime;
    return () => {
      runtime.dispose();
      runtimeRef.current = null;
    };
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
