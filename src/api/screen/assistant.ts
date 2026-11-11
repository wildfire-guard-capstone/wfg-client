import type { AssistantResponse, QaMessage } from '../contracts.ts';
import { ApiError } from '../errors.ts';
export function validateQa(message: QaMessage, incidentId: string): QaMessage {
  if (!message || message.incident_id !== incidentId || typeof message.answer !== 'string' || typeof message.question !== 'string' || !Array.isArray(message.citations))
    throw new ApiError({ endpoint: 'AI-02', kind: 'protocol', code: 'INVALID_RESPONSE', message: '[필요한 정보: 선택한 산불의 질의·답변·인용 정보]' });
  return message;
}
export function validateAssistant(value: AssistantResponse, incidentId: string): AssistantResponse {
  if (value?.type === 'ANSWER') { validateQa(value.message, incidentId); return value; }
  if (value?.type === 'UNSUPPORTED' && typeof value.reason === 'string') return value;
  if (value?.type === 'CORRECTION_PREVIEW' && typeof value.confirmation_token === 'string' && Number.isFinite(Date.parse(value.expires_at)) && Array.isArray(value.changes) && Array.isArray(value.notes) && Array.isArray(value.ignored)) return value;
  throw new ApiError({ endpoint: 'AI-01', kind: 'protocol', code: 'INVALID_RESPONSE', message: '[필요한 정보: 질의응답 또는 정정 확인안 응답 계약]' });
}
