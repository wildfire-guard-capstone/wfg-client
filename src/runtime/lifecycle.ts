/** Own browser resources for one React mount (including StrictMode / HMR remounts). */
export function createLifecycle() {
  const timeouts = new Set<number>();
  const intervals = new Set<number>();
  const frames = new Set<number>();
  const cleanups: (() => void)[] = [];
  let disposed = false;

  return {
    setTimeout(callback: () => void, delay = 0): number {
      const id = window.setTimeout(() => {
        timeouts.delete(id);
        if (!disposed) callback();
      }, delay);
      timeouts.add(id);
      return id;
    },
    setInterval(callback: () => void, delay: number): number {
      const id = window.setInterval(() => {
        if (!disposed) callback();
      }, delay);
      intervals.add(id);
      return id;
    },
    requestAnimationFrame(callback: FrameRequestCallback): number {
      const id = window.requestAnimationFrame((timestamp) => {
        frames.delete(id);
        if (!disposed) callback(timestamp);
      });
      frames.add(id);
      return id;
    },
    listen<K extends keyof GlobalEventHandlersEventMap>(
      target: EventTarget,
      event: K,
      handler: (event: GlobalEventHandlersEventMap[K]) => void,
    ) {
      target.addEventListener(event, handler as EventListener);
      cleanups.push(() =>
        target.removeEventListener(event, handler as EventListener),
      );
    },
    dispose() {
      disposed = true;
      timeouts.forEach(window.clearTimeout);
      intervals.forEach(window.clearInterval);
      frames.forEach(window.cancelAnimationFrame);
      cleanups.forEach((cleanup) => cleanup());
      timeouts.clear();
      intervals.clear();
      frames.clear();
    },
  };
}
