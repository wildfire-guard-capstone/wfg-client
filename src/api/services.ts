import type { ApiClient } from './client.ts';
import type { ApiId, CallArgs } from './endpoints.ts';

/** Optional named aliases. They retain exactly the same typed arguments as request(API_ID). */
export function createApiServices(client: ApiClient) {
  const bind =
    <K extends ApiId>(id: K) =>
    (...args: CallArgs<K>) =>
      client.request(id, ...args);
  return {
    auth: {
      login: bind('AUTH-01'),
      me: bind('AUTH-02'),
      logout: bind('AUTH-03'),
    },
    incidents: {
      list: bind('INC-01'),
      report: bind('INC-02'),
      get: bind('INC-03'),
      end: bind('INC-04'),
    },
    perimeters: {
      list: bind('PER-01'),
      report: bind('PER-02'),
      correct: bind('PER-03'),
    },
    predictions: {
      start: bind('PRED-01'),
      get: bind('PRED-02'),
      slices: bind('PRED-03'),
      weather: bind('PRED-04'),
      operation: bind('PRED-05'),
    },
    risk: { get: bind('RISK-01') },
    weather: { now: bind('WTH-01') },
    map: { layers: bind('MAP-01'), features: bind('MAP-02'), entity: bind('MAP-03'), adminAreas: bind('MAP-04') },
    resources: {
      list: bind('RES-01'),
      summary: bind('RES-02'),
      bases: bind('BASE-01'),
      create: bind('RES-03'),
      update: bind('RES-04'),
      remove: bind('RES-05'),
    },
    bases: { list: bind('BASE-01'), create: bind('BASE-02'), update: bind('BASE-03'), remove: bind('BASE-04') },
    proposals: {
      list: bind('PROP-01'),
      latest: bind('PROP-02'),
      get: bind('PROP-03'),
      diff: bind('PROP-04'),
      regenerate: bind('PROP-05'),
    },
    assistant: { send: bind('AI-01'), history: bind('AI-02') },
    corrections: { confirm: bind('COR-01'), history: bind('COR-02') },
    events: { list: bind('LOG-01') },
    users: { list: bind('USR-01'), create: bind('USR-02'), update: bind('USR-03'), revoke: bind('USR-04'), resetPassword: bind('USR-05'), unlock: bind('USR-06') },
  };
}
