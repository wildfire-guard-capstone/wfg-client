import type { createApiServices, ApiClient, Incident, User } from '../../api';
export type Services = ReturnType<typeof createApiServices>;
export interface ScreenContext {
  api: Services;
  client: ApiClient;
  user: User;
}
export interface IncidentContext extends ScreenContext {
  incident: Incident;
  refresh: () => void;
}
