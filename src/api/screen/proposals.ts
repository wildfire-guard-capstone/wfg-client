import type { Proposal } from '../contracts.ts';
import { ApiError } from '../errors.ts';
export function validateProposal(value: Proposal | null, expectedId?: string): Proposal | null {
  if (value === null && expectedId === undefined) return null;
  if (!value || typeof value.id !== 'string' || (expectedId !== undefined && value.id !== expectedId) || typeof value.prediction_id !== 'string' || typeof value.version !== 'string' || !Array.isArray(value.items))
    throw new ApiError({ endpoint: expectedId ? 'PROP-03' : 'PROP-02', kind: 'protocol', code: 'INVALID_RESPONSE', message: '[필요한 정보: 요청한 제안 ID·버전·예측 ID 및 제안 항목]' });
  return value;
}
