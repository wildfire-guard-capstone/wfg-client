import { useMockActions } from '../runtime/MockRuntimeProvider';
import { memo } from 'react';
import logo from '../assets/logo.png';

export const AppHeader = memo(function AppHeader() {
  const act = useMockActions();
  return (
    <header id="top1">
      <div className="sys">
        <img className="logo" src={logo} alt="정부 상징" />
        <span className="org">{'산림청'}</span>
        <span className="vsep"></span>
        {'산불 대응 AI 의사결정 지원 시스템 '}
      </div>
      <div className="sclock" title="서버 현재 시각 (한국표준시)">
        {' 현재 시각 '}
        <b id="hdr-clock" className="num">
          {'—'}
        </b>
        <span className="tz">{'KST'}</span>
      </div>
      <div className="tog">
        <button
          id="btn-resources"
          className="cv-only"
          onClick={() => act('toggleResources')}
        >
          {'진화자원'}
        </button>
      </div>
      <div className="menu">
        <button
          id="btn-log"
          className="red menu-btn commander-only"
          onClick={() => act('toggleLog')}
        >
          {' 이벤트 로그 '}
        </button>
      </div>
      <div className="user">
        <span id="hdr-user">{'—'}</span>
        <button
          id="btn-logout"
          className="ibtn"
          title="로그아웃"
          onClick={() => act('logout')}
        >
          <svg viewBox="0 0 24 24">
            <path d="M10 17l5-5-5-5M15 12H3M21 4v16"></path>
          </svg>
        </button>
      </div>
    </header>
  );
});
