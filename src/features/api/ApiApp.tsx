import { useState } from 'react';
import type { User, UserRole } from '../../api';
import { createApiClientFromEnv, createApiServices } from '../../api';
import { useAction } from './hooks';
import { ActionFeedback } from './ui';
import { Workspace } from './Workspace';
import { AdminWorkspace } from './Management';
import logo from '../../assets/logo.png';
import './api.css';

export const ROLE_LABEL: Record<UserRole, string> = {
  COMMANDER: '통합지휘권자',
  VIEWER: '열람자',
  REPORTER: '상황 보고자',
  ADMIN: '전산 관리자',
};

export default function ApiApp() {
  const [user, setUser] = useState<User | null>(null);
  const [sessionNotice, setSessionNotice] = useState('');
  const [client] = useState(() =>
    createApiClientFromEnv(import.meta.env, {
      onUnauthorized: () => {
        setUser(null);
        setSessionNotice(
          '로그인이 만료되었거나 유효하지 않습니다. 다시 로그인해주세요.',
        );
      },
    }),
  );
  const [api] = useState(() => createApiServices(client));
  const [role, setRole] = useState<UserRole>('COMMANDER');
  const [loginId, setLoginId] = useState(
    client.mode === 'mock' ? 'mock-commander' : '',
  );
  const [password, setPassword] = useState(
    client.mode === 'mock' ? 'mock-password' : '',
  );
  const action = useAction();
  function changeRole(value: UserRole) {
    setRole(value);
    if (client.mode === 'mock') {
      setLoginId(`mock-${value.toLowerCase()}`);
      setPassword('mock-password');
    }
  }
  function logout() {
    void action.run(async (signal) => {
      try {
        await api.auth.logout({ signal });
      } catch {
        setSessionNotice(
          '서버 로그아웃 응답을 받지 못해 이 화면의 로그인 정보를 지웠습니다.',
        );
      } finally {
        client.clearSession();
        setUser(null);
      }
    });
  }
  const context = { client, api, user: user! };
  return (
    <div className="api-app">
      {!user ? (
        <div id="login-overlay">
          <div className="lg-top">
            <img className="lg-logo" src={logo} alt="산림청 상징" />
            <div className="lg-org">
              <b>산림청</b>
              <span>Korea Forest Service</span>
            </div>
            <span className="lg-sep" />
            <div className="lg-sys">
              산불 대응 AI 의사결정 지원 시스템
              <small>Wildfire Response Decision Support System</small>
            </div>
          </div>
          <div className="lg-body">
            <div className="lg-card">
              <div className="lg-left">
                <div className="lg-mark">
                  <img src={logo} alt="" />
                  <div>
                    <b>산림청</b>
                    <span>Korea Forest Service</span>
                  </div>
                </div>
                <h2>산불 대응 AI 의사결정 지원 시스템</h2>
                <p>
                  산불 상황 보고·확산 예측·진화와 대피 대응 제안을 확인합니다.
                </p>
                <ul className="lg-feat">
                  <li>실측 화선 보고와 상황 조회</li>
                  <li>지도·시간별 확산 예측·위험도</li>
                  <li>대응 제안·근거·이력·AI 어시스턴트</li>
                </ul>
              </div>
              <form
                className="lg-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action.run(async (signal) => {
                    setSessionNotice('');
                    try {
                      await api.auth.login({
                        body: { login_id: loginId, password, role },
                        signal,
                      });
                      const me = await api.auth.me({ signal });
                      if (!signal.aborted) setUser(me);
                    } catch (error) {
                      client.clearSession();
                      throw error;
                    }
                  });
                }}
              >
                <h1>LOGIN</h1>
                <p className="lg-note">
                  {client.mode === 'mock'
                    ? '목업 데이터로 동작합니다. 실제 서버에 접속하지 않습니다.'
                    : '발급받은 서버 계정으로 로그인하세요.'}
                </p>
                <label>
                  아이디
                  <input
                    required
                    aria-label="아이디"
                    autoComplete="username"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                  />
                </label>
                <label>
                  비밀번호
                  <input
                    required
                    aria-label="비밀번호"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <label>
                  사용자 구분
                  <select
                    aria-label="사용자 구분"
                    value={role}
                    onChange={(e) => changeRole(e.target.value as UserRole)}
                  >
                    {Object.entries(ROLE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {sessionNotice && <p role="status">{sessionNotice}</p>}
                <ActionFeedback {...action} />
                <button className="lg-btn" disabled={action.pending}>
                  로그인
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : (
        <>
          <header id="top1">
            <div className="sys">
              <img className="logo" src={logo} alt="" />
              <span className="org">산림청</span>
              <span className="vsep" />
              산불 대응 AI 의사결정 지원 시스템
            </div>
            <div className="user">
              <span>
                {user.name} · {ROLE_LABEL[user.role]}
              </span>
              {client.mode === 'mock' && (
                <span className="api-badge">목업 데이터</span>
              )}
              <button disabled={action.pending} onClick={logout}>
                로그아웃
              </button>
            </div>
          </header>
          {user.role === 'ADMIN' ? (
            <AdminWorkspace {...context} />
          ) : (
            <Workspace key={user.id} {...context} />
          )}
        </>
      )}
    </div>
  );
}
