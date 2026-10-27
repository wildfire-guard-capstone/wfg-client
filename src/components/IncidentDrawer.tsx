import { useMockActions } from '../runtime/MockRuntimeProvider';
import { memo } from 'react';

export const IncidentDrawer = memo(function IncidentDrawer() {
  const act = useMockActions();
  return (
    <div id="inc-drawer">
      <div className="sp-hd">
        <span>{'산불 목록'}</span>
        <span id="inc-mode"></span>
        <span style={{ flex: '1' }}></span>
        <button
          className="ibtn"
          id="inc-close"
          title="닫기"
          onClick={() => act('closeIncidents')}
        >
          <svg viewBox="0 0 24 24">
            <path d="M6 6l12 12M18 6L6 18"></path>
          </svg>
        </button>
      </div>
      <div className="sp-body" id="inc-list"></div>
    </div>
  );
});
