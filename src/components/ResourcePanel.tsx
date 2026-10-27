import { useMockActions } from '../runtime/MockRuntimeProvider';
import { memo } from 'react';

export const ResourcePanel = memo(function ResourcePanel() {
  const act = useMockActions();
  return (
    <div id="left-panel" className="fpanel">
      <div className="fhd">
        <span className="clock">{'진화자원 현황'}</span>
        <span style={{ flex: '1' }}></span>
        <button
          className="ibtn"
          id="lp-close"
          onClick={() => act('closeResources')}
        >
          {'✕'}
        </button>
      </div>
      <div className="fbody" id="lp-body"></div>
    </div>
  );
});
