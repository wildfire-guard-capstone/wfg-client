import type { AuthToken, SuccessEnvelope } from './contracts.ts';
import { endpoints } from './endpoints.ts';
import type {
  ApiId,
  CallArgs,
  CallOptions,
  Endpoint,
  ResponseFor,
} from './endpoints.ts';
import { ApiError, isErrorEnvelope, isRecord } from './errors.ts';
import { abortReason } from './async.ts';
import { createMemoryTokenStore } from './session.ts';
import type { TokenStore } from './session.ts';
import { createMockFetch } from './mock/transport.ts';
import type { MockOptions } from './mock/transport.ts';

export type ApiMode = 'mock' | 'http';
export type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
export interface ApiClientOptions {
  mode: ApiMode;
  /** Include /api/v1. Relative paths can use Vite's development proxy. */
  baseUrl?: string;
  timeoutMs?: number;
  tokenStore?: TokenStore;
  fetcher?: Fetcher;
  mock?: MockOptions;
  onUnauthorized?: () => void;
}
export interface ApiClient {
  readonly mode: ApiMode;
  request<K extends ApiId>(
    id: K,
    ...args: CallArgs<K>
  ): Promise<ResponseFor<K>>;
  getAccessToken(): string | null;
  setAccessToken(token: string): void;
  clearSession(): void;
}
interface WireOptions {
  path?: Record<string, string>;
  query?: object;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function baseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  const url = new URL(trimmed, 'http://relative.invalid');
  if (
    (!trimmed.startsWith('/') && !/^https?:\/\//.test(trimmed)) ||
    trimmed.startsWith('//') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith('/api/v1')
  ) {
    throw new Error(
      'API baseUrl은 /api/v1로 끝나는 HTTP(S) 주소 또는 /로 시작하는 상대 경로여야 합니다.',
    );
  }
  return trimmed;
}

function authResponseIssues(id: ApiId, data: unknown): string[] {
  if (id !== 'AUTH-01' && id !== 'AUTH-02') return [];
  const issues: string[] = [];
  const record = isRecord(data) ? data : {};
  const user = id === 'AUTH-01' ? record.user : data;
  const prefix = id === 'AUTH-01' ? 'user.' : '';
  if (id === 'AUTH-01') {
    if (typeof record.access_token !== 'string' || !record.access_token.trim())
      issues.push('access_token');
    if (record.token_type !== 'bearer') issues.push('token_type');
    if (
      !Number.isSafeInteger(record.expires_in) ||
      Number(record.expires_in) <= 0
    )
      issues.push('expires_in');
  }
  if (!isRecord(user))
    return [...issues, id === 'AUTH-01' ? 'user' : 'User 객체'];
  for (const field of ['login_id', 'name', 'organization'])
    if (typeof user[field] !== 'string') issues.push(`${prefix}${field}`);
  if (typeof user.id !== 'string' || !/^[1-9]\d*$/.test(user.id))
    issues.push(`${prefix}id`);
  if (!['COMMANDER', 'VIEWER', 'REPORTER', 'ADMIN'].includes(String(user.role)))
    issues.push(`${prefix}role`);
  if (
    user.admin_area_id !== null &&
    (typeof user.admin_area_id !== 'string' ||
      !/^[1-9]\d*$/.test(user.admin_area_id))
  )
    issues.push(`${prefix}admin_area_id`);
  return issues;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  if (options.mode !== 'mock' && options.mode !== 'http')
    throw new Error('API mode는 mock 또는 http입니다.');
  const base = baseUrl(options.baseUrl ?? '/api/v1');
  const tokens = options.tokenStore ?? createMemoryTokenStore();
  let sessionRevision = 0;
  const clearSession = () => {
    sessionRevision++;
    tokens.clear();
  };
  const setAccessToken = (token: string) => {
    sessionRevision++;
    tokens.set(token);
  };
  const fetcher: Fetcher =
    options.mode === 'mock'
      ? createMockFetch(options.mock)
      : (options.fetcher ?? ((input, init) => globalThis.fetch(input, init)));
  const defaultTimeout = options.timeoutMs ?? 30_000;
  if (!Number.isFinite(defaultTimeout) || defaultTimeout <= 0)
    throw new Error('timeoutMs는 양수여야 합니다.');

  async function request<K extends ApiId>(
    id: K,
    ...args: CallArgs<K>
  ): Promise<ResponseFor<K>> {
    const endpoint: Endpoint | undefined = endpoints[id];
    if (!endpoint) throw new Error(`지원하지 않는 API ID: ${String(id)}`);
    const input = (args[0] ?? {}) as WireOptions;
    const configError = (message: string): never => {
      throw new ApiError({
        endpoint: id,
        kind: 'configuration',
        code: 'INVALID_REQUEST',
        message,
      });
    };
    const timeoutMs = input.timeoutMs ?? defaultTimeout;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
      configError('timeoutMs는 양수여야 합니다.');
    const path = endpoint.path.replace(/\{(\w+)\}/g, (_, key: string) => {
      const value = input.path?.[key];
      if (typeof value !== 'string' || !value.trim())
        return configError(`경로 값 ${key}가 필요합니다.`);
      return encodeURIComponent(value);
    });
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value !== undefined && value !== null) query.set(key, String(value));
    }
    const headers = new Headers({ Accept: 'application/json' });
    const revision = sessionRevision;
    const token = id === 'AUTH-01' ? null : tokens.get();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (endpoint.idempotent) {
      if (!input.idempotencyKey?.trim() || input.idempotencyKey.length > 100)
        configError('1~100자의 idempotencyKey가 필요합니다.');
      headers.set('Idempotency-Key', input.idempotencyKey!);
    }
    if (endpoint.body && input.body === undefined)
      configError('요청 본문이 필요합니다.');
    if (!endpoint.body && input.body !== undefined)
      configError('이 API는 요청 본문을 받지 않습니다.');
    let body: string | undefined;
    if (endpoint.body) {
      headers.set('Content-Type', 'application/json');
      try {
        body = JSON.stringify(input.body);
      } catch {
        configError('요청 본문을 JSON으로 변환할 수 없습니다.');
      }
    }
    if (input.signal?.aborted) throw abortReason(input.signal);
    const controller = new AbortController();
    const abort = () =>
      controller.abort(input.signal ? abortReason(input.signal) : undefined);
    input.signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const url = `${base}${path}${query.size ? `?${query}` : ''}`;

    try {
      const response = await fetcher(url, {
        method: endpoint.method,
        headers,
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
      });
      controller.signal.throwIfAborted();
      if (response.status === 204) {
        if (endpoint.status !== 204)
          throw new ApiError({
            endpoint: id,
            kind: 'protocol',
            code: 'INVALID_RESPONSE',
            status: 204,
            message: '예상하지 않은 빈 응답입니다.',
          });
        if (
          id === 'AUTH-03' &&
          sessionRevision === revision &&
          tokens.get() === token
        )
          clearSession();
        return undefined as ResponseFor<K>;
      }
      const text = await response.text();
      controller.signal.throwIfAborted();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = undefined;
      }
      if (!response.ok) {
        if (
          response.status === 401 &&
          id !== 'AUTH-01' &&
          sessionRevision === revision &&
          tokens.get() === token
        ) {
          clearSession();
          options.onUnauthorized?.();
        }
        if (isErrorEnvelope(payload))
          throw new ApiError({
            endpoint: id,
            kind: 'http',
            status: response.status,
            code: payload.error.code,
            message: payload.error.message,
            fields: payload.error.fields,
            requestId: payload.meta.request_id,
          });
        throw new ApiError({
          endpoint: id,
          kind: 'http',
          status: response.status,
          code: 'HTTP_ERROR',
          message: `서버 요청이 실패했습니다(${response.status}).`,
          ...(response.headers.get('X-Request-ID')
            ? { requestId: response.headers.get('X-Request-ID')! }
            : {}),
        });
      }
      if (
        response.status !== endpoint.status ||
        !isRecord(payload) ||
        !('data' in payload) ||
        !isRecord(payload.meta) ||
        typeof payload.meta.request_id !== 'string'
      ) {
        throw new ApiError({
          endpoint: id,
          kind: 'protocol',
          status: response.status,
          code: 'INVALID_RESPONSE',
          message: '응답 상태 또는 공통 응답 형식이 명세와 다릅니다.',
        });
      }
      const envelope = payload as unknown as SuccessEnvelope<ResponseFor<K>>;
      const issues = authResponseIssues(id, envelope.data);
      if (issues.length)
        throw new ApiError({
          endpoint: id,
          kind: 'protocol',
          code: 'INVALID_RESPONSE',
          status: response.status,
          requestId: payload.meta.request_id,
          message: `[필요한 정보: ${id} 응답의 유효한 ${issues.join(', ')}]`,
        });
      if (id === 'AUTH-01') {
        if (sessionRevision !== revision) {
          throw new ApiError({
            endpoint: id,
            kind: 'configuration',
            code: 'SESSION_CHANGED',
            message: '로그인 중 세션이 변경되었습니다. 다시 로그인하십시오.',
          });
        }
        setAccessToken((envelope.data as AuthToken).access_token);
      }
      return envelope.data;
    } catch (cause) {
      if (input.signal?.aborted) throw abortReason(input.signal);
      if (timedOut)
        throw new ApiError({
          endpoint: id,
          kind: 'timeout',
          code: 'REQUEST_TIMEOUT',
          message: '서버 응답 대기 시간이 초과되었습니다.',
          cause,
        });
      if (cause instanceof ApiError) throw cause;
      throw new ApiError({
        endpoint: id,
        kind: 'network',
        code: 'NETWORK_ERROR',
        message:
          '서버에 연결하지 못했습니다. 접속 주소·터널·CORS 설정을 확인해주세요.',
        cause,
      });
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener('abort', abort);
    }
  }
  return {
    mode: options.mode,
    request,
    getAccessToken: () => tokens.get(),
    setAccessToken,
    clearSession,
  };
}

/** Reuse the same key only when retrying the same user action and the same request body. */
export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}
export type { CallOptions };
