import { useMockActions } from '../runtime/MockRuntimeProvider';
import { memo } from 'react';
import logo from '../assets/logo.png';

export const LoginScreen = memo(function LoginScreen() {
  const act = useMockActions();
  return (
    <div id="login-overlay">
      <div className="lg-top">
        <img className="lg-logo" src={logo} alt="정부 상징" />
        <div className="lg-org">
          <b>{'산림청'}</b>
          <span>{'Korea Forest Service'}</span>
        </div>
        <span className="lg-sep"></span>
        <div className="lg-sys">
          {' 산불 대응 AI 의사결정 지원 시스템'}
          <small>{'Wildfire Response Decision Support System'}</small>
        </div>
        <div className="lg-right">
          <span>
            {'현재 시각 '}
            <b id="lg-clock" className="num">
              {'—'}
            </b>
            {' KST'}
          </span>
          <span>{'고객센터 1588-4370'}</span>
        </div>
      </div>
      <div className="lg-body">
        <div className="lg-card">
          <div className="lg-left">
            <div className="lg-mark">
              <img src={logo} alt="정부 상징" />
              <div>
                <b>{'산림청'}</b>
                <span>{'Korea Forest Service'}</span>
              </div>
            </div>
            <h2>{'산불 대응 AI 의사결정 지원 시스템'}</h2>
            <p>
              {
                ' 확산 예측 결과를 표준매뉴얼 근거와 연결해 통합지휘권자에게 진화·대피 조치를 제안하는 의사결정 지원 화면입니다. '
              }
            </p>
            <ul className="lg-feat">
              <li>
                {'산불 상황 보고(발화 정보·실측 화선)와 발생·접수 정보 조회'}
              </li>
              <li>{'통합 상황도·1시간 간격 확산 예측(P1~P8)·산불 위험도'}</li>
              <li>
                {
                  ' 진화·대피 대응 제안서, 근거·이력 조회, AI 질의응답·상황 정정 '
                }
              </li>
            </ul>
          </div>
          <div className="lg-form">
            <h1>{'LOGIN'}</h1>
            <div className="lg-note">
              {' 발급받은 계정으로 로그인하십시오. (회원가입 없음) '}
            </div>
            <label>
              {'아이디'}
              <input
                id="login-id"
                defaultValue="cmd01"
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') act('login');
                }}
              />
            </label>
            <label>
              {'비밀번호'}
              <input
                id="login-pw"
                type="password"
                defaultValue="1234"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') act('login');
                }}
              />
            </label>
            <label>
              {'사용자 구분'}
              <select id="login-role" onChange={() => act('fillDemoAccount')}>
                <option value="commander">{'통합지휘권자 — 조작'}</option>
                <option value="viewer">{'열람자 — 열람'}</option>
                <option value="reporter">{'상황 보고자 — 보고'}</option>
                <option value="admin">{'전산 관리자 — 관리'}</option>
              </select>
            </label>
            <div className="lg-err" id="login-err"></div>
            <button
              id="login-btn"
              className="lg-btn"
              onClick={() => act('login')}
            >
              {'로그인'}
            </button>
          </div>
        </div>
        <div className="lg-notice">
          <div className="lg-notice-hd">{'공지사항'}</div>
          <ul>
            <li>
              <span className="num">{'2025-03-21'}</span>
              {
                ' 봄철 산불조심기간 대응단계 판단기준 안내 — 2026년 개편 체계(초기대응·확산대응 1·2단계)로 표시됩니다. '
              }
            </li>
            <li>
              <span className="num">{'2025-03-15'}</span>
              {
                ' 실측 화선 보고 주기 1시간 · 확산 예측은 통합지휘권자가 실행 · 위험구역 5h/잠재 8h 기준 적용 '
              }
            </li>
          </ul>
        </div>
      </div>
      <div className="lg-foot">
        <span>
          {'(35208) 대전광역시 서구 청사로 189 정부대전청사 · 산림청'}
        </span>
        <span>{'Copyright © Korea Forest Service. All rights reserved.'}</span>
      </div>
    </div>
  );
});
