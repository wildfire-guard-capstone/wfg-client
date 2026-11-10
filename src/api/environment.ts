import { createApiClient } from './client.ts';
import type { ApiClientOptions } from './client.ts';

export interface ApiEnvironment {
  VITE_API_MODE?: string;
  VITE_API_BASE_URL?: string;
}

/** Pass import.meta.env in Vite; explicit injection keeps tests independent of Vite. */
export function createApiClientFromEnv(
  env: ApiEnvironment,
  options: Omit<ApiClientOptions, 'mode' | 'baseUrl'> = {},
) {
  const mode = env.VITE_API_MODE?.trim() || 'mock';
  if (mode !== 'mock' && mode !== 'http')
    throw new Error('VITE_API_MODE는 mock 또는 http여야 합니다.');
  return createApiClient({
    ...options,
    mode,
    baseUrl: env.VITE_API_BASE_URL?.trim() || '/api/v1',
  });
}
