import type { Resource, ResourceBase, ResourceCreateRequest, ResourceUpdateRequest } from '../contracts.ts';

export interface ResourceForm { type: string; name: string; base: string; qty: number; status: string }
/** Map only fields represented by the existing resource form and the API contract. */
export function resourceRequest(form: ResourceForm, bases: ResourceBase[], current?: Resource): ResourceCreateRequest | ResourceUpdateRequest {
  const kind = ({ '헬기': 'HELICOPTER', '차량': 'VEHICLE' } as const)[form.type as '헬기' | '차량'];
  if (!kind) throw new Error('[필요한 정보: 인력 등록·수정 API 계약]');
  if (form.qty !== 1) throw new Error('자원은 헬기·차량 1대 단위로 등록해야 합니다.');
  const name = form.name.trim();
  if (!name || name.length > 50) throw new Error('자원명은 1~50자로 입력해주세요.');
  const matches = bases.filter(b => b.id === form.base || b.name === form.base);
  if (matches.length !== 1) throw new Error('[필요한 정보: 자원의 고유한 기지 base_id — 기존 기지명 또는 ID 입력]');
  const base_id = matches[0]!.id;
  const status = ({ '대기': 'AVAILABLE', '투입': 'DEPLOYED', '정비': 'MAINTENANCE' } as const)[form.status as '대기' | '투입' | '정비'];
  if (!status) throw new Error('자원 상태를 확인해주세요.');
  if (status === 'DEPLOYED' && (!current || current.status !== 'DEPLOYED' || !current.deployed_incident_id))
    throw new Error('[필요한 정보: 투입 대상 산불 deployed_incident_id 선택 UI]');
  if (!current) return { kind, name, base_id, status };
  const body: ResourceUpdateRequest = {};
  if (kind !== current.kind) body.kind = kind;
  if (name !== current.name) body.name = name;
  if (base_id !== current.base_id) body.base_id = base_id;
  if (status !== current.status) body.status = status;
  if (!Object.keys(body).length) throw new Error('변경된 자원 정보가 없습니다.');
  return body;
}
