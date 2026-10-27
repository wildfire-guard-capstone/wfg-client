/** Domain data preserved from the original v4 mock; coordinates are [longitude, latitude]. */
export type LngLat = [longitude: number, latitude: number];
export type Ring = LngLat[];
export type Role = 'commander' | 'viewer' | 'reporter' | 'admin';
export type IncidentStatus = '접수' | '진행 중' | '종료';

export type Incident = {
  id: string;
  name: string;
  status: IncidentStatus;
  real?: boolean;
  addr: string;
  ignition: LngLat;
  start_time: string | null;
  report_time: string;
  report_text: string;
  caller: {
    org: string;
    name: string;
    phone: string;
    real?: boolean;
  };
  reported_by: string;
  risk_demo_runs?: {
    values: {
      temp: number;
      rain: number;
      wind: number;
      rh: number;
      pres: number;
      gtemp: number;
      rain7: number;
      elev: number;
      slope: number;
      aspect: number;
      curv: number;
      tpi: number;
      water: number;
      rough: number;
      species: string;
      load: number;
      depth: number;
      moist: number;
      age: number;
      cht: number;
      cover: number;
      vuln: number;
      fire_st: number;
    };
  }[];
  intake: {
    org: string;
    at: string;
    channel: string;
    real?: boolean;
  }[];
  official_stage: string;
  alert_level: string;
  perimeters: {
    version: number;
    status: '유효' | '정정됨';
    at: string;
    by: string;
    source: string;
    real?: boolean;
    ring: LngLat[];
  }[];
  field_report: {
    expected_suppression_hours: number | null;
  };
  evacuation_state: {
    order_issued: boolean;
    cbs_sent: string[];
    completed_villages: string[];
    injuries: string[];
  };
  ended_at: string | null;
  ended_by: string | null;
};

export type Account = {
  locked?: boolean;
  failed?: number;
  id: string;
  pw: string;
  name: string;
  org: string;
  role: Role;
  status: string;
  issued: string;
};

export type Resource = {
  id: string;
  type: string;
  name: string;
  org: string;
  base: string;
  qty: number;
  status: string;
  pos?: LngLat;
};

export type Village = {
  id: string;
  name: string;
  emd: string;
  lng: number;
  lat: number;
  pop: number;
  hh: number;
  elderly: number;
  disabled: number;
};

export type Facility = {
  id: string;
  name: string;
  type: string;
  lng: number;
  lat: number;
  capacity?: number;
  real?: boolean;
};

export type Shelter = {
  id: string;
  name: string;
  lng: number;
  lat: number;
  capacity: number;
};

export type Scenario = {
  meta: {
    id: string;
    title: string;
    now: string;
    horizon_hours: number;
    stage_scheme_note: string;
    spread_note: string;
    sources: {
      id: string;
      label: string;
      url: string;
    }[];
  };
  incidents: Incident[];
  stage_rules: {
    area_ha: {
      stage: string;
      max?: number;
      min?: number;
    }[];
    wind_ms: {
      stage: string;
      max?: number;
      min?: number;
    }[];
    hours: {
      stage: string;
      max?: number;
      min?: number;
    }[];
    facility: {
      stage1_houses: number;
      stage2_houses: number;
      stage2_major: number;
    };
    note: string;
  };
  astronomy: {
    sunrise: string;
    sunset: string;
    note: string;
  };
  weather: {
    fetch_status: string;
    real?: boolean;
    note: string;
    source: string;
    base_time: string;
    received_at: string;
    warnings: string[];
    series: {
      t: string;
      wind_ms: number;
      wind_dir: number;
      rh: number;
      temp_c: number;
      vis_m: number;
    }[];
  };
  risk_merge_demo: {
    enabled: boolean;
    mergedIds: string[];
    demo_fire: {
      name: string;
      addr: string;
      ignition: LngLat;
      caller: {
        name: string;
      };
    };
    values: {
      temp: number;
      rain: number;
      wind: number;
      rh: number;
      pres: number;
      gtemp: number;
      rain7: number;
      elev: number;
      slope: number;
      aspect: number;
      curv: number;
      tpi: number;
      water: number;
      rough: number;
      species: string;
      load: number;
      depth: number;
      moist: number;
      age: number;
      cht: number;
      cover: number;
      vuln: number;
      fire_st: number;
    };
  };
  prediction_demo: {
    mock_fail_next: boolean;
    mock_fail_proposal_next: boolean;
  };
  chat_demo: {
    mock_fail_next: boolean;
  };
  risk_model: {
    mock_fail_next: boolean;
    mock_missing_vars: string[];
    axes: {
      key: string;
      name: string;
    }[];
    vars: {
      key: string;
      axis: string;
      name: string;
      unit: string;
      w: number;
      mode: string;
      t?: number[];
      c?: string[];
    }[];
    default_values: {
      temp: number;
      rain: number;
      wind: number;
      rh: number;
      pres: number;
      gtemp: number;
      rain7: number;
      elev: number;
      slope: number;
      aspect: number;
      curv: number;
      tpi: number;
      water: number;
      rough: number;
      species: string;
      load: number;
      depth: number;
      moist: number;
      age: number;
      cht: number;
      cover: number;
      vuln: number;
      fire_st: number;
    };
  };
  fire_model: {
    head: number[];
    flank: number[];
    back: number;
    noise_amp: number;
  };
  villages: Village[];
  facilities: Facility[];
  shelters: Shelter[];
  agencies: {
    id: string;
    name: string;
    type: string;
    lng: number;
    lat: number;
    real?: boolean;
  }[];
  power_line_fallback: {
    name: string;
    real?: boolean;
    coords: LngLat[];
  };
  routes: {
    id: string;
    kind: string;
    name: string;
    coords: LngLat[];
  }[];
  resources_fetch_status: string;
  resources: Resource[];
  accounts: Account[];
  evidence: {
    'SM-p013': {
      doc: string;
      page: string;
      section: string;
      text: string;
    };
    'SM-p022': {
      doc: string;
      page: string;
      section: string;
      text: string;
    };
    'SM-p041': {
      doc: string;
      page: string;
      section: string;
      text: string;
    };
    'SM-p065': {
      doc: string;
      page: string;
      section: string;
      text: string;
    };
    'SM-p072': {
      doc: string;
      page: string;
      section: string;
      text: string;
    };
    'SM-p073': {
      doc: string;
      page: string;
      section: string;
      text: string;
    };
    'SM-p074': {
      doc: string;
      page: string;
      section: string;
      text: string;
    };
    'SM-p077': {
      doc: string;
      page: string;
      section: string;
      text: string;
    };
    'SM-p078': {
      doc: string;
      page: string;
      section: string;
      text: string;
    };
    'SM-p078b': {
      doc: string;
      page: string;
      section: string;
      text: string;
    };
    'SM-p079': {
      doc: string;
      page: string;
      section: string;
      text: string;
    };
    'SM-p084': {
      doc: string;
      page: string;
      section: string;
      text: string;
    };
    'SM-p095': {
      doc: string;
      page: string;
      section: string;
      text: string;
    };
    'SM-p118': {
      doc: string;
      page: string;
      section: string;
      text: string;
    };
    'SM-p119': {
      doc: string;
      page: string;
      section: string;
      text: string;
    };
    'SM-p021': {
      doc: string;
      page: string;
      section: string;
      text: string;
    };
  };
  catalog: {
    id: string;
    axis: string;
    name: string;
    authority: string;
  }[];
};
