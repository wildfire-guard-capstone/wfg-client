import { useMockActions } from '../runtime/MockRuntimeProvider';
import { memo } from 'react';

export const IncidentPanel = memo(function IncidentPanel() {
  const act = useMockActions();
  return (
    <section id="info-panel" className="side-pane">
      <div className="sp-hd">
        <span id="ip-name">{'—'}</span>
        <span id="ip-badge"></span>
        <span style={{ flex: '1' }}></span>
        <button
          className="ibtn"
          id="ip-fit"
          title="발화점으로 이동"
          onClick={() => act('goToFire')}
        >
          <svg viewBox="0 0 24 24">
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path>
            <circle cx="12" cy="12" r="4"></circle>
          </svg>
        </button>
      </div>
      <div className="ip-tabs">
        <button
          className="ip-tab on"
          data-tab="status"
          onClick={(e) => act('showTab', e.currentTarget.dataset.tab)}
        >
          {'산불현황'}
        </button>
        <button
          className="ip-tab commander-only"
          data-tab="proposal"
          onClick={(e) => act('showTab', e.currentTarget.dataset.tab)}
        >
          {' 대응제안 '}
        </button>
      </div>
      <div className="sp-body">
        <div id="ipt-status" className="ipt on">
          <div id="st-detail"></div>
          <div className="btnrow" id="st-actions"></div>
        </div>
        <div id="ipt-proposal" className="ipt">
          <div id="prop-warn"></div>
          <div id="prop-meta">{'—'}</div>
          <div id="stage-banner"></div>
          <div className="ptabs">
            <button
              className="ptab on"
              data-axis="진화"
              onClick={(e) => act('setAxis', e.currentTarget)}
            >
              {'진화 (S1~S7)'}
            </button>
            <button
              className="ptab"
              data-axis="대피"
              onClick={(e) => act('setAxis', e.currentTarget)}
            >
              {'대피 (E1~E7)'}
            </button>
          </div>
          <div className="pfilters">
            <button
              className="pfilter on"
              data-f="all"
              onClick={(e) => act('setFilter', e.currentTarget)}
            >
              {'전체'}
            </button>
            <button
              className="pfilter"
              data-f="즉시"
              onClick={(e) => act('setFilter', e.currentTarget)}
            >
              {'즉시'}
            </button>
            <button
              className="pfilter"
              data-f="대기"
              onClick={(e) => act('setFilter', e.currentTarget)}
            >
              {'대기'}
            </button>
            <button
              className="pfilter"
              data-f="협의"
              onClick={(e) => act('setFilter', e.currentTarget)}
            >
              {'협의'}
            </button>
            <button
              className="pfilter"
              data-f="요청"
              onClick={(e) => act('setFilter', e.currentTarget)}
            >
              {'요청'}
            </button>
          </div>
          <div id="cards"></div>
          <div id="prop-summary"></div>
          <details id="hist-box">
            <summary>{'제안서 버전 이력'}</summary>
            <div id="hist-runs"></div>
          </details>
        </div>
      </div>
      <div id="evidence-drawer">
        <div className="hd">
          <h3 id="ev-title">{'근거'}</h3>
          <button
            id="btn-ev-close"
            className="ibtn"
            style={{
              width: '22px',
              height: '22px',
              padding: '0',
              justifyContent: 'center',
            }}
            onClick={() => act('closeEvidence')}
          >
            {' ✕ '}
          </button>
        </div>
        <div id="ev-body"></div>
      </div>
    </section>
  );
});
