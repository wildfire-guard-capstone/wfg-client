import { useMockActions } from '../runtime/MockRuntimeProvider';
import { memo } from 'react';

export const EventLogPanel = memo(function EventLogPanel() {
  const act = useMockActions();
  return (
    <div id="log-panel" className="fpanel">
      <div className="fhd">
        <span className="clock">{'이벤트 로그'}</span>
        <span style={{ flex: '1' }}></span>
        <button className="ibtn" id="log-close" onClick={() => act('closeLog')}>
          {'✕'}
        </button>
      </div>
      <div className="fbody" id="hist-events"></div>
    </div>
  );
});
