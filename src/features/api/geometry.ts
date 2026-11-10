import type { InitialPerimeter } from '../../api/contracts.ts';

/** Basic client checks protect the map. Topology/area validation remains the backend's job. */
export function parsePerimeterGeometry(
  text: string,
): InitialPerimeter['geometry'] {
  const parsed: unknown = JSON.parse(text);
  if (parsed === null || typeof parsed !== 'object')
    throw new Error('GeoJSON 객체가 필요합니다.');
  const input = parsed as Record<string, unknown>;
  const value = input.type === 'Feature' ? input.geometry : input;
  if (!value || typeof value !== 'object')
    throw new Error('화선 geometry가 필요합니다.');
  const g = value as Record<string, unknown>;
  if (
    !['Polygon', 'MultiPolygon'].includes(String(g.type)) ||
    !Array.isArray(g.coordinates) ||
    !g.coordinates.length
  )
    throw new Error('Polygon 또는 MultiPolygon을 입력하세요.');
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length)
      throw new Error('비어 있지 않은 폴리곤이 필요합니다.');
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4)
        throw new Error('화선은 꼭짓점 3개 이상과 닫힌 끝점이 필요합니다.');
      for (const p of ring) {
        if (
          !Array.isArray(p) ||
          p.length < 2 ||
          !p.every((n) => typeof n === 'number' && Number.isFinite(n)) ||
          Math.abs(p[0]) > 180 ||
          Math.abs(p[1]) > 90
        )
          throw new Error('좌표는 유효한 [경도, 위도] 숫자여야 합니다.');
      }
      if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])
        throw new Error('화선의 처음과 마지막 좌표가 같아야 합니다.');
    }
  }
  return g as unknown as InitialPerimeter['geometry'];
}
