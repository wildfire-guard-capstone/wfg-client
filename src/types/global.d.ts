import type { createMockRuntime } from '../runtime/createMockRuntime';

declare global {
  interface Window {
    /** Local demo inspection API retained from v4. */
    __mock?: Omit<ReturnType<typeof createMockRuntime>, 'dispose' | 'actions'>;
  }
}
export {};
