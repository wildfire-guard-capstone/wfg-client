import { useState } from 'react';
import type { UserCreated, UserRole } from '../../api';
import type { ScreenContext } from './types';
import { date, display, useResource, useAction } from './hooks';
import { ActionFeedback, Empty, Feedback, Fields, Pager } from './ui';

export function ResourcesPanel({
  api,
  user,
  incidentId,
  incident,
}: ScreenContext & { incidentId?: string; incident?: { id: string } }) {
  const id = incidentId ?? incident?.id;
  const [kind, setKind] = useState(''),
    [status, setStatus] = useState('');
  const [cursor, setCursor] = useState<(string | undefined)[]>([undefined]),
    [baseCursor, setBaseCursor] = useState<(string | undefined)[]>([undefined]);
  const context = id ? { incident_id: id } : {};
  const resources = useResource(
    (signal) =>
      api.resources.list({
        query: {
          ...context,
          kind: (kind as 'HELICOPTER' | 'VEHICLE') || undefined,
          status:
            (status as 'AVAILABLE' | 'DEPLOYED' | 'MAINTENANCE') || undefined,
          cursor: cursor.at(-1),
          limit: 20,
        },
        signal,
      }),
    [id, kind, status, cursor.at(-1)],
  );
  const summary = useResource(
    (signal) =>
      api.resources.summary({
        query: {
          ...context,
          kind: (kind as 'HELICOPTER' | 'VEHICLE') || undefined,
        },
        signal,
      }),
    [id, kind],
  );
  const bases = useResource(
    (signal) =>
      api.resources.bases({
        query: { ...context, cursor: baseCursor.at(-1), limit: 20 },
        signal,
      }),
    [id, baseCursor.at(-1)],
  );
  return (
    <>
      <h2>진화자원 현황</h2>
      <div className="api-row">
        <label>
          자원 종류
          <select
            aria-label="자원 종류"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setCursor([undefined]);
            }}
          >
            <option value="">전체</option>
            <option value="HELICOPTER">헬기</option>
            <option value="VEHICLE">차량</option>
          </select>
        </label>
        <label>
          자원 상태
          <select
            aria-label="자원 상태"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setCursor([undefined]);
            }}
          >
            <option value="">전체</option>
            <option value="AVAILABLE">대기</option>
            <option value="DEPLOYED">투입</option>
            <option value="MAINTENANCE">정비</option>
          </select>
        </label>
        <button
          onClick={() => {
            resources.reload();
            summary.reload();
            bases.reload();
          }}
        >
          자원 새로고침
        </button>
      </div>
      <Feedback {...summary}>
        {summary.data && (
          <div className="api-section">
            <h3>상태 집계</h3>
            {summary.data.bases.length ? (
              <table>
                <thead>
                  <tr>
                    <th>기지</th>
                    <th>종류</th>
                    <th>대기</th>
                    <th>투입</th>
                    <th>정비</th>
                    <th>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.data.bases.map((b, i) => (
                    <tr key={`${b.base_id}-${b.kind}-${i}`}>
                      <td>{b.base_id}</td>
                      <td>{b.kind}</td>
                      <td>{display(b.available)}</td>
                      <td>{display(b.deployed)}</td>
                      <td>{display(b.maintenance)}</td>
                      <td>{display(b.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty />
            )}
            <Fields
              values={[
                [
                  '이 산불 투입 헬기',
                  summary.data.incident_deployed?.helicopter?.total,
                ],
                [
                  '이 산불 투입 차량',
                  summary.data.incident_deployed?.vehicle?.total,
                ],
                ['자원 목록 연결 대수', summary.data.incident_linked],
              ]}
            />
          </div>
        )}
      </Feedback>
      <h3>자원 목록</h3>
      <Feedback {...resources}>
        {resources.data?.items.length ? (
          resources.data.items.map((r) => (
            <article className="api-section" key={r.id}>
              <b>{r.name}</b>
              <p>
                {r.kind} · {r.status} · 기지 {r.base_id}
              </p>
              <p>{display(r.attrs)}</p>
            </article>
          ))
        ) : (
          <Empty>조건에 맞는 자원이 없습니다.</Empty>
        )}
        <Pager
          next={resources.data?.next_cursor ?? null}
          back={cursor.length > 1}
          onNext={() => setCursor((c) => [...c, resources.data!.next_cursor!])}
          onBack={() => setCursor((c) => c.slice(0, -1))}
        />
      </Feedback>
      <h3>기지 목록</h3>
      <Feedback {...bases}>
        {bases.data?.items.length ? (
          bases.data.items.map((b) => (
            <article className="api-section" key={b.id}>
              <b>{b.name}</b>
              <p>
                {b.org_type} · {display(b.distance_km)} km ·{' '}
                {display(b.jurisdiction)}
              </p>
            </article>
          ))
        ) : (
          <Empty />
        )}
        <Pager
          next={bases.data?.next_cursor ?? null}
          back={baseCursor.length > 1}
          onNext={() => setBaseCursor((c) => [...c, bases.data!.next_cursor!])}
          onBack={() => setBaseCursor((c) => c.slice(0, -1))}
        />
      </Feedback>
      {user.role === 'ADMIN' && (
        <p className="api-note">
          자원·기지 등록·수정·삭제는 명세 확정 전이므로 조회 기능만
          연결했습니다.
        </p>
      )}
    </>
  );
}

export function LogsPanel({
  api,
  incidentId,
}: ScreenContext & { incidentId?: string }) {
  const [cursor, setCursor] = useState<(string | undefined)[]>([undefined]),
    [action, setAction] = useState('');
  const logs = useResource(
    (signal) =>
      api.events.list({
        query: {
          incident_id: incidentId,
          action: action || undefined,
          cursor: cursor.at(-1),
          limit: 20,
        },
        signal,
      }),
    [incidentId, action, cursor.at(-1)],
  );
  return (
    <>
      <h2>이벤트 로그</h2>
      <form
        className="api-row"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setAction(String(fd.get('action') ?? ''));
          setCursor([undefined]);
          logs.reload();
        }}
      >
        <label>
          이벤트 코드
          <input name="action" aria-label="이벤트 코드" placeholder="전체" />
        </label>
        <button>로그 검색</button>
      </form>
      <Feedback {...logs}>
        {logs.data?.items.length ? (
          logs.data.items.map((e) => (
            <article className="api-section" key={e.id}>
              <b>{e.action}</b>
              <p>
                {date(e.created_at)} · 사용자 {display(e.user_id)}
              </p>
              <p className="api-prewrap">{display(e.details)}</p>
            </article>
          ))
        ) : (
          <Empty>조회된 이벤트가 없습니다.</Empty>
        )}
        <Pager
          next={logs.data?.next_cursor ?? null}
          back={cursor.length > 1}
          onNext={() => setCursor((c) => [...c, logs.data!.next_cursor!])}
          onBack={() => setCursor((c) => c.slice(0, -1))}
        />
      </Feedback>
    </>
  );
}

function UsersPanel({ api }: ScreenContext) {
  const [cursor, setCursor] = useState<(string | undefined)[]>([undefined]),
    [role, setRole] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false),
    [issued, setIssued] = useState<UserCreated | null>(null),
    [createRole, setCreateRole] = useState<UserRole>('VIEWER');
  const action = useAction();
  const users = useResource(
    (signal) =>
      api.users.list({
        query: {
          role: (role as UserRole) || undefined,
          include_deleted: includeDeleted,
          cursor: cursor.at(-1),
          limit: 20,
        },
        signal,
      }),
    [role, includeDeleted, cursor.at(-1)],
  );
  return (
    <>
      <h2>계정·권한 관리</h2>
      <div className="api-row">
        <label>
          계정 역할
          <select
            aria-label="계정 역할"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setCursor([undefined]);
            }}
          >
            <option value="">전체</option>
            {['COMMANDER', 'VIEWER', 'REPORTER', 'ADMIN'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(e) => {
              setIncludeDeleted(e.target.checked);
              setCursor([undefined]);
            }}
          />
          회수된 계정 포함
        </label>
        <button onClick={users.reload}>계정 새로고침</button>
      </div>
      <Feedback {...users}>
        {users.data?.items.length ? (
          <div className="api-scroll">
            <table>
              <thead>
                <tr>
                  <th>아이디</th>
                  <th>이름</th>
                  <th>기관</th>
                  <th>역할</th>
                  <th>관할</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {users.data.items.map((u) => (
                  <tr key={u.id}>
                    <td>{u.login_id}</td>
                    <td>{u.name}</td>
                    <td>{u.organization}</td>
                    <td>{u.role}</td>
                    <td>{display(u.admin_area_id)}</td>
                    <td>{u.deleted_at ? '회수' : '활성'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
        <Pager
          next={users.data?.next_cursor ?? null}
          back={cursor.length > 1}
          onNext={() => setCursor((c) => [...c, users.data!.next_cursor!])}
          onBack={() => setCursor((c) => c.slice(0, -1))}
        />
      </Feedback>
      <section className="api-section">
        <h3>계정 발급</h3>
        <form
          className="api-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              fd = new FormData(form);
            void action.run(async (signal, progress) => {
              const result = await api.users.create({
                body: {
                  login_id: String(fd.get('login_id')),
                  name: String(fd.get('name')),
                  organization: String(fd.get('organization')),
                  role: createRole,
                  admin_area_id:
                    createRole === 'ADMIN'
                      ? null
                      : String(fd.get('admin_area_id')),
                },
                signal,
              });
              if (!signal.aborted) {
                setIssued(result);
                users.reload();
                form.reset();
                progress(
                  '계정을 발급했습니다. 임시 비밀번호를 안전하게 전달하세요.',
                );
              }
            });
          }}
        >
          <label>
            발급 아이디
            <input name="login_id" required maxLength={50} />
          </label>
          <label>
            사용자 이름
            <input name="name" required maxLength={50} />
          </label>
          <label>
            소속 기관
            <input name="organization" required maxLength={100} />
          </label>
          <label>
            발급 역할
            <select
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value as UserRole)}
            >
              {['COMMANDER', 'VIEWER', 'REPORTER', 'ADMIN'].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          {createRole !== 'ADMIN' && (
            <label>
              시군구 관할 ID
              <input name="admin_area_id" required pattern="[0-9]+" />
            </label>
          )}
          <button className="primary" disabled={action.pending}>
            계정 발급
          </button>
        </form>
        <ActionFeedback {...action} />
        {issued && (
          <div role="status" className="api-confirm">
            <p>발급 아이디: {issued.user.login_id}</p>
            <p>
              임시 비밀번호: <code>{issued.temporary_password}</code>
            </p>
            <button onClick={() => setIssued(null)}>비밀번호 표시 닫기</button>
          </div>
        )}
      </section>
      <p className="api-note">
        계정 수정·회수·비밀번호 재발급·잠금 해제는 미확정 명세이므로 아직
        연결하지 않았습니다.
      </p>
    </>
  );
}

export function AdminWorkspace(props: ScreenContext) {
  const [tab, setTab] = useState('users');
  return (
    <main className="api-admin">
      <nav className="api-tabs">
        {[
          ['users', '계정 관리'],
          ['resources', '진화자원'],
          ['logs', '이벤트 로그'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'on' : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <section className="api-admin-content">
        {tab === 'users' ? (
          <UsersPanel {...props} />
        ) : tab === 'resources' ? (
          <ResourcesPanel {...props} />
        ) : (
          <LogsPanel {...props} />
        )}
      </section>
    </main>
  );
}
