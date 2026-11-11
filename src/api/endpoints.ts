import type * as C from './contracts.ts';

export interface IncidentPath {
  incident_id: C.Id;
}
export interface PredictionPath extends IncidentPath {
  prediction_id: C.Id;
}
export interface ProposalPath extends IncidentPath {
  proposal_id: C.Id;
}
export interface IncidentContextQuery {
  incident_id?: C.Id;
}
export interface ResourceQuery extends C.PageQuery, IncidentContextQuery {
  kind?: C.ResourceKind;
  status?: C.ResourceStatus;
  base_id?: C.Id;
}
export interface BaseQuery extends C.PageQuery, IncidentContextQuery {
  org_type?: string;
}
export interface LogQuery extends C.PageQuery, IncidentContextQuery {
  action?: string;
  user_id?: C.Id;
  from_at?: C.DateTime;
  to_at?: C.DateTime;
}
export interface UserQuery extends C.PageQuery {
  role?: C.UserRole;
  admin_area_id?: C.Id;
  include_deleted?: boolean;
}
type Get<P = never, Q = never> = ([P] extends [never] ? object : { path: P }) &
  ([Q] extends [never] ? object : { query?: Q });
type Read<P = never, Q = never> = Get<P, Q> & { body?: never };
type Write<P, B> = Get<P> & { body: B };
type Idempotent<P, B> = Write<P, B> & { idempotencyKey: string };
interface Contract<Request, Response> {
  request: Request;
  response: Response;
}

/** Confirmed API contracts; retired endpoints remain absent. */
export interface ApiContracts {
  'AUTH-01': Contract<{ body: C.LoginRequest }, C.AuthToken>;
  'AUTH-02': Contract<Read, C.User>;
  'AUTH-03': Contract<Read, undefined>;
  'INC-01': Contract<
    Read<never, C.PageQuery & { status?: C.IncidentStatus }>,
    C.Page<C.IncidentSummary>
  >;
  'INC-02': Contract<Idempotent<never, C.IncidentCreateRequest>, C.Incident>;
  'INC-03': Contract<Read<IncidentPath>, C.Incident>;
  'INC-04': Contract<
    Write<IncidentPath, C.ExpectedPerimeterRequest>,
    C.Incident
  >;
  'PER-01': Contract<Read<IncidentPath, C.PageQuery>, C.Page<C.Perimeter>>;
  'PER-02': Contract<
    Idempotent<IncidentPath, C.PerimeterReportRequest>,
    C.Perimeter
  >;
  'PER-03': Contract<
    Idempotent<
      IncidentPath & { perimeter_id: C.Id },
      C.PerimeterCorrectionRequest
    >,
    C.Perimeter
  >;
  'PRED-01': Contract<
    Idempotent<IncidentPath, C.PredictionRequest>,
    C.Operation
  >;
  'PRED-02': Contract<Read<PredictionPath>, C.Prediction>;
  'PRED-03': Contract<
    Read<PredictionPath, { hour?: C.PredictionHour }>,
    C.PredictionSlices
  >;
  'PRED-04': Contract<Read<PredictionPath>, C.Weather>;
  'PRED-05': Contract<
    Read<IncidentPath & { operation_id: string }>,
    C.Operation
  >;
  'RISK-01': Contract<Read<PredictionPath>, C.Risk | null>;
  'WTH-01': Contract<Read<IncidentPath>, C.WeatherNow>;
  'MAP-01': Contract<Read, C.Layer[]>;
  'MAP-02': Contract<
    {
      path: { layer_id: string };
      query: C.PageQuery & { bbox: string };
      body?: never;
    },
    C.MapFeatures
  >;
  'MAP-03': Contract<Read<{ entity_type: C.MapEntityType; entity_id: C.Id }>, C.MapEntityDetail>;
  'MAP-04': Contract<Read<never, C.PageQuery & { level?: C.AdminLevel; parent_id?: C.Id; q?: string }>, C.Page<C.AdminArea>>;
  'RES-01': Contract<Read<never, ResourceQuery>, C.Page<C.Resource>>;
  'RES-02': Contract<
    Read<
      never,
      IncidentContextQuery & { kind?: C.ResourceKind; base_id?: C.Id }
    >,
    C.ResourceSummary
  >;
  'BASE-01': Contract<Read<never, BaseQuery>, C.Page<C.ResourceBase>>;
  'BASE-02': Contract<{ body: C.ResourceBaseCreateRequest }, C.ResourceBase>;
  'BASE-03': Contract<Write<{ base_id: C.Id }, C.ResourceBaseUpdateRequest>, C.ResourceBase>;
  'BASE-04': Contract<Read<{ base_id: C.Id }>, undefined>;
  'RES-03': Contract<{ body: C.ResourceCreateRequest }, C.Resource>;
  'RES-04': Contract<Write<{ resource_id: C.Id }, C.ResourceUpdateRequest>, C.Resource>;
  'RES-05': Contract<Read<{ resource_id: C.Id }>, undefined>;
  'PROP-01': Contract<
    Read<IncidentPath, C.PageQuery>,
    C.Page<C.ProposalVersion>
  >;
  'PROP-02': Contract<Read<IncidentPath>, C.Proposal | null>;
  'PROP-03': Contract<Read<ProposalPath>, C.Proposal>;
  'PROP-04': Contract<Read<ProposalPath>, C.ProposalDiff>;
  'PROP-05': Contract<
    Idempotent<IncidentPath, C.RegenerationRequest>,
    C.Operation
  >;
  'AI-01': Contract<
    Write<IncidentPath, C.AssistantRequest>,
    C.AssistantResponse
  >;
  'AI-02': Contract<Read<IncidentPath, C.PageQuery>, C.Page<C.QaMessage>>;
  'COR-01': Contract<
    Idempotent<IncidentPath, { confirmation_token: string }>,
    C.CorrectionSaved
  >;
  'COR-02': Contract<Read<IncidentPath, C.PageQuery>, C.Page<C.Correction>>;
  'LOG-01': Contract<Read<never, LogQuery>, C.Page<C.EventLog>>;
  'USR-01': Contract<Read<never, UserQuery>, C.Page<C.AdminUser>>;
  'USR-02': Contract<{ body: C.UserCreateRequest }, C.UserCreated>;
}
export type ApiId = keyof ApiContracts;
export type RequestFor<K extends ApiId> = ApiContracts[K]['request'];
export type ResponseFor<K extends ApiId> = ApiContracts[K]['response'];
export type ResponseMap = { [K in ApiId]: ResponseFor<K> };
export type CallOptions<K extends ApiId> = RequestFor<K> & {
  signal?: AbortSignal;
  timeoutMs?: number;
};
export type CallArgs<K extends ApiId> =
  object extends RequestFor<K>
    ? [options?: CallOptions<K>]
    : [options: CallOptions<K>];
export interface Endpoint {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  status: 200 | 201 | 202 | 204;
  roles: readonly C.UserRole[];
  priority: 'P1' | 'P2' | 'P3';
  body?: true;
  idempotent?: true;
}
const readers = ['COMMANDER', 'VIEWER'] as const;
const mapReaders = ['COMMANDER', 'VIEWER', 'REPORTER'] as const;
const resourceReaders = ['COMMANDER', 'VIEWER', 'ADMIN'] as const;
const all = ['COMMANDER', 'VIEWER', 'REPORTER', 'ADMIN'] as const;

export const endpoints = {
  'AUTH-01': {
    method: 'POST',
    path: '/auth/login',
    status: 200,
    roles: [],
    priority: 'P1',
    body: true,
  },
  'AUTH-02': {
    method: 'GET',
    path: '/auth/me',
    status: 200,
    roles: all,
    priority: 'P1',
  },
  'AUTH-03': {
    method: 'POST',
    path: '/auth/logout',
    status: 204,
    roles: all,
    priority: 'P2',
  },
  'INC-01': {
    method: 'GET',
    path: '/incidents',
    status: 200,
    roles: all,
    priority: 'P1',
  },
  'INC-02': {
    method: 'POST',
    path: '/incidents',
    status: 201,
    roles: ['REPORTER'],
    priority: 'P1',
    body: true,
    idempotent: true,
  },
  'INC-03': {
    method: 'GET',
    path: '/incidents/{incident_id}',
    status: 200,
    roles: mapReaders,
    priority: 'P1',
  },
  'INC-04': {
    method: 'POST',
    path: '/incidents/{incident_id}/end',
    status: 200,
    roles: ['COMMANDER'],
    priority: 'P2',
    body: true,
  },
  'PER-01': {
    method: 'GET',
    path: '/incidents/{incident_id}/perimeters',
    status: 200,
    roles: mapReaders,
    priority: 'P2',
  },
  'PER-02': {
    method: 'POST',
    path: '/incidents/{incident_id}/perimeters',
    status: 201,
    roles: ['REPORTER'],
    priority: 'P2',
    body: true,
    idempotent: true,
  },
  'PER-03': {
    method: 'POST',
    path: '/incidents/{incident_id}/perimeters/{perimeter_id}/corrections',
    status: 201,
    roles: ['REPORTER'],
    priority: 'P2',
    body: true,
    idempotent: true,
  },
  'PRED-01': {
    method: 'POST',
    path: '/incidents/{incident_id}/predictions',
    status: 202,
    roles: ['COMMANDER'],
    priority: 'P1',
    body: true,
    idempotent: true,
  },
  'PRED-02': {
    method: 'GET',
    path: '/incidents/{incident_id}/predictions/{prediction_id}',
    status: 200,
    roles: readers,
    priority: 'P1',
  },
  'PRED-03': {
    method: 'GET',
    path: '/incidents/{incident_id}/predictions/{prediction_id}/slices',
    status: 200,
    roles: readers,
    priority: 'P1',
  },
  'PRED-04': {
    method: 'GET',
    path: '/incidents/{incident_id}/predictions/{prediction_id}/weather',
    status: 200,
    roles: readers,
    priority: 'P2',
  },
  'PRED-05': {
    method: 'GET',
    path: '/incidents/{incident_id}/operations/{operation_id}',
    status: 200,
    roles: ['COMMANDER'],
    priority: 'P1',
  },
  'RISK-01': {
    method: 'GET',
    path: '/incidents/{incident_id}/predictions/{prediction_id}/risk',
    status: 200,
    roles: readers,
    priority: 'P2',
  },
  'WTH-01': {
    method: 'GET',
    path: '/incidents/{incident_id}/weather/now',
    status: 200,
    roles: readers,
    priority: 'P2',
  },
  'MAP-01': {
    method: 'GET',
    path: '/map/layers',
    status: 200,
    roles: mapReaders,
    priority: 'P1',
  },
  'MAP-02': {
    method: 'GET',
    path: '/map/layers/{layer_id}/features',
    status: 200,
    roles: mapReaders,
    priority: 'P1',
  },
  'MAP-03': {
    method: 'GET',
    path: '/map/entities/{entity_type}/{entity_id}',
    status: 200,
    roles: mapReaders,
    priority: 'P1',
  },
  'MAP-04': {
    method: 'GET',
    path: '/admin-areas',
    status: 200,
    roles: all,
    priority: 'P1',
  },
  'RES-01': {
    method: 'GET',
    path: '/resources',
    status: 200,
    roles: resourceReaders,
    priority: 'P2',
  },
  'RES-02': {
    method: 'GET',
    path: '/resources/summary',
    status: 200,
    roles: resourceReaders,
    priority: 'P2',
  },
  'RES-03': { method: 'POST', path: '/admin/resources', status: 201, roles: ['ADMIN'], priority: 'P3', body: true },
  'RES-04': { method: 'PATCH', path: '/admin/resources/{resource_id}', status: 200, roles: ['ADMIN'], priority: 'P3', body: true },
  'RES-05': { method: 'DELETE', path: '/admin/resources/{resource_id}', status: 204, roles: ['ADMIN'], priority: 'P3' },
  'BASE-02': { method: 'POST', path: '/admin/resource-bases', status: 201, roles: ['ADMIN'], priority: 'P3', body: true },
  'BASE-03': { method: 'PATCH', path: '/admin/resource-bases/{base_id}', status: 200, roles: ['ADMIN'], priority: 'P3', body: true },
  'BASE-04': { method: 'DELETE', path: '/admin/resource-bases/{base_id}', status: 204, roles: ['ADMIN'], priority: 'P3' },
  'BASE-01': {
    method: 'GET',
    path: '/resource-bases',
    status: 200,
    roles: resourceReaders,
    priority: 'P2',
  },
  'PROP-01': {
    method: 'GET',
    path: '/incidents/{incident_id}/proposals',
    status: 200,
    roles: ['COMMANDER'],
    priority: 'P2',
  },
  'PROP-02': {
    method: 'GET',
    path: '/incidents/{incident_id}/proposals/latest',
    status: 200,
    roles: ['COMMANDER'],
    priority: 'P1',
  },
  'PROP-03': {
    method: 'GET',
    path: '/incidents/{incident_id}/proposals/{proposal_id}',
    status: 200,
    roles: ['COMMANDER'],
    priority: 'P2',
  },
  'PROP-04': {
    method: 'GET',
    path: '/incidents/{incident_id}/proposals/{proposal_id}/diff',
    status: 200,
    roles: ['COMMANDER'],
    priority: 'P2',
  },
  'PROP-05': {
    method: 'POST',
    path: '/incidents/{incident_id}/proposal-regenerations',
    status: 202,
    roles: ['COMMANDER'],
    priority: 'P3',
    body: true,
    idempotent: true,
  },
  'AI-01': {
    method: 'POST',
    path: '/incidents/{incident_id}/assistant/messages',
    status: 200,
    roles: ['COMMANDER'],
    priority: 'P2',
    body: true,
  },
  'AI-02': {
    method: 'GET',
    path: '/incidents/{incident_id}/assistant/messages',
    status: 200,
    roles: ['COMMANDER'],
    priority: 'P3',
  },
  'COR-01': {
    method: 'POST',
    path: '/incidents/{incident_id}/corrections',
    status: 201,
    roles: ['COMMANDER'],
    priority: 'P3',
    body: true,
    idempotent: true,
  },
  'COR-02': {
    method: 'GET',
    path: '/incidents/{incident_id}/corrections',
    status: 200,
    roles: ['COMMANDER'],
    priority: 'P3',
  },
  'LOG-01': {
    method: 'GET',
    path: '/event-logs',
    status: 200,
    roles: ['COMMANDER', 'ADMIN'],
    priority: 'P2',
  },
  'USR-01': {
    method: 'GET',
    path: '/admin/users',
    status: 200,
    roles: ['ADMIN'],
    priority: 'P2',
  },
  'USR-02': {
    method: 'POST',
    path: '/admin/users',
    status: 201,
    roles: ['ADMIN'],
    priority: 'P2',
    body: true,
  },
} as const satisfies Record<ApiId, Endpoint>;

export const API_IDS = Object.keys(endpoints) as ApiId[];
