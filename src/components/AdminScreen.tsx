import { useMockActions } from '../runtime/MockRuntimeProvider';
import { memo } from 'react';
import logo from '../assets/logo.png';

export const AdminScreen = memo(function AdminScreen() {
  const act = useMockActions();
  return (
    <div id="admin-screen">
      <header
        id="admin-top"
        style={{
          height: '40px',
          background: '#fff',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '0 10px',
        }}
      >
        <div
          className="sys"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '15px',
            fontWeight: '800',
            color: '#1c3f88',
          }}
        >
          <img
            src={logo}
            alt=""
            style={{ width: '26px', height: '26px', objectFit: 'contain' }}
          />
          <span
            style={{
              color: '#17325e',
              letterSpacing: '0.08em',
              fontSize: '16px',
            }}
          >
            {'산림청'}
          </span>
          <span
            style={{
              width: '1px',
              height: '18px',
              background: '#cdd3da',
              margin: '0 4px',
            }}
          ></span>
          {'산불 대응 AI 의사결정 지원 시스템 '}
        </div>
        <div className="sclock" title="서버 현재 시각 (한국표준시)">
          {' 현재 시각 '}
          <b id="admin-clock" className="num">
            {'—'}
          </b>
          <span className="tz">{'KST'}</span>
        </div>
        <div
          style={{
            marginLeft: 'auto',
            fontSize: '11.5px',
            color: '#444',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span id="admin-user">{'—'}</span>
          <button
            id="admin-logout"
            className="ibtn"
            title="로그아웃"
            style={{
              width: '24px',
              height: '24px',
              padding: '0',
              justifyContent: 'center',
            }}
            onClick={() => act('logout')}
          >
            <svg viewBox="0 0 24 24">
              <path d="M10 17l5-5-5-5M15 12H3M21 4v16"></path>
            </svg>
          </button>
        </div>
      </header>
      <div id="admin-body">
        <div className="abox">
          <div className="ahd">{' 계정·권한 관리 '}</div>
          <div className="abd" id="admin-accounts"></div>
        </div>
        <div className="abox">
          <div className="ahd">{' 진화자원 데이터 관리 '}</div>
          <div className="abd" id="admin-resources"></div>
        </div>
      </div>
    </div>
  );
});
