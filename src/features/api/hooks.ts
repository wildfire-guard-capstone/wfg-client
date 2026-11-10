import { useCallback, useEffect, useRef, useState } from 'react';
import type { DependencyList } from 'react';
import { ApiError } from '../../api';

export function errorText(error: unknown): string {
  if (error instanceof ApiError)
    return `${error.message} (${error.code})${error.fields.length ? ' · ' + error.fields.map((f) => `${f.field}: ${f.reason}`).join(', ') : ''}`;
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
}
export const display = (value: unknown): string =>
  value == null || value === ''
    ? '정보 없음'
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
export const date = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour12: false,
      })
    : '정보 없음';

/** Latest request wins, with real cancellation on dependency changes, reload and unmount. */
export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
  enabled = true,
) {
  const [state, setState] = useState<{
    data?: T;
    loading: boolean;
    error: string;
    deps: DependencyList;
  }>({ loading: enabled, error: '', deps: [...deps] });
  const [revision, setRevision] = useState(0);
  const loader = useRef(load);
  loader.current = load;
  const reload = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    if (!enabled) {
      setState({ loading: false, error: '', deps: [...deps] });
      return () => controller.abort();
    }
    setState((previous) => ({
      data:
        deps.length === previous.deps.length &&
        deps.every((v, i) => Object.is(v, previous.deps[i]))
          ? previous.data
          : undefined,
      loading: true,
      error: '',
      deps: [...deps],
    }));
    loader
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ data, loading: false, error: '', deps: [...deps] });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState((previous) => ({
            ...previous,
            loading: false,
            error: errorText(error),
          }));
      });
    return () => controller.abort();
    // Caller supplies semantic request dependencies, never an inline loader identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, revision]);
  const sameRequest =
    enabled &&
    deps.length === state.deps.length &&
    deps.every((v, i) => Object.is(v, state.deps[i]));
  return {
    data: sameRequest ? state.data : undefined,
    loading: enabled && (!sameRequest || state.loading),
    error: sameRequest ? state.error : '',
    reload,
  };
}

/** Deduplicates clicks synchronously and prevents late writes after unmount/context changes. */
export function useAction(deps: DependencyList = []) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const [message, setMessage] = useState('');
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    deps,
  );
  const cancel = useCallback(() => {
    active.current?.abort();
    active.current = null;
    setPending(false);
    setMessage(
      '화면의 대기를 중지했습니다. 서버에서 시작된 작업은 계속될 수 있습니다.',
    );
  }, []);
  const run = useCallback(
    async (
      task: (
        signal: AbortSignal,
        progress: (text: string) => void,
      ) => Promise<void>,
    ) => {
      if (active.current) return;
      const controller = new AbortController();
      active.current = controller;
      setPending(true);
      setError('');
      setMessage('처리 중…');
      const progress = (text: string) => {
        if (!controller.signal.aborted) setMessage(text);
      };
      try {
        await task(controller.signal, progress);
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(errorText(error));
          setMessage('');
        }
      } finally {
        if (active.current === controller) {
          active.current = null;
          setPending(false);
        }
      }
    },
    [],
  );
  return {
    pending,
    error,
    message,
    run,
    cancel,
    clearError: () => setError(''),
  };
}
