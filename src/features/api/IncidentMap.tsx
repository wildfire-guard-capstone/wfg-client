import { useEffect, useRef, useState } from 'react';
import { Map, NavigationControl } from 'maplibre-gl';
import type {
  GeoJSONSource,
  MapGeoJSONFeature,
  StyleSpecification,
} from 'maplibre-gl';
import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import type { Incident, Perimeter, PredictionSlices } from '../../api';
import type { ScreenContext } from './types';
import { display, errorText, useResource } from './hooks';
import { Feedback } from './ui';
import { useDrawing } from './Drawing';

type Collection = FeatureCollection<Geometry, GeoJsonProperties>;
const empty = (): Collection => ({ type: 'FeatureCollection', features: [] });

export function IncidentMap({
  api,
  incident,
  perimeter,
  slices,
  hour = 5,
}: ScreenContext & {
  incident?: Incident;
  perimeter?: Perimeter;
  slices?: PredictionSlices;
  hour?: number;
}) {
  const container = useRef<HTMLDivElement>(null),
    mapRef = useRef<Map | null>(null);
  const [ready, setReady] = useState(false),
    [mapError, setMapError] = useState('');
  const [styleRevision, setStyleRevision] = useState(0);
  const styleReady = useRef(false),
    baseLayerIds = useRef<string[]>([]);
  const [bbox, setBbox] = useState('128.4,36.2,128.8,36.6');
  const [active, setActive] = useState<string[]>([]),
    [satellite, setSatellite] = useState(false);
  const [showFire, setShowFire] = useState(true),
    [showRisk, setShowRisk] = useState(true),
    [retry, setRetry] = useState(0);
  const [feature, setFeature] = useState<MapGeoJSONFeature | null>(null);
  const drawing = useDrawing(),
    drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const layers = useResource((signal) => api.map.layers({ signal }), [api]);
  const [data, setData] = useState<
    Record<string, { collection: Collection; loading: boolean; error: string }>
  >({});
  useEffect(() => {
    if (layers.data)
      setActive(
        layers.data
          .filter(
            (l) =>
              l.available && ['villages', 'facilities', 'road'].includes(l.id),
          )
          .map((l) => l.id),
      );
  }, [layers.data]);
  useEffect(() => {
    if (!container.current) return;
    let map: Map;
    try {
      map = new Map({
        container: container.current,
        center: [128.6, 36.37],
        zoom: 11.4,
        style: {
          version: 8,
          sources: {
            satellite: {
              type: 'raster',
              tiles: [
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
              ],
              tileSize: 256,
              attribution: 'Imagery: Esri, Maxar, Earthstar Geographics',
            },
          },
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': '#edf0ec' },
            },
            {
              id: 'base-satellite',
              type: 'raster',
              source: 'satellite',
              layout: { visibility: 'none' },
            },
          ],
        },
      });
    } catch {
      setMapError(
        '지도를 시작하지 못했습니다. WebGL 지원을 확인해주세요. 목록·보고 기능은 계속 사용할 수 있습니다.',
      );
      return;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl(), 'top-right');
    const updateBounds = () => {
      const b = map.getBounds();
      const west = Math.max(-180, b.getWest()),
        east = Math.min(180, b.getEast());
      if (west < east)
        setBbox(
          [west, Math.max(-90, b.getSouth()), east, Math.min(90, b.getNorth())]
            .map((v) => v.toFixed(5))
            .join(','),
        );
    };
    map.on('style.load', () => {
      styleReady.current = true;
      baseLayerIds.current = map
        .getStyle()
        .layers.map((l) => l.id)
        .filter((id) => !id.startsWith('api-') && id !== 'base-satellite');
      setStyleRevision((n) => n + 1);
      setReady(true);
      updateBounds();
    });
    map.on('moveend', updateBounds);
    map.on('error', () =>
      setMapError(
        '바탕지도 일부를 불러오지 못했습니다. 인터넷 연결을 확인하세요. API 도형은 별도로 표시합니다.',
      ),
    );
    map.on('click', (event) => {
      if (drawingRef.current.tool !== 'none') {
        drawingRef.current.click([event.lngLat.lng, event.lngLat.lat]);
        return;
      }
      const hit = map
        .queryRenderedFeatures(event.point)
        .find((f) => f.layer.id.startsWith('api-layer-'));
      setFeature(hit ?? null);
    });
    const styleController = new AbortController();
    const styleTimeout = setTimeout(() => styleController.abort(), 6000);
    let disposed = false;
    // Load the original OpenFreeMap basemap without blocking API overlays on a failed tile service.
    void fetch('https://tiles.openfreemap.org/styles/liberty', {
      signal: styleController.signal,
      credentials: 'omit',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Basemap unavailable');
        return (await response.json()) as StyleSpecification;
      })
      .then((style) => {
        if (disposed) return;
        const fallback = map.getStyle();
        styleReady.current = false;
        map.setStyle({
          ...style,
          sources: { ...style.sources, satellite: fallback.sources.satellite },
          layers: [
            ...style.layers,
            {
              id: 'base-satellite',
              type: 'raster',
              source: 'satellite',
              layout: { visibility: 'none' },
            },
          ],
        });
      })
      .catch(() => {
        if (!disposed)
          setMapError(
            '일반지도를 불러오지 못했습니다. API 도형은 계속 표시합니다. 인터넷 연결을 확인하거나 위성영상을 선택하세요.',
          );
      })
      .finally(() => clearTimeout(styleTimeout));
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);
    return () => {
      disposed = true;
      styleController.abort();
      clearTimeout(styleTimeout);
      styleReady.current = false;
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (ready && incident)
      mapRef.current?.flyTo({
        center: incident.ignition_point.coordinates as [number, number],
        zoom: 12,
        duration: 300,
      });
  }, [ready, incident?.id]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !styleReady.current) return;
    for (const id of baseLayerIds.current)
      map.setLayoutProperty(id, 'visibility', satellite ? 'none' : 'visible');
    map.setLayoutProperty(
      'base-satellite',
      'visibility',
      satellite ? 'visible' : 'none',
    );
  }, [ready, satellite, styleRevision]);
  useEffect(() => {
    const controller = new AbortController();
    setData({});
    for (const id of active) {
      setData((d) => ({
        ...d,
        [id]: { collection: empty(), loading: true, error: '' },
      }));
      void (async () => {
        const collection = empty(),
          seen = new Set<string>();
        let cursor: string | undefined;
        for (let page = 0; page < 50; page++) {
          const result = await api.map.features({
            path: { layer_id: id },
            query: { bbox, limit: 1000, cursor },
            signal: controller.signal,
          });
          collection.features.push(...result.features);
          if (!result.has_more) return collection;
          if (!result.next_cursor || seen.has(result.next_cursor))
            throw new Error('지도 응답의 페이지 커서가 유효하지 않습니다.');
          cursor = result.next_cursor;
          seen.add(cursor);
        }
        throw new Error(
          '지도 데이터가 많습니다. 지도를 확대해 다시 조회하세요.',
        );
      })()
        .then((collection) => {
          if (!controller.signal.aborted)
            setData((d) => ({
              ...d,
              [id]: { collection, loading: false, error: '' },
            }));
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setData((d) => ({
              ...d,
              [id]: {
                collection: empty(),
                loading: false,
                error: errorText(error),
              },
            }));
        });
    }
    return () => controller.abort();
  }, [api, bbox, active.join('|'), retry]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !styleReady.current) return;
    function setSource(id: string, collection: Collection, color: string) {
      const source = map!.getSource(id) as GeoJSONSource | undefined;
      if (source) {
        source.setData(collection);
        return;
      }
      map!.addSource(id, { type: 'geojson', data: collection });
      map!.addLayer({
        id: `${id}-fill`,
        type: 'fill',
        source: id,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': color, 'fill-opacity': 0.15 },
      });
      map!.addLayer({
        id: `${id}-line`,
        type: 'line',
        source: id,
        filter: [
          'any',
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'LineString'],
        ],
        paint: { 'line-color': color, 'line-width': 2 },
      });
      map!.addLayer({
        id: `${id}-point`,
        type: 'circle',
        source: id,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-color': color,
          'circle-radius': 5,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff',
        },
      });
    }
    for (const layer of layers.data ?? [])
      setSource(
        `api-layer-${layer.id}`,
        active.includes(layer.id)
          ? (data[layer.id]?.collection ?? empty())
          : empty(),
        '#375d8e',
      );
    const fire = empty();
    if (showFire && incident)
      fire.features.push({
        type: 'Feature',
        properties: {},
        geometry: incident.ignition_point,
      });
    if (showFire && perimeter)
      fire.features.push({
        type: 'Feature',
        properties: {},
        geometry: perimeter.geometry,
      });
    setSource('api-fire', fire, '#a91925');
    setSource(
      'api-prediction',
      {
        type: 'FeatureCollection',
        features: showFire
          ? (slices?.features.filter((f) => f.properties.hour === hour) ?? [])
          : [],
      },
      '#ee5634',
    );
    setSource(
      'api-risk5',
      {
        type: 'FeatureCollection',
        features: showRisk
          ? (slices?.features.filter((f) => f.properties.hour === 5) ?? [])
          : [],
      },
      '#dd970f',
    );
    setSource(
      'api-risk8',
      {
        type: 'FeatureCollection',
        features: showRisk
          ? (slices?.features.filter((f) => f.properties.hour === 8) ?? [])
          : [],
      },
      '#d5be26',
    );
    const draft = empty();
    if (drawing.point)
      draft.features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: drawing.point },
        properties: {},
      });
    if (drawing.geometry)
      draft.features.push({
        type: 'Feature',
        geometry: drawing.geometry,
        properties: {},
      });
    if (drawing.vertices.length > 1)
      draft.features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: drawing.vertices },
        properties: {},
      });
    for (const p of drawing.vertices)
      draft.features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: p },
        properties: {},
      });
    setSource('api-draft', draft, '#743dbb');
  }, [
    ready,
    styleRevision,
    data,
    active,
    layers.data,
    incident,
    perimeter,
    slices,
    hour,
    showFire,
    showRisk,
    drawing.point,
    drawing.geometry,
    drawing.vertices,
  ]);
  return (
    <>
      <div ref={container} className="api-map" aria-label="산불 지도" />
      <div className="api-map-controls">
        <button onClick={() => setSatellite((v) => !v)}>
          {satellite ? '일반지도' : '위성영상'}
        </button>
        <label>
          <input
            type="checkbox"
            checked={showFire}
            onChange={(e) => setShowFire(e.target.checked)}
          />
          화선·P{hour}
        </label>
        <label>
          <input
            type="checkbox"
            checked={showRisk}
            onChange={(e) => setShowRisk(e.target.checked)}
          />
          위험 P5·잠재 P8
        </label>
        <button
          onClick={() => {
            if (incident)
              mapRef.current?.flyTo({
                center: incident.ignition_point.coordinates as [number, number],
                zoom: 12,
              });
          }}
        >
          발화점으로 이동
        </button>
        <details>
          <summary>지도 레이어</summary>
          <Feedback {...layers}>
            {layers.data?.map((layer) => (
              <label key={layer.id}>
                <input
                  type="checkbox"
                  checked={active.includes(layer.id)}
                  disabled={!layer.available}
                  onChange={(e) =>
                    setActive((v) =>
                      e.target.checked
                        ? [...v, layer.id]
                        : v.filter((id) => id !== layer.id),
                    )
                  }
                />
                {layer.name}
                {!layer.available && ' · 자료 미제공'}
              </label>
            ))}
          </Feedback>
          <button onClick={() => setRetry((n) => n + 1)}>
            지도 데이터 새로고침
          </button>
          {Object.entries(data).map(([id, state]) => (
            <p key={id} className={state.error ? 'api-error' : 'api-note'}>
              {layers.data?.find((l) => l.id === id)?.name ?? id}:{' '}
              {state.loading
                ? '조회 중…'
                : state.error || `${state.collection.features.length}개`}
            </p>
          ))}
        </details>
      </div>
      {drawing.tool !== 'none' && (
        <div role="status" className="api-draw-hint">
          {drawing.tool === 'point'
            ? '지도에서 발화 위치를 선택하세요.'
            : `화선 꼭짓점 ${drawing.vertices.length}개 · 3개 이상 선택 후 그리기 완료를 누르세요.`}
        </div>
      )}
      {mapError && (
        <p className="api-map-warning" role="status">
          {mapError}
        </p>
      )}
      {feature && (
        <section className="api-map-feature api-floating">
          <button onClick={() => setFeature(null)}>정보 닫기</button>
          <h3>지도 대상 정보</h3>
          {Object.entries(feature.properties).map(([key, value]) => (
            <p key={key}>
              <b>{key}</b>: {display(value)}
            </p>
          ))}
        </section>
      )}
    </>
  );
}
