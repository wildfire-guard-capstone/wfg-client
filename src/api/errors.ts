import type { ErrorEnvelope, FieldError } from './contracts.ts';
import type { ApiId } from './endpoints.ts';

export type ApiErrorKind =
  'http' | 'network' | 'timeout' | 'protocol' | 'configuration';
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string;
  readonly fields: FieldError[];
  readonly requestId: string | null;
  readonly endpoint: ApiId;

  constructor(options: {
    endpoint: ApiId;
    kind: ApiErrorKind;
    message: string;
    code: string;
    status?: number;
    fields?: FieldError[];
    requestId?: string;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'ApiError';
    this.endpoint = options.endpoint;
    this.kind = options.kind;
    this.status = options.status ?? null;
    this.code = options.code;
    this.fields = options.fields ?? [];
    this.requestId = options.requestId ?? null;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return (
    isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.code === 'string' &&
    typeof value.error.message === 'string' &&
    Array.isArray(value.error.fields) &&
    value.error.fields.every(
      (field) =>
        isRecord(field) &&
        typeof field.field === 'string' &&
        typeof field.reason === 'string',
    ) &&
    isRecord(value.meta) &&
    typeof value.meta.request_id === 'string'
  );
}
