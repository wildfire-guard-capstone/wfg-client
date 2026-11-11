import type {
  FeatureCollection,
  Geometry,
  MultiPolygon,
  Point,
  Polygon,
} from 'geojson';

/** Wire DTOs: docs API v0.5, fe6fd45. Keep string IDs and nullable values unchanged. */
export type Id = string;
export type DateTime = string;
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type UserRole = 'COMMANDER' | 'VIEWER' | 'REPORTER' | 'ADMIN';
export type IncidentStatus = 'IN_PROGRESS' | 'ENDED';
export type ResponseStage = 'INITIAL' | 'STAGE1' | 'STAGE2';
export type ItemAxis = 'SUPPRESSION' | 'EVACUATION';
export type ItemCategory = 'IMMEDIATE' | 'STANDBY' | 'CONSULT' | 'REQUEST';
export type ItemCode =
  `S${1 | 2 | 3 | 4 | 5 | 6}` | `E${1 | 2 | 3 | 4 | 5 | 6}`;
export type ResourceKind = 'HELICOPTER' | 'VEHICLE';
export type ResourceStatus = 'AVAILABLE' | 'DEPLOYED' | 'MAINTENANCE';
export type FacilityType =
  | 'SHELTER'
  | 'VULNERABLE'
  | 'HOSPITAL'
  | 'FIRE_STATION'
  | 'POLICE'
  | 'HERITAGE';
export type AdminLevel = 'SIDO' | 'SIGUNGU' | 'EMD';

export interface ApiMeta {
  request_id: string;
}
export interface SuccessEnvelope<T> {
  data: T;
  meta: ApiMeta;
}
export interface FieldError {
  field: string;
  reason: string;
}
export interface ErrorDetail {
  code: string;
  message: string;
  fields: FieldError[];
}
export interface ErrorEnvelope {
  error: ErrorDetail;
  meta: ApiMeta;
}
export interface Page<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
}
export interface PageQuery {
  cursor?: string;
  limit?: number;
}

export interface User {
  id: Id;
  login_id: string;
  name: string;
  organization: string;
  role: UserRole;
  admin_area_id: Id | null;
}
export interface AdminUser extends User {
  failed_login_count: number;
  created_at: DateTime;
  updated_at: DateTime;
  deleted_at: DateTime | null;
}
export interface AuthToken {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  user: User;
}
export interface LoginRequest {
  login_id: string;
  password: string;
  role: UserRole;
}
export interface UserCreateRequest {
  login_id: string;
  name: string;
  organization: string;
  role: UserRole;
  admin_area_id: Id | null;
}
export type UserUpdateRequest = Partial<Pick<UserCreateRequest, 'name' | 'organization' | 'role' | 'admin_area_id'>>;
export interface UserPasswordReset {
  user_id: Id;
  temporary_password: string;
}
export interface UserCreated {
  user: AdminUser;
  temporary_password: string;
}

export interface VillageState {
  evacuated?: boolean;
  evac_order?: boolean;
  pre_evac_done?: boolean;
}
export interface HelicopterDeployment {
  total: number;
  forest?: number;
  local?: number;
  fire?: number;
  military?: number;
  police?: number;
  unknown?: number;
}
export interface VehicleDeployment {
  total: number;
  forest_vehicle?: number;
  fire_truck?: number;
  other?: number;
}
export interface CrewDeployment {
  total: number;
  special_crew?: number;
  forest_officials?: number;
  fire?: number;
  military?: number;
  police?: number;
  other?: number;
}
export interface DeployedResources {
  helicopter?: HelicopterDeployment;
  vehicle?: VehicleDeployment;
  crew?: CrewDeployment;
}
export interface Situation {
  villages?: Record<Id, VillageState>;
  deployed?: DeployedResources;
  disaster_sms_sent?: boolean;
}
export interface Perimeter {
  id: Id;
  incident_id: Id;
  version_no: number;
  geometry: Point | MultiPolygon;
  observed_at: DateTime;
  reported_by: Id;
  created_at: DateTime;
  corrected_at: DateTime | null;
  area_ha: number;
}
export interface Incident {
  id: Id;
  name: string;
  ignition_point: Point;
  address: string;
  admin_area_id: Id;
  started_at: DateTime | null;
  reported_at: DateTime;
  report_text: string | null;
  reporter_org: string | null;
  reporter_name: string | null;
  reporter_phone: string | null;
  status: IncidentStatus;
  current_stage: ResponseStage;
  situation: Situation;
  reported_by: Id;
  created_at: DateTime;
  ended_at: DateTime | null;
  ended_by: Id | null;
  current_perimeter_id: Id;
  current_perimeter_version: number;
  latest_prediction_id: Id | null;
  latest_proposal_id: Id | null;
  needs_reprediction: boolean;
  proposal_stale: boolean;
  situation_revision: string;
  running_operation_id: string | null;
}
export interface IncidentSummary {
  id: Id;
  name: string;
  status: IncidentStatus;
  admin_area_id: Id;
  reported_at: DateTime;
  current_stage: ResponseStage;
  current_perimeter_version: number;
  needs_reprediction: boolean;
  proposal_stale: boolean;
}
export interface InitialPerimeter {
  geometry: Polygon | MultiPolygon;
  observed_at: DateTime;
}
export interface IncidentCreateRequest {
  ignition_point: Point;
  address: string;
  reported_at: DateTime;
  reporter_name: string;
  reporter_phone: string;
  started_at?: DateTime | null;
  report_text?: string | null;
  reporter_org?: string | null;
  initial_perimeter?: InitialPerimeter | null;
}
export interface ExpectedPerimeterRequest {
  expected_perimeter_id: Id;
}
export interface PredictionRequest extends ExpectedPerimeterRequest {
  mode?: 'LIVE' | 'DEMO_ELMFIRE' | null;
}
export interface PerimeterReportRequest
  extends InitialPerimeter, ExpectedPerimeterRequest {}
export type PerimeterCorrectionRequest = InitialPerimeter;

export type PredictionHour = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export interface SliceSummary {
  hour: PredictionHour;
  at: DateTime;
  area_ha: number;
}
export interface Prediction {
  id: Id;
  incident_id: Id;
  perimeter_id: Id;
  perimeter_version: number;
  base_at: DateTime;
  requested_by: Id;
  created_at: DateTime;
  slices: SliceSummary[];
}
export interface SliceProperties extends SliceSummary {
  prediction_id: Id;
}
export type PredictionSlices = FeatureCollection<MultiPolygon, SliceProperties>;
export interface WeatherHour {
  at: DateTime;
  kind?: string;
  wind_dir: number;
  wind_speed: number;
  temp: number;
  humidity: number;
  precip: number;
}
export interface Weather {
  source: 'KMA_FORECAST' | 'KMA_STATIONS' | 'AWS_OBS' | 'FIXED';
  issued_at: DateTime | null;
  location:
    | { nx: number; ny: number }
    | { stn: string }
    | { lat: number; lon: number }
    | null;
  hours: WeatherHour[];
}
export interface WeatherNow {
  observed_at: DateTime;
  source: string;
  wind_dir: number | null;
  wind_dir_name: string | null;
  wind_speed: number | null;
  temp: number | null;
  humidity: number | null;
  precip: number | null;
  next_refresh_at: DateTime | null;
  stale: boolean;
}
export type OperationStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
export interface Operation {
  id: string;
  kind: 'PREDICTION' | 'PROPOSAL_REGENERATION';
  status: OperationStatus;
  stage: string | null;
  result: { prediction_id?: Id; proposal_id?: Id; correction_id?: Id; mode?: 'LIVE' | 'DEMO_ELMFIRE' | null; predictor?: string } | null;
  error: { code: string; message: string } | null;
}

export interface Layer {
  id: string;
  name: string;
  entity_type: string;
  available: boolean;
  source: string | null;
  reference_date: string | null;
  attribution: string | null;
}
export interface AdminArea {
  id: Id;
  level: AdminLevel;
  code: string;
  name: string;
  parent_id: Id | null;
  neighbor_ids: Id[];
}
export interface Village {
  id: Id;
  code: string;
  admin_area_id: Id;
  name: string;
  geometry: MultiPolygon;
  label_point: Point;
  population: number;
  population_month: string;
  pop65_est: number | null;
  pop0_14_est: number | null;
  houses_est: number | null;
}
export interface Facility {
  id: Id;
  type: FacilityType;
  subtype: string;
  name: string;
  capacity: number | null;
  capacity_unit: string | null;
  address: string | null;
  phone: string | null;
  village_id: Id | null;
  sigungu_id: Id;
  geometry: Geometry;
  attrs: JsonObject;
}
export interface MapFeature {
  id: Id;
  kind: string;
  name: string | null;
  geometry: Geometry;
  attrs: JsonObject;
}
export type MapEntityType = 'village' | 'facility' | 'map_feature' | 'resource_base' | 'admin_area';
export interface MapEntityDetail {
  entity_type: MapEntityType;
  entity: Village | Facility | MapFeature | ResourceBase | AdminArea;
}
export type MapProperties =
  | AdminArea
  | (Omit<Village, 'geometry' | 'label_point'> & { label_point?: Point })
  | Omit<Facility, 'geometry'>
  | Omit<MapFeature, 'geometry'>;
export type MapFeatures = FeatureCollection<Geometry, MapProperties> & {
  next_cursor: string | null;
  has_more: boolean;
};
export interface ResourceBase {
  id: Id;
  name: string;
  org_type: string;
  geometry: Point | null;
  coverage_area_ids: Id[];
  distance_km: number | null;
  jurisdiction: 'LOCAL' | 'SUPPORT' | null;
}
export interface ResourceBaseCreateRequest {
  name: string;
  org_type: string;
  coverage_area_ids: Id[];
  geometry?: Point | null;
}
export type ResourceBaseUpdateRequest = Partial<ResourceBaseCreateRequest>;
export interface Resource {
  id: Id;
  kind: ResourceKind;
  name: string;
  base_id: Id;
  status: ResourceStatus;
  attrs: JsonObject;
  deployed_incident_id: Id | null;
}
export interface ResourceCreateRequest {
  kind: ResourceKind;
  name: string;
  base_id: Id;
  status?: ResourceStatus;
  attrs?: JsonObject;
  deployed_incident_id?: Id | null;
}
export type ResourceUpdateRequest = Partial<ResourceCreateRequest>;
export interface ResourceCount {
  base_id: Id;
  kind: ResourceKind;
  available: number;
  deployed: number;
  maintenance: number;
  total: number;
}
export interface ResourceSummary {
  bases: ResourceCount[];
  incident_deployed: DeployedResources | null;
  incident_linked: Record<string, number> | null;
}

export interface Evidence {
  chunk_id: string;
  label: string | null;
  doc_name: string | null;
  section: string | null;
  page: number | null;
  origin: string | null;
  text: string | null;
}
export interface ParagraphBlock {
  type: 'paragraph';
  category: ItemCategory;
  body: string;
  cite: string;
  quote: string;
  evidence: string[];
  text?: string;
  situation?: string;
  action_text?: string;
  topic?: string | null;
  source?: string;
}
export type ProposalBlock =
  | ParagraphBlock
  | { type: 'list'; style: string; rows: { text: string }[] }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'note'; text: string }
  | { type: 'failed'; text: string };
export interface ProposalSection {
  title: string;
  blocks: ProposalBlock[];
}
export interface ProposalItem {
  item_code: ItemCode;
  name: string;
  axis: ItemAxis;
  state: 'GENERATED' | 'PARTIAL' | 'FAILED' | 'REUSED' | 'NOT_TRIGGERED';
  categories: ItemCategory[];
  finding: string;
  withheld?: { field: string; reason: string }[] | null;
  change_type: 'NEW' | 'CHANGED' | 'SAME' | null;
  sections: ProposalSection[];
  evidence: Evidence[];
}
export type ProposalTrigger = 'PREDICTION' | 'CORRECTION';
export interface Proposal {
  id: Id;
  version: string;
  trigger: ProposalTrigger;
  created_at: DateTime;
  base_at: DateTime;
  prediction_id: Id;
  judged_stage: ResponseStage;
  predicted_stage: ResponseStage;
  items: ProposalItem[];
}
export interface ProposalVersion {
  id: Id;
  version: string;
  trigger: ProposalTrigger;
  created_at: DateTime;
  judged_stage: ResponseStage;
  predicted_stage: ResponseStage;
  category_counts: Record<ItemCategory, number>;
  changed_count: number | null;
}
export interface ChangedParagraph {
  change: 'ADDED' | 'REMOVED' | 'MODIFIED';
  topic: string | null;
  before: { category: ItemCategory; body: string } | null;
  after: { category: ItemCategory; body: string } | null;
}
export interface DiffItem {
  item_code: ItemCode;
  name: string;
  change: 'CHANGED' | 'NEW' | 'REMOVED';
  categories: { before: ItemCategory[] | null; after: ItemCategory[] | null };
  finding: { before: string | null; after: string | null } | null;
  proposals: ChangedParagraph[];
  rows: { added: string[]; removed: string[] };
  note: string | null;
}
export interface ProposalDiff {
  version: string;
  previous_version: string | null;
  trigger: ProposalTrigger;
  created_at: DateTime;
  cause: string | null;
  counts: { changed: number; wording_only: number; same: number } | null;
  items: DiffItem[];
  wording_only_items: ItemCode[];
  same_items: ItemCode[];
}

export interface CitationRef extends Evidence {
  id: string;
  k: number;
  chunk_code: string;
}
export type CorrectionChange =
  | {
      target: 'village';
      target_id: Id;
      target_name?: string;
      item: 'evacuated' | 'evac_order' | 'pre_evac_done';
      before: boolean;
      after: boolean;
      label: string;
    }
  | {
      target: 'deployed';
      item: string;
      before: number;
      after: number;
      label: string;
    }
  | {
      target: 'situation';
      item: 'disaster_sms_sent';
      before: boolean;
      after: boolean;
      label: string;
    };
export interface Correction {
  id: Id;
  incident_id: Id;
  user_id: Id;
  input_text: string;
  changes: CorrectionChange[];
  created_at: DateTime;
}
export interface IgnoredInput {
  text: string;
  reason: string;
}
export interface CorrectionPreview {
  type: 'CORRECTION_PREVIEW';
  confirmation_token: string;
  expires_at: DateTime;
  situation_revision: string;
  input_text: string;
  changes: CorrectionChange[];
  ignored: IgnoredInput[];
  notes: string[];
  summary: string;
  proposal_regenerates: boolean;
}
export interface QaSentence {
  text: string;
  citations: number[];
  data_refs: { ref: string; label: string; value: JsonValue }[];
}
export interface QaMessage {
  id: Id;
  incident_id: Id;
  user_id: Id;
  proposal_id: Id | null;
  item_code: string | null;
  question: string;
  answer: string;
  citations: CitationRef[];
  route: string | null;
  sentences: QaSentence[];
  insufficient: string[];
  no_evidence: boolean;
  created_at: DateTime;
}
export type AssistantResponse =
  | CorrectionPreview
  | { type: 'ANSWER'; message: QaMessage }
  | { type: 'UNSUPPORTED'; reason: string; ignored: IgnoredInput[] };
export interface AssistantRequest {
  input_text: string;
  proposal_id?: Id | null;
  item_code?: string | null;
}
export interface CorrectionSaved {
  correction: Correction;
  situation_revision: string;
  proposal_stale: boolean;
  proposal_operation: Operation | null;
}
export interface RegenerationRequest {
  expected_prediction_id: Id;
  situation_revision: string;
}

export type RiskAxis =
  | 'terrain'
  | 'fuel'
  | 'weather'
  | 'infrastructure'
  /** risk-2: 산불 규모(P5 면적) — 위해 H 묶음 */
  | 'scale'
  /** risk-2: 주변 주택 수(P5 + 1 km) — 노출 X 묶음 */
  | 'exposure';
export interface RiskFactor {
  code: string;
  name: string;
  axis: RiskAxis;
  raw_value: number | string | null;
  /** Spec says integer; server PR #27 allows fractional averages. Never round on receipt. */
  grade: number | null;
  weight: number;
  included: boolean;
  contribution: number | null;
  reason: string | null;
  source: string | null;
  value_at: DateTime | null;
}
export interface Risk {
  prediction_id: Id;
  status: 'READY' | 'PARTIAL' | 'UNAVAILABLE';
  /** risk-2: R = √(hazard × exposure). risk-1(명세 7.6): 23개 가중평균 */
  score: number | null;
  /** risk-2: 위해 H = 기상 · 지형 · 연료 · 규모 가중평균 */
  hazard?: number | null;
  /** risk-2: 노출 X = 인프라(취약계층 · 소방서 거리) · 주변 주택 가중평균 */
  exposure?: number | null;
  /** risk-2: 'sqrt_hx'. 없으면 risk-1(한 번에 가중평균) */
  combine?: string;
  grade: string | null;
  axes: Partial<Record<RiskAxis, number | null>>;
  included_weight_sum: number;
  factors: RiskFactor[];
  method_version: string | null;
  unavailable_reasons: string[];
}
export interface EventLog {
  id: Id;
  created_at: DateTime;
  user_id: Id | null;
  incident_id: Id | null;
  action: string;
  details: JsonObject | null;
}
