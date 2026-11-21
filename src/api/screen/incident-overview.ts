import { MISSING_TEXT } from './presentation.ts';

/** Only an explicitly official stage belongs here. INC-03.current_stage is an
 * automatic prediction judgement, not an official declaration. Korean aliases
 * retain the separate legacy demo's existing official facts. */
export function overviewOfficialStage(value: unknown): string {
  switch (value) {
    case 'INITIAL': case '초기': case '초기대응': return '초기';
    case 'STAGE1': case '1단계': case '확산대응 1단계': return '1단계';
    case 'STAGE2': case '2단계': case '확산대응 2단계': return '2단계';
    default: return MISSING_TEXT;
  }
}

/** GeoJSON order is longitude, latitude. Do not round the source coordinates. */
export function overviewCoordinates(value: unknown): string {
  if (!Array.isArray(value) || value.length < 2) return `위도·경도 ${MISSING_TEXT}`;
  const [lng, lat] = value;
  if (typeof lng !== 'number' || typeof lat !== 'number' ||
      !Number.isFinite(lng) || !Number.isFinite(lat) ||
      Math.abs(lng) > 180 || Math.abs(lat) > 90) return `위도·경도 ${MISSING_TEXT}`;
  return `위도 ${Math.abs(lat)}° ${lat < 0 ? 'S' : 'N'} · 경도 ${Math.abs(lng)}° ${lng < 0 ? 'W' : 'E'}`;
}
