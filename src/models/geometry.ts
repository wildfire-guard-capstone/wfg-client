import type { Geometry } from 'geojson';
import type { LngLat, Ring, Scenario } from '../types/scenario';
type Wind = { ms: number; dir: number };

/** Original v4 synthetic geometry, in a local metric projection around the scenario origin. */
export function createGeometry(origin: LngLat, model: Scenario['fire_model']) {
  const [LNG0, LAT0] = origin;
  const MX = 111320 * Math.cos((LAT0 * Math.PI) / 180),
    MY = 110540;
  const toM = (lng: number, lat: number): [number, number] => [
    (lng - LNG0) * MX,
    (lat - LAT0) * MY,
  ];
  const fromM = (x: number, y: number): LngLat => [
    LNG0 + x / MX,
    LAT0 + y / MY,
  ];
  const distKm = (a: number[], b: number[]) => {
    const [x1, y1] = toM(a[0], a[1]),
      [x2, y2] = toM(b[0], b[1]);
    return Math.hypot(x1 - x2, y1 - y2) / 1000;
  };
  function pointInRing(pt: number[], ring: number[][]) {
    const [x, y] = pt;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i],
        [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
        inside = !inside;
    }
    return inside;
  }
  function pointInGeom(pt: number[], geom: Geometry | null) {
    if (!geom) return false;
    if (geom.type === 'Polygon') return pointInRing(pt, geom.coordinates[0]);
    if (geom.type === 'MultiPolygon')
      return geom.coordinates.some((p) => pointInRing(pt, p[0]));
    return false;
  }
  function ringAreaHa(ring: number[][]) {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = toM(ring[i][0], ring[i][1]),
        [x2, y2] = toM(ring[i + 1][0], ring[i + 1][1]);
      a += x1 * y2 - x2 * y1;
    }
    return Math.abs(a) / 2 / 1e4;
  }
  function lineSamples(coords: number[][], stepM = 120): Ring {
    const out: Ring = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i],
        b = coords[i + 1],
        n = Math.max(1, Math.ceil((distKm(a, b) * 1000) / stepM));
      for (let k = 0; k <= n; k++)
        out.push([
          a[0] + ((b[0] - a[0]) * k) / n,
          a[1] + ((b[1] - a[1]) * k) / n,
        ]);
    }
    return out;
  }
  const lineHitsRing = (coords: number[][], ring: number[][]) =>
    lineSamples(coords).some((p) => pointInRing(p, ring));
  const firstSlice = (
    slices: Ring[],
    test: (ring: Ring) => boolean,
  ): number | null => {
    for (let t = 1; t <= 8; t++) if (test(slices[t - 1])) return t;
    return null;
  };
  const dirName = (deg: number) =>
    [
      '북',
      '북북동',
      '북동',
      '동북동',
      '동',
      '동남동',
      '남동',
      '남남동',
      '남',
      '남남서',
      '남서',
      '서남서',
      '서',
      '서북서',
      '북서',
      '북북서',
    ][Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
  // 실측 화선 폴리곤의 방사 거리(m): 중심에서 각도 방향으로 뻗은 반직선과 폴리곤 변의 교점 중 가장 먼 거리
  function radialMax(center: number[], ring: number[][], ang: number) {
    const [cx, cy] = toM(center[0], center[1]),
      dx = Math.cos(ang),
      dy = Math.sin(ang);
    let best = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [ax, ay] = toM(ring[i][0], ring[i][1]),
        [bx, by] = toM(ring[i + 1][0], ring[i + 1][1]);
      const ex = bx - ax,
        ey = by - ay,
        den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((ax - cx) * ey - (ay - cy) * ex) / den,
        u = ((ax - cx) * dy - (ay - cy) * dx) / den;
      if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
    }
    return best;
  }
  function firePolygon(
    center: number[],
    tHours: number,
    wind: Wind,
    actualRing?: Ring | null,
  ): Ring {
    const fm = model,
      U = wind.ms;
    const head = fm.head[0] + fm.head[1] * U,
      flank = fm.flank[0] + fm.flank[1] * U,
      back = fm.back;
    const a = ((head + back) / 2) * tHours,
      b = flank * tHours,
      c = ((head - back) / 2) * tHours;
    const th = Math.PI / 2 - ((wind.dir + 180) * Math.PI) / 180;
    const [cx, cy] = toM(center[0], center[1]);
    const ring: Ring = [];
    for (let i = 0; i <= 72; i++) {
      const phi = (i / 72) * 2 * Math.PI;
      let x = c + a * Math.cos(phi),
        y = b * Math.sin(phi);
      const r = Math.hypot(x, y),
        al = Math.atan2(y, x);
      const m =
        1 +
        fm.noise_amp *
          (0.55 * Math.sin(3 * al + 0.7) +
            0.3 * Math.sin(7 * al + 2.1) +
            0.15 * Math.sin(11 * al + 4.0));
      x = r * m * Math.cos(al);
      y = r * m * Math.sin(al);
      let X = (x * Math.cos(th) - y * Math.sin(th)) * 1000,
        Y = (x * Math.sin(th) + y * Math.cos(th)) * 1000;
      if (actualRing) {
        const ang = Math.atan2(Y, X),
          rr = Math.hypot(X, Y),
          ra = radialMax(center, actualRing, ang) * (1 + 0.04 * tHours) + 60;
        if (ra > rr) {
          X = ra * Math.cos(ang);
          Y = ra * Math.sin(ang);
        }
      }
      ring.push(fromM(cx + X, cy + Y));
    }
    ring[ring.length - 1] = ring[0];
    return ring;
  }
  const buildSlices = (
    center: number[],
    wind: Wind,
    actualRing?: Ring | null,
  ): Ring[] =>
    Array.from({ length: 8 }, (_, i) =>
      firePolygon(center, i + 1, wind, actualRing),
    );
  function circleRing(center: number[], rM = 150): Ring {
    const [cx, cy] = toM(center[0], center[1]);
    const r: Ring = [];
    for (let i = 0; i <= 36; i++) {
      const a = (i / 36) * 2 * Math.PI;
      r.push(fromM(cx + rM * Math.cos(a), cy + rM * Math.sin(a)));
    }
    return r;
  }

  return {
    toM,
    fromM,
    distKm,
    pointInRing,
    pointInGeom,
    ringAreaHa,
    lineSamples,
    lineHitsRing,
    firstSlice,
    dirName,
    radialMax,
    firePolygon,
    buildSlices,
    circleRing,
  };
}
