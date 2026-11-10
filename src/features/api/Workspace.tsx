import { useEffect, useState } from 'react';
import type {
  IncidentStatus,
  InitialPerimeter,
  Operation,
  Perimeter,
  PredictionSlices,
} from '../../api';
import { createIdempotencyKey, waitForOperation } from '../../api';
import type { ScreenContext, IncidentContext } from './types';
import { date, display, useResource, useAction } from './hooks';
import { ActionFeedback, Empty, Feedback, Fields, Pager } from './ui';
import { ProposalPanel } from './ProposalPanel';
import { AssistantPanel } from './AssistantPanel';
import { ResourcesPanel, LogsPanel } from './Management';
import { ReportPanel } from './ReportPanel';
import { IncidentMap } from './IncidentMap';
import { DrawingProvider } from './Drawing';

export function Workspace(context: ScreenContext) {
  return (
    <DrawingProvider>
      <WorkspaceBody {...context} />
    </DrawingProvider>
  );
}
function WorkspaceBody(context: ScreenContext) {
  const { api, user } = context;
  const [filter, setFilter] = useState<IncidentStatus>('IN_PROGRESS');
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState('status');
  const [reportMode, setReportMode] = useState<'new' | null>(null);
  const list = useResource(
    (signal) =>
      api.incidents.list({
        query: { status: filter, limit: 20, cursor: cursors.at(-1) },
        signal,
      }),
    [api, filter, cursors.at(-1)],
  );
  const detail = useResource(
    (signal) => api.incidents.get({ path: { incident_id: selected! }, signal }),
    [api, selected],
    !!selected,
  );
  useEffect(() => {
    if (list.data && !selected && list.data.items[0])
      setSelected(list.data.items[0].id);
  }, [list.data, selected]);
  const refresh = () => {
    list.reload();
    detail.reload();
  };
  const incident = detail.data;
  const tabs =
    user.role === 'REPORTER'
      ? [
          ['status', '산불현황'],
          ['report', '화선 보고·정정'],
        ]
      : [
          ['status', '산불현황'],
          ...(user.role === 'COMMANDER'
            ? [
                ['proposal', '대응제안'],
                ['assistant', 'AI·상황 정정'],
              ]
            : []),
          ['resources', '진화자원'],
          ...(user.role === 'COMMANDER' ? [['logs', '이벤트 로그']] : []),
        ];
  return (
    <>
      <div className="api-workbar">
        <label>
          산불 목록{' '}
          <select
            aria-label="산불 상태"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as IncidentStatus);
              setCursors([undefined]);
              setSelected(null);
            }}
          >
            <option value="IN_PROGRESS">진행 중</option>
            <option value="ENDED">종료</option>
          </select>
        </label>
        <button onClick={refresh}>현황 새로고침</button>
        {user.role === 'REPORTER' && (
          <button
            className="primary"
            onClick={() => {
              setReportMode('new');
              setTab('report');
            }}
          >
            새 산불 보고
          </button>
        )}
      </div>
      <main className="api-layout">
        <aside className="api-sidebar">
          <section className="api-incidents" aria-label="산불 목록">
            <Feedback {...list}>
              {list.data?.items.length ? (
                list.data.items.map((i) => (
                  <button
                    className={`api-incident ${i.id === selected ? 'on' : ''}`}
                    key={i.id}
                    onClick={() => {
                      setSelected(i.id);
                      setReportMode(null);
                    }}
                  >
                    <b>{i.name}</b>
                    <small>
                      {i.status === 'ENDED' ? '종료' : '진행'} · 화선 v
                      {i.current_perimeter_version} ·{' '}
                      {i.needs_reprediction ? '재예측 필요' : '예측 반영'}
                    </small>
                  </button>
                ))
              ) : (
                <Empty>해당 상태의 산불이 없습니다.</Empty>
              )}
              <Pager
                next={list.data?.next_cursor ?? null}
                back={cursors.length > 1}
                onNext={() => {
                  if (list.data?.next_cursor)
                    setCursors((c) => [...c, list.data!.next_cursor!]);
                }}
                onBack={() => setCursors((c) => c.slice(0, -1))}
              />
            </Feedback>
          </section>
          <nav className="api-tabs" aria-label="산불 기능">
            {tabs.map(([id, label]) => (
              <button
                className={tab === id ? 'on' : ''}
                aria-pressed={tab === id}
                key={id}
                onClick={() => {
                  setTab(id);
                  setReportMode(null);
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="api-panel">
            <Feedback {...detail}>
              {reportMode === 'new' ? (
                <ReportPanel
                  key="new"
                  {...context}
                  onSaved={(id) => {
                    setSelected(id);
                    setReportMode(null);
                    setTab('status');
                    refresh();
                  }}
                />
              ) : incident ? (
                <IncidentContent
                  key={`${incident.id}-${tab}`}
                  {...context}
                  incident={incident}
                  refresh={refresh}
                  tab={tab}
                  onSaved={refresh}
                />
              ) : (
                <Empty>조회할 산불을 선택하세요.</Empty>
              )}
            </Feedback>
          </div>
        </aside>
        <section className="api-map-area" aria-label="지도와 예측">
          <Feedback {...detail}>
            {incident ? (
              <MapAndPrediction
                key={incident.id}
                {...context}
                incident={incident}
                refresh={refresh}
              />
            ) : reportMode === 'new' ? (
              <div className="api-map-wrap">
                <IncidentMap {...context} />
              </div>
            ) : (
              <Empty>산불을 선택하면 지도를 표시합니다.</Empty>
            )}
          </Feedback>
        </section>
      </main>
    </>
  );
}

function IncidentContent(
  props: IncidentContext & { tab: string; onSaved: () => void },
) {
  if (props.tab === 'proposal') return <ProposalPanel {...props} />;
  if (props.tab === 'assistant') return <AssistantPanel {...props} />;
  if (props.tab === 'resources') return <ResourcesPanel {...props} />;
  if (props.tab === 'logs')
    return <LogsPanel {...props} incidentId={props.incident.id} />;
  if (props.tab === 'report')
    return <ReportPanel {...props} onSaved={() => props.onSaved()} />;
  return <IncidentStatusPanel {...props} />;
}

function IncidentStatusPanel({
  api,
  user,
  incident,
  refresh,
}: IncidentContext) {
  const [cursor, setCursor] = useState<(string | undefined)[]>([undefined]);
  const versions = useResource(
    (signal) =>
      api.perimeters.list({
        path: { incident_id: incident.id },
        query: { limit: 10, cursor: cursor.at(-1) },
        signal,
      }),
    [incident.id, incident.current_perimeter_id, cursor.at(-1)],
  );
  const [ending, setEnding] = useState(false),
    action = useAction();
  return (
    <>
      <h2>{incident.name}</h2>
      <Fields
        values={[
          ['상태', incident.status === 'ENDED' ? '종료' : '진행 중'],
          ['주소', incident.address],
          ['발생 일시', date(incident.started_at)],
          ['접수 일시', date(incident.reported_at)],
          ['보고 내용', incident.report_text],
          ['신고 기관', incident.reporter_org],
          ['신고자', incident.reporter_name],
          ['연락처', incident.reporter_phone],
          ['현재 단계', incident.current_stage],
          [
            '현재 화선',
            `v${incident.current_perimeter_version}${incident.current_perimeter_version === 0 ? ' (발화점)' : ''}`,
          ],
          ['투입 헬기', incident.situation.deployed?.helicopter?.total],
          ['투입 차량', incident.situation.deployed?.vehicle?.total],
          ['투입 인력', incident.situation.deployed?.crew?.total],
          [
            '예측 갱신',
            incident.needs_reprediction ? '재예측 필요' : '최신 화선 반영',
          ],
          ['제안 갱신', incident.proposal_stale ? '정정 미반영' : '반영됨'],
        ]}
      />
      {user.role === 'COMMANDER' && incident.status !== 'ENDED' && (
        <div className="api-section">
          {!ending ? (
            <button className="red" onClick={() => setEnding(true)}>
              산불 종료
            </button>
          ) : (
            <>
              <p>이 산불을 종료할까요? 종료 후 보고와 정정은 제한됩니다.</p>
              <button
                disabled={action.pending}
                onClick={() =>
                  void action.run(async (signal, progress) => {
                    await api.incidents.end({
                      path: { incident_id: incident.id },
                      body: {
                        expected_perimeter_id: incident.current_perimeter_id,
                      },
                      signal,
                    });
                    if (!signal.aborted) {
                      progress('산불을 종료했습니다.');
                      setEnding(false);
                      refresh();
                    }
                  })
                }
              >
                종료 확인
              </button>
              <button
                disabled={action.pending}
                onClick={() => setEnding(false)}
              >
                취소
              </button>
            </>
          )}
          <ActionFeedback {...action} />
        </div>
      )}
      <h3>화선 버전</h3>
      <Feedback {...versions}>
        {versions.data?.items.length ? (
          versions.data.items.map((p) => (
            <article className="api-section" key={p.id}>
              <b>
                v{p.version_no} ·{' '}
                {p.geometry.type === 'Point' ? '발화점' : '실측 화선'}
              </b>
              <p>
                {date(p.observed_at)} · {display(p.area_ha)} ha{' '}
                {p.corrected_at && '· 정정된 과거 버전'}
              </p>
            </article>
          ))
        ) : (
          <Empty />
        )}
        <Pager
          next={versions.data?.next_cursor ?? null}
          back={cursor.length > 1}
          onNext={() => setCursor((c) => [...c, versions.data!.next_cursor!])}
          onBack={() => setCursor((c) => c.slice(0, -1))}
        />
      </Feedback>
    </>
  );
}

function MapAndPrediction(props: IncidentContext) {
  const { api, client, user, incident, refresh } = props;
  const path = { incident_id: incident.id },
    predictionPath = { ...path, prediction_id: incident.latest_prediction_id! };
  const [hour, setHour] = useState(5),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
  const [recoverJob, setRecoverJob] = useState<string | null>(null);
  const [riskOpen, setRiskOpen] = useState(false),
    action = useAction();
  const prediction = useResource(
    (signal) => api.predictions.get({ path: predictionPath, signal }),
    [incident.id, incident.latest_prediction_id],
    user.role !== 'REPORTER' && !!incident.latest_prediction_id,
  );
  const slices = useResource(
    (signal) => api.predictions.slices({ path: predictionPath, signal }),
    [incident.id, incident.latest_prediction_id],
    user.role !== 'REPORTER' && !!incident.latest_prediction_id,
  );
  const weather = useResource(
    (signal) => api.predictions.weather({ path: predictionPath, signal }),
    [incident.id, incident.latest_prediction_id],
    user.role !== 'REPORTER' && !!incident.latest_prediction_id,
  );
  const risk = useResource(
    (signal) => api.risk.get({ path: predictionPath, signal }),
    [incident.id, incident.latest_prediction_id],
    user.role !== 'REPORTER' && !!incident.latest_prediction_id,
  );
  const now = useResource(
    (signal) => api.weather.now({ path, signal }),
    [incident.id, incident.latest_prediction_id],
    user.role !== 'REPORTER',
  );
  const current = useResource(
    async (signal) =>
      (await api.perimeters.list({ path, query: { limit: 1 }, signal }))
        .items[0] ?? null,
    [incident.id, incident.current_perimeter_id],
  );
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () => setHour((h) => (h >= 8 ? 1 : h + 1)),
      1000 / speed,
    );
    return () => clearInterval(timer);
  }, [playing, speed]);
  useEffect(() => {
    setPlaying(false);
    setHour(5);
  }, [incident.latest_prediction_id]);
  async function observe(
    id: string,
    signal: AbortSignal,
    progress: (text: string) => void,
  ) {
    setRecoverJob(id);
    const result = await waitForOperation(
      client,
      { ...path, operation_id: id },
      {
        signal,
        onUpdate: (op) =>
          progress(
            `예측 작업: ${op.status}${op.stage ? ' · ' + op.stage : ''}`,
          ),
      },
    );
    if (signal.aborted) return;
    setRecoverJob(null);
    refresh();
    if (result.status === 'FAILED')
      throw new Error(
        `예측 작업 실패: ${result.error?.message ?? '정보 없음'} (${result.error?.code ?? 'UNKNOWN'}) · 이전 성공 결과를 유지합니다.`,
      );
    progress('예측 결과를 갱신했습니다.');
  }
  const jobId = recoverJob ?? incident.running_operation_id;
  const shown = slices.data?.features.filter((f) => f.properties.hour === hour);
  return (
    <>
      <div className="api-predbar">
        {user.role === 'COMMANDER' && (
          <>
            <button
              className="primary"
              disabled={
                action.pending || incident.status === 'ENDED' || !!jobId
              }
              onClick={() =>
                void action.run(async (signal, progress) => {
                  const job = await api.predictions.start({
                    path,
                    body: {
                      expected_perimeter_id: incident.current_perimeter_id,
                    },
                    idempotencyKey: createIdempotencyKey(),
                    signal,
                  });
                  if (!signal.aborted) await observe(job.id, signal, progress);
                })
              }
            >
              확산 예측 실행
            </button>
            {jobId && (
              <button
                disabled={action.pending}
                onClick={() =>
                  void action.run((signal, progress) =>
                    observe(jobId, signal, progress),
                  )
                }
              >
                작업 상태 다시 조회
              </button>
            )}
          </>
        )}
        {user.role !== 'REPORTER' && (
          <>
            <button
              aria-label={playing ? '재생 일시정지' : '예측 재생'}
              disabled={!slices.data?.features.length}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? '일시정지' : '재생'}
            </button>
            <label>
              시간{' '}
              <input
                aria-label="예측 시간"
                type="range"
                min="1"
                max="8"
                value={hour}
                onChange={(e) => {
                  setPlaying(false);
                  setHour(Number(e.target.value));
                }}
              />
            </label>
            <b>P{hour}</b>
            <select
              aria-label="재생 속도"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value="1">1×</option>
              <option value="2">2×</option>
              <option value="4">4×</option>
            </select>
            <button onClick={() => setRiskOpen((v) => !v)}>위험도</button>
          </>
        )}
        {incident.needs_reprediction && (
          <span className="api-warn">
            새 화선이 보고되었습니다. 재예측이 필요합니다.
          </span>
        )}
      </div>
      <ActionFeedback {...action} cancel={action.cancel} />
      <div className="api-map-wrap">
        <IncidentMap
          {...props}
          perimeter={current.data ?? undefined}
          slices={slices.data}
          hour={hour}
        />
        {riskOpen && (
          <section className="api-risk api-floating" aria-label="위험도">
            <h3>
              P5 위험도 <button onClick={() => setRiskOpen(false)}>닫기</button>
            </h3>
            <Feedback {...risk}>
              {risk.data ? (
                <>
                  <Fields
                    values={[
                      [
                        '점수',
                        risk.data.score == null
                          ? null
                          : risk.data.score.toFixed(2),
                      ],
                      ['등급', risk.data.grade],
                      ['상태', risk.data.status],
                    ]}
                  />
                  <p>{risk.data.unavailable_reasons.join(' · ')}</p>
                  <table>
                    <thead>
                      <tr>
                        <th>변수</th>
                        <th>원자료</th>
                        <th>등급</th>
                        <th>비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {risk.data.factors.map((f) => (
                        <tr key={f.code}>
                          <td>{f.name}</td>
                          <td>{display(f.raw_value)}</td>
                          <td>{display(f.grade)}</td>
                          <td>{f.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <Empty>위험도 정보가 없습니다.</Empty>
              )}
            </Feedback>
          </section>
        )}
      </div>
      {user.role !== 'REPORTER' && (
        <div className="api-weather">
          <details open>
            <summary>예측·기상 정보</summary>
            <Feedback {...prediction}>
              {prediction.data ? (
                <p>
                  예측 기준 {date(prediction.data.base_at)} · 화선 v
                  {prediction.data.perimeter_version} · P{hour}{' '}
                  {display(shown?.[0]?.properties.area_ha)} ha
                </p>
              ) : (
                <Empty>아직 성공한 예측이 없습니다.</Empty>
              )}
            </Feedback>
            <Feedback {...slices}>
              {slices.data && !slices.data.features.length && (
                <Empty>예측 도형이 없습니다.</Empty>
              )}
            </Feedback>
            <Feedback {...now}>
              {now.data && (
                <p>
                  지금 날씨: 풍속 {display(now.data.wind_speed)} m/s · 기온{' '}
                  {display(now.data.temp)} ℃ · 습도 {display(now.data.humidity)}{' '}
                  % · 강수 {display(now.data.precip)} mm ·{' '}
                  {date(now.data.observed_at)}{' '}
                  {now.data.stale && '· 오래된 정보'}{' '}
                  <button onClick={now.reload}>날씨 갱신</button>
                </p>
              )}
            </Feedback>
            <Feedback {...weather}>
              {weather.data && (
                <>
                  <p>
                    예측 사용 기상 · {weather.data.source} · 한 지점 값을 전체
                    예측 범위에 적용
                  </p>
                  <div className="api-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>시각</th>
                          <th>구분</th>
                          <th>풍향(°)</th>
                          <th>풍속(m/s)</th>
                          <th>기온(℃)</th>
                          <th>습도(%)</th>
                          <th>강수(mm)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weather.data.hours.map((h) => (
                          <tr key={h.at}>
                            <td>{date(h.at)}</td>
                            <td>{display(h.kind)}</td>
                            <td>{display(h.wind_dir)}</td>
                            <td>{display(h.wind_speed)}</td>
                            <td>{display(h.temp)}</td>
                            <td>{display(h.humidity)}</td>
                            <td>{display(h.precip)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Feedback>
          </details>
        </div>
      )}
    </>
  );
}
