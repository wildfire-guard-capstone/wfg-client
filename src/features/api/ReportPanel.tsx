import { useEffect, useRef, useState } from 'react';
import type { InitialPerimeter, Incident } from '../../api';
import { createIdempotencyKey } from '../../api';
import type { ScreenContext } from './types';
import { useAction } from './hooks';
import { ActionFeedback } from './ui';
import { useDrawing } from './Drawing';
import { parsePerimeterGeometry } from './geometry';

const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export function ReportPanel({
  api,
  incident,
  onSaved,
}: ScreenContext & { incident?: Incident; onSaved: (id: string) => void }) {
  const drawing = useDrawing(),
    action = useAction();
  const [mode, setMode] = useState<'report' | 'correct'>('report');
  const [observed, setObserved] = useState(localNow),
    [geojson, setGeojson] = useState('');
  const [geometryError, setGeometryError] = useState('');
  const [longitude, setLongitude] = useState(''),
    [latitude, setLatitude] = useState('');
  const attempt = useRef<{ body: string; key: string } | null>(null);
  useEffect(() => {
    drawing.reset(
      incident
        ? (incident.ignition_point.coordinates as [number, number])
        : null,
    );
    setGeojson('');
    setGeometryError('');
    setLongitude(
      incident ? String(incident.ignition_point.coordinates[0]) : '',
    );
    setLatitude(incident ? String(incident.ignition_point.coordinates[1]) : '');
    attempt.current = null;
    return () => drawing.reset();
  }, [incident?.id, incident?.current_perimeter_id]);
  useEffect(() => {
    if (
      drawing.point &&
      (longitude === '' ||
        latitude === '' ||
        Number(longitude) !== drawing.point[0] ||
        Number(latitude) !== drawing.point[1])
    ) {
      setLongitude(String(drawing.point[0]));
      setLatitude(String(drawing.point[1]));
    }
  }, [drawing.point]);
  function coordinateInput(lng: string, lat: string) {
    setLongitude(lng);
    setLatitude(lat);
    drawing.setPoint(
      lng.trim() &&
        lat.trim() &&
        Number.isFinite(Number(lng)) &&
        Number.isFinite(Number(lat)) &&
        Math.abs(Number(lng)) <= 180 &&
        Math.abs(Number(lat)) <= 90
        ? [Number(lng), Number(lat)]
        : null,
    );
  }
  const ended = incident?.status === 'ENDED';
  function readGeometry() {
    try {
      const g = parsePerimeterGeometry(geojson);
      drawing.setGeometry(g);
      drawing.setTool('none');
      setGeometryError('');
    } catch (error) {
      drawing.setGeometry(null);
      setGeometryError(
        error instanceof Error ? error.message : 'GeoJSON 형식을 확인하세요.',
      );
    }
  }
  return (
    <>
      <h2>{incident ? '실측 화선 보고·정정' : '새 산불 보고'}</h2>
      {incident && (
        <p>
          {incident.name} · 현재 화선 v{incident.current_perimeter_version}
        </p>
      )}
      {ended && (
        <p className="api-warn">종료된 산불은 보고·정정을 받지 않습니다.</p>
      )}
      <form
        className="api-form"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          void action.run(async (signal, progress) => {
            const observedAt = new Date(observed).toISOString();
            const perimeter: InitialPerimeter | undefined = drawing.geometry
              ? { geometry: drawing.geometry, observed_at: observedAt }
              : undefined;
            let body: object;
            if (!incident) {
              if (!drawing.point || !drawing.point.every(Number.isFinite))
                throw new Error(
                  '발화 위치 경도·위도를 입력하거나 지도에서 지정하세요.',
                );
              body = {
                ignition_point: { type: 'Point', coordinates: drawing.point },
                address: String(fd.get('address')),
                reported_at: new Date(
                  String(fd.get('reported_at')),
                ).toISOString(),
                reporter_name: String(fd.get('reporter_name')),
                reporter_phone: String(fd.get('reporter_phone')),
                reporter_org: String(fd.get('reporter_org') ?? '') || null,
                report_text: String(fd.get('report_text') ?? '') || null,
                started_at: fd.get('started_at')
                  ? new Date(String(fd.get('started_at'))).toISOString()
                  : null,
                ...(perimeter ? { initial_perimeter: perimeter } : {}),
              };
            } else {
              if (!perimeter)
                throw new Error(
                  '제출할 실측 화선을 그리거나 GeoJSON으로 입력하세요.',
                );
              body = {
                ...perimeter,
                ...(mode === 'report'
                  ? { expected_perimeter_id: incident.current_perimeter_id }
                  : {}),
              };
            }
            const fingerprint = JSON.stringify({
              mode,
              incident: incident?.id,
              body,
            });
            if (attempt.current?.body !== fingerprint)
              attempt.current = {
                body: fingerprint,
                key: createIdempotencyKey(),
              };
            const idempotencyKey = attempt.current!.key;
            let id: string;
            if (!incident) {
              const saved = await api.incidents.report({
                body: body as Parameters<
                  typeof api.incidents.report
                >[0]['body'],
                idempotencyKey,
                signal,
              });
              id = saved.id;
            } else if (mode === 'correct') {
              await api.perimeters.correct({
                path: {
                  incident_id: incident.id,
                  perimeter_id: incident.current_perimeter_id,
                },
                body: perimeter!,
                idempotencyKey,
                signal,
              });
              id = incident.id;
            } else {
              await api.perimeters.report({
                path: { incident_id: incident.id },
                body: {
                  ...perimeter!,
                  expected_perimeter_id: incident.current_perimeter_id,
                },
                idempotencyKey,
                signal,
              });
              id = incident.id;
            }
            if (!signal.aborted) {
              attempt.current = null;
              progress(
                '보고를 저장했습니다. 새 화선 이후에는 지휘권자가 재예측해야 합니다.',
              );
              onSaved(id);
            }
          });
        }}
      >
        <fieldset disabled={ended || action.pending}>
          {!incident ? (
            <>
              <label>
                발생 장소(주소)
                <input name="address" required maxLength={200} />
              </label>
              <div className="api-row">
                <label>
                  발화 위치 경도
                  <input
                    aria-label="발화 위치 경도"
                    type="number"
                    required
                    min="-180"
                    max="180"
                    step="any"
                    value={longitude}
                    onChange={(e) => coordinateInput(e.target.value, latitude)}
                  />
                </label>
                <label>
                  발화 위치 위도
                  <input
                    aria-label="발화 위치 위도"
                    type="number"
                    required
                    min="-90"
                    max="90"
                    step="any"
                    value={latitude}
                    onChange={(e) => coordinateInput(longitude, e.target.value)}
                  />
                </label>
              </div>
              <button type="button" onClick={() => drawing.setTool('point')}>
                지도에서 발화 위치 지정
              </button>
              <label>
                발생 일시
                <input name="started_at" type="datetime-local" />
              </label>
              <label>
                신고 접수 일시
                <input
                  name="reported_at"
                  type="datetime-local"
                  required
                  defaultValue={localNow()}
                />
              </label>
              <label>
                신고 내용
                <textarea name="report_text" />
              </label>
              <label>
                신고 기관명
                <input name="reporter_org" maxLength={100} />
              </label>
              <label>
                신고자 성명
                <input name="reporter_name" required maxLength={50} />
              </label>
              <label>
                연락처
                <input
                  name="reporter_phone"
                  required
                  type="tel"
                  maxLength={20}
                />
              </label>
            </>
          ) : (
            <label>
              제출 구분
              <select
                aria-label="제출 구분"
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value as 'report' | 'correct')
                }
              >
                <option value="report">새 실측 화선 보고</option>
                <option
                  value="correct"
                  disabled={incident.current_perimeter_version === 0}
                >
                  현재 화선 정정
                </option>
              </select>
            </label>
          )}
          <h3>실측 화선 {!incident && '(선택)'}</h3>
          <label>
            화선 관측 일시
            <input
              aria-label="화선 관측 일시"
              type="datetime-local"
              required
              value={observed}
              onChange={(e) => setObserved(e.target.value)}
            />
          </label>
          <div className="api-row">
            <button
              type="button"
              onClick={() => {
                drawing.setVertices([]);
                drawing.setGeometry(null);
                drawing.setTool('polygon');
              }}
            >
              지도에서 화선 그리기
            </button>
            <button
              type="button"
              disabled={
                drawing.vertices.length < 3 || drawing.tool !== 'polygon'
              }
              onClick={drawing.finish}
            >
              그리기 완료
            </button>
            <button
              type="button"
              onClick={() => {
                drawing.setGeometry(null);
                drawing.setVertices([]);
                drawing.setTool('none');
                setGeojson('');
              }}
            >
              화선 지우기
            </button>
          </div>
          <p role="status">
            {drawing.tool === 'polygon'
              ? `지도에서 꼭짓점을 선택하세요. ${drawing.vertices.length}개 지정`
              : drawing.tool === 'point'
                ? '지도에서 발화 위치를 클릭하세요.'
                : drawing.geometry
                  ? '제출할 화선이 준비되었습니다.'
                  : '제출할 새 화선 없음'}
          </p>
          <details>
            <summary>GeoJSON으로 화선 입력</summary>
            <label>
              화선 GeoJSON
              <textarea
                aria-label="화선 GeoJSON"
                value={geojson}
                onChange={(e) => setGeojson(e.target.value)}
                placeholder='{"type":"Polygon","coordinates":[...]}'
              />
            </label>
            <button type="button" onClick={readGeometry}>
              GeoJSON 적용
            </button>
            {geometryError && (
              <p role="alert" className="api-error">
                {geometryError}
              </p>
            )}
          </details>
          <button className="primary">보고 저장</button>
        </fieldset>
      </form>
      <ActionFeedback {...action} />
      <p className="api-note">
        산불명은 서버가 정합니다. 기관별 접수 기록·산불 병합은 확정된 요청
        필드에 포함되지 않아 전송하지 않습니다.
      </p>
    </>
  );
}
