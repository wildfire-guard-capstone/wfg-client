import { useMockActions } from '../runtime/MockRuntimeProvider';
import { memo } from 'react';

export const RiskPanel = memo(function RiskPanel() {
  const act = useMockActions();
  return (
    <div id="risk-pop" className="fpanel">
      <div className="fhd">
        <span className="clock">{'산불 위험도'}</span>
        <span style={{ flex: '1' }}></span>
        <button
          className="ibtn"
          id="risk-pop-close"
          onClick={() => act('closeRisk')}
        >
          {'✕'}
        </button>
      </div>
      <div className="fbody" id="risk-pop-body"></div>
    </div>
  );
});
