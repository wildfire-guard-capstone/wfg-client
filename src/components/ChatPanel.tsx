import { useMockActions } from '../runtime/MockRuntimeProvider';
import { memo } from 'react';

export const ChatPanel = memo(function ChatPanel() {
  const act = useMockActions();
  return (
    <div id="chat-panel" className="fpanel">
      <div className="fhd">
        <span className="clock">{'AI 어시스턴트'}</span>
        <span style={{ flex: '1' }}></span>
        <button
          className="ibtn"
          id="chat-close"
          onClick={() => act('closeChat')}
        >
          {'✕'}
        </button>
      </div>
      <div className="fbody">
        <div id="chat-ctx"></div>
        <div id="chat-log"></div>
        <div className="chat-quick" id="chat-quick"></div>
        <form
          id="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            act('sendChat');
          }}
        >
          <span
            id="chat-status"
            role="status"
            aria-live="polite"
            style={{
              position: 'absolute',
              width: '1px',
              height: '1px',
              padding: '0',
              margin: '-1px',
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              border: '0',
            }}
          ></span>
          <button
            type="button"
            id="btn-corr"
            onClick={() => act('toggleCorrection')}
          >
            {' 상황 정정'}
          </button>
          <input
            id="chat-input"
            placeholder="질문 입력 (상황 변화는 「상황 정정」)"
            autoComplete="off"
          />
          <button id="btn-chat-send" className="primary">
            {'전송'}
          </button>
        </form>
      </div>
    </div>
  );
});
