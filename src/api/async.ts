export function abortReason(signal: AbortSignal): unknown {
  return (
    signal.reason ?? new DOMException('요청이 취소되었습니다.', 'AbortError')
  );
}
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(signal ? abortReason(signal) : undefined);
    };
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
