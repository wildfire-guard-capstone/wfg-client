import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type * as C from '../contracts.ts';
import type { ApiDataSource } from '../data-source.ts';
import type { LngLat, Scenario } from '../../types/scenario.ts';
import { needed } from './incidents.ts';

export type MapWindow = Awaited<ReturnType<ApiDataSource['mapWindow']>>;
export type MapMarker = {
  key: string; id: string; entity: C.MapEntityType; name: string;
  kind: string; cls: string; icon: string; position: LngLat;
};
const collection = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features });
/** Point symbols use an existing server coordinate; full wire geometries remain intact. */
export function mapPosition(geometry: Geometry | null | undefined): LngLat | null {
  if (!geometry) return null;
  if (geometry.type === 'GeometryCollection')
    return geometry.geometries.map(mapPosition).find((p) => p !== null) ?? null;
  let coordinates: unknown = geometry.coordinates;
  while (Array.isArray(coordinates) && Array.isArray(coordinates[0])) coordinates = coordinates[0];
  if (!Array.isArray(coordinates)) return null;
  const [lon, lat] = coordinates;
  return typeof lon === 'number' && typeof lat === 'number' && Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90 ? [lon, lat] : null;
}

export function mapRenderData(snapshot: MapWindow) {
  const get = (id: string) => {
    const data = snapshot.collections.get(id);
    return data?.status === 'ready' ? data.data.features : [];
  };
  const areas = snapshot.areas.status === 'ready' ? snapshot.areas.data : [];
  const names = new Map(areas.map((area) => [area.id, area.name]));
  const villages: Scenario['villages'] = [], facilities: Scenario['facilities'] = [], shelters: Scenario['shelters'] = [], agencies: Scenario['agencies'] = [];
  const markers: MapMarker[] = [];
  for (const feature of get('villages')) {
    const p = feature.properties as C.Village;
    const position = mapPosition(p.label_point);
    if (!position) continue;
    const emd = names.get(p.admin_area_id) ?? needed('마을 소속 읍면동명');
    villages.push({ id: p.id, name: p.name, emd, lng: position[0], lat: position[1], pop: p.population, hh: NaN, elderly: p.pop65_est ?? NaN, disabled: NaN });
    markers.push({ key: `v:${p.id}`, id: p.id, entity: 'village', name: p.name, kind: `${emd} 마을`, cls: 'village', icon: 'house', position });
  }
  for (const feature of get('facilities')) {
    const p = feature.properties as Omit<C.Facility, 'geometry'>;
    const position = mapPosition(feature.geometry);
    if (!position) continue;
    const [lng, lat] = position;
    let key: string, cls: string, icon: string, kind: string;
    if (p.type === 'SHELTER') {
      shelters.push({ id: p.id, name: p.name, lng, lat, capacity: p.capacity ?? NaN });
      key = `s:${p.id}`; cls = icon = 'shelter'; kind = '대피소';
    } else if (p.type === 'FIRE_STATION' || p.type === 'POLICE') {
      const type = p.type === 'POLICE' ? 'police' : 'fire';
      agencies.push({ id: p.id, name: p.name, type, lng, lat, real: true });
      key = `a:${p.id}`; cls = 'agency'; icon = type; kind = '유관기관';
    } else {
      const type = p.type === 'HERITAGE' ? 'heritage' : 'care';
      facilities.push({ id: p.id, name: p.name, type, lng, lat, capacity: p.capacity ?? NaN, real: true });
      key = `f:${p.id}`; cls = icon = type; kind = p.type === 'HERITAGE' ? '국가유산' : p.type === 'HOSPITAL' ? '의료시설' : '취약시설';
    }
    markers.push({ key, id: p.id, entity: 'facility', name: p.name, kind, cls, icon, position });
  }
  for (const feature of get('water')) {
    const p = feature.properties as C.MapFeature, position = mapPosition(feature.geometry);
    if (position) markers.push({ key: `w:${p.id}`, id: p.id, entity: 'map_feature', name: p.name ?? needed('담수지명'), kind: '담수지(저수지)', cls: 'water', icon: 'drop', position });
  }
  const mapped = (id: string, entity: C.MapEntityType, transform: (p: Record<string, unknown>) => object = (p) => p) => get(id).map((f) => ({ ...f, properties: { ...transform(f.properties as unknown as Record<string, unknown>), api_entity_type: entity, api_entity_id: String(f.properties.id) } }));
  const boundaries = collection(mapped('admin_areas', 'admin_area', (p) => ({ ...p, level: String(p.level).toLowerCase() })));
  const roads = collection([...mapped('road', 'map_feature'), ...mapped('track', 'map_feature')].map((f) => {
    const p = f.properties as Record<string, unknown>, attrs = p.attrs as C.JsonObject | undefined;
    return { ...f, properties: { ...p, kind: attrs?.highway ?? p.kind, ref: attrs?.ref } };
  }));
  const power = collection(mapped('power_line', 'map_feature'));
  // Existing house styling is a point symbol; these are actual server point geometries.
  const houses = collection(mapped('house', 'map_feature').filter((f) => f.geometry.type === 'Point'));
  return { villages, facilities, shelters, agencies, markers, boundaries, roads, power, houses };
}
