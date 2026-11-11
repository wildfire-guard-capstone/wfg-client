import type { Operation } from './contracts.ts';
import type { ApiClient } from './client.ts';
import { ApiError } from './errors.ts';
import { delay, abortReason } from './async.ts';

export function validateOperation(operation: Operation, expectedId?: string): Operation {
  if (!operation || typeof operation.id !== 'string' || !operation.id ||
      (expectedId !== undefined && operation.id !== expectedId) ||
      !['PREDICTION', 'PROPOSAL_REGENERATION'].includes(operation.kind) ||
      !['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED'].includes(operation.status))
    throw new ApiError({ endpoint: 'PRED-05', kind: 'protocol', code: 'INVALID_RESPONSE', message: '[필요한 정보: 요청한 작업 ID와 유효한 작업 상태]' });
  return operation;
}

/** Polling cancellation stops waiting; it does not cancel the server's prediction job. */
export async function waitForOperation(
  client: ApiClient,
  path: { incident_id: string; operation_id: string },
  options: {
    intervalMs?: number;
    maxWaitMs?: number;
    signal?: AbortSignal;
    onUpdate?: (operation: Operation) => void;
  } = {},
): Promise<Operation> {
  const interval = options.intervalMs ?? 2_000;
  const maxWait = options.maxWaitMs ?? 120_000;
  if (
    !Number.isFinite(interval) ||
    interval < 0 ||
    !Number.isFinite(maxWait) ||
    maxWait <= 0
  )
    throw new Error('조회 간격은 0 이상, 대기 시간은 양수여야 합니다.');
  const deadline = Date.now() + maxWait;
  while (true) {
    if (options.signal?.aborted) throw abortReason(options.signal);
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new ApiError({
        endpoint: 'PRED-05',
        kind: 'timeout',
        code: 'OPERATION_TIMEOUT',
        message:
          '작업 결과 대기 시간이 초과되었습니다. 진행 상태를 다시 조회할 수 있습니다.',
      });
    const operation = await client.request('PRED-05', {
      path,
      timeoutMs: remaining,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    validateOperation(operation, path.operation_id);
    options.onUpdate?.(operation);
    if (operation.status === 'SUCCEEDED' || operation.status === 'FAILED')
      return operation;
    await delay(
      Math.min(interval, Math.max(0, deadline - Date.now())),
      options.signal,
    );
  }
}
