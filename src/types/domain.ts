import type { Marker } from 'maplibre-gl';
import type {
  Scenario,
  Incident,
  Role,
  LngLat,
  Ring,
  Village,
  Facility,
  Shelter,
} from './scenario';
export type { Scenario, Incident, Role, LngLat, Ring } from './scenario';

export interface ResourceView {
  heli_deployed: number;
  heli_available: number;
  fire_trucks_deployed: number;
  trucks_available: number;
  ground_crew_deployed: number;
  crew_positions: LngLat[];
}
export type VillagePrediction = Village & {
  arrival: number | null;
  arrivalTime: string | null;
  zone: string;
  night: boolean;
  status: string | null;
};
export type FacilityPrediction = Facility & { arrival: number | null };
export type ShelterPrediction = Shelter & {
  inP8: boolean;
  inP5: boolean;
  load: number;
  assigned: string[];
};
export interface RulesResult {
  t0: Date;
  sunset: string;
  sunrise: string;
  rs: ResourceView;
  areaByT?: number[];
  areaP5?: number;
  areaP8?: number;
  areaNow?: number;
  avgWind?: number;
  maxWind?: Scenario['weather']['series'][number];
  spreadDir?: string;
  villages?: VillagePrediction[];
  immediate?: VillagePrediction[];
  standby?: VillagePrediction[];
  ordered?: VillagePrediction[];
  nightVillages?: VillagePrediction[];
  unreached?: VillagePrediction[];
  facilities?: FacilityPrediction[];
  careIn?: FacilityPrediction[];
  heritageIn5?: FacilityPrediction[];
  housesP5?: number;
  housesP8?: number;
  powerLine?: { name: string; coords: LngLat[]; real?: boolean };
  powerIn?: number;
  shelters?: ShelterPrediction[];
  assignments?: {
    village: VillagePrediction;
    shelter: ShelterPrediction;
    km: number;
    minutes: number;
    overflow: boolean;
  }[];
  overflow?: ShelterPrediction[];
  routeInFire?: number;
  crewIn5?: number;
  crewTotal?: number;
  facMajor?: number;
  stageFactors?: { name: string; val: string; stage: string | null }[];
  recStage?: string;
  stageDrivers?: string[];
  official?: string;
  stageUp?: boolean;
  outOfScope?: boolean;
  crossesSigungu?: boolean;
  emdIn5?: string[];
  emdIn8?: string[];
  nextHolder?: string | null;
  heliOkNow?: boolean;
  night5?: boolean;
  cbsStage?: string;
  injuries?: string[];
}
export interface ProposalBlock {
  id: string;
  axis: string;
  name: string;
  authority: string;
  finding: string;
  status: string[];
  text: string;
  targets: string[];
  conflicts: { type: string; with: string; resolution: string }[];
  withheld: { slot: string; why: string }[];
  evidence: { k: number; key: string }[];
}
export interface PredictionPerimeter {
  version: number;
  area: number;
  at: string;
}
export interface ProposalRun {
  id: string;
  fv: number;
  seq: number;
  createdAt: Date;
  reason: string;
  R: RulesResult;
  blocks: ProposalBlock[];
  summary: Record<string, number>;
  perim: PredictionPerimeter | null;
  snapshot: { official_stage: string; alert_level: string };
  changed?: string[];
}
export interface RiskResult {
  score: number;
  vars: (Scenario['risk_model']['vars'][number] & {
    value: string | number | null;
    grade: number | null;
    wn: number;
  })[];
  factors: {
    key: string;
    name: string;
    weight: number;
    score: number;
    n: number;
  }[];
  missing: string[];
  predictionId: number;
  computedAt: Date;
  mergedIds: string[];
}
export interface IncidentState {
  predicted: boolean;
  slices: Ring[];
  t: number;
  runs: ProposalRun[];
  currentRun: ProposalRun | null;
  viewRun: ProposalRun | null;
  runSeq: number;
  stale: boolean;
  predPerim: PredictionPerimeter | null;
  latestRisk: RiskResult | null;
  predictFailed?: boolean;
  proposalFailed?: boolean;
  mergeSlices?: Ring[][];
  predictedAt?: Date;
  predictionSeq?: number;
  riskStatus?: string;
  riskComputedAt?: Date;
}
export interface MockEvent {
  t: string;
  kind: string;
  text: string;
  inc: string | null;
  user: string | null;
}
export interface AppState {
  role: Role | null;
  user: string | null;
  loginAt: number | null;
  incId: string;
  inc: Record<string, IncidentState>;
  playing: boolean;
  timer: number | null;
  wind: { ms: number; dir: number };
  events: MockEvent[];
  chatCtx: string | null;
  corrMode: boolean;
  sat: boolean;
  axis: string;
  filter: string;
  resFilter: Record<string, boolean>;
  listMode: string;
  houses: { pt: LngLat; v: string }[] | null;
  markers: Record<string, Marker>;
  predicting?: boolean;
  rep: {
    editingId: string | null;
    pickMode: boolean;
    drawMode: boolean;
    pts: Ring;
    ring: Ring | null;
    ringSource: string | null;
    perimMode: string;
    intake: Incident['intake'];
    listMode: string;
  };
}
export interface ModalAction {
  label: string;
  cls?: string;
  onClick?: () => unknown;
}
