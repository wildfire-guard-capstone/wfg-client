// Backend main 7b60f574: app/services/risk.py KEY_OF + risk/criteria.py units.
// Display metadata only: do not convert raw values or recompute risk grades.
export const RISK_UNITS: Readonly<Record<string, string>> = {
  slope_up: '°',
  aspect: '°',
  curvature: '1/100 m',
  terrain_complexity: 'm',
  elevation: 'm',
  topographic_position: 'm',
  water_distance: 'km',
  fuel_load: 't/ha',
  forest_type: '',
  surface_fuel_depth: 'cm',
  stand_age: '년',
  canopy_height: 'm',
  canopy_cover: '%',
  wind_speed: 'm/s',
  humidity: '%',
  temperature: '℃',
  precipitation: 'mm',
  ground_temperature: '℃',
  precipitation_7d: 'mm',
  pressure: 'hPa',
  fuel_moisture: '%',
  vulnerable_population: '명',
  fire_station_distance: 'km',
  fire_area: 'ha',
  houses_nearby: '동',
};
export function riskUnit(code: string, value: unknown): string {
  if (
    typeof value === 'string' ||
    (code === 'aspect' && typeof value !== 'number')
  )
    return '';
  return RISK_UNITS[code] ?? '';
}
