import { useMockActions } from '../runtime/MockRuntimeProvider';
import { memo } from 'react';
import { ChatPanel } from './ChatPanel';
import { EventLogPanel } from './EventLogPanel';
import { ResourcePanel } from './ResourcePanel';
import { RiskPanel } from './RiskPanel';

export const MapStage = memo(function MapStage() {
  const act = useMockActions();
  return (
    <div id="stage">
      <div id="map"></div>
      <div id="draw-hint"></div>
      <div id="compass" title="북쪽 맞춤" onClick={() => act('north')}>
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="#999"></circle>
          <polygon points="50,8 56,50 50,44 44,50" fill="#d0342c"></polygon>
          <polygon points="50,92 56,50 50,56 44,50" fill="#555"></polygon>
          <polygon points="8,50 50,44 44,50 50,56" fill="#777"></polygon>
          <polygon points="92,50 50,44 56,50 50,56" fill="#777"></polygon>
          <text
            x="50"
            y="7"
            fontSize="10"
            textAnchor="middle"
            fill="#222"
            fontWeight="700"
          >
            {' 북 '}
          </text>
          <text x="50" y="99" fontSize="10" textAnchor="middle" fill="#222">
            {' 남 '}
          </text>
          <text x="4" y="53" fontSize="10" fill="#222">
            {'서'}
          </text>
          <text x="90" y="53" fontSize="10" fill="#222">
            {'동'}
          </text>
        </svg>
      </div>
      <div id="tool-strip">
        <button
          className="ibtn"
          id="ts-zoom-in"
          title="확대"
          onClick={() => act('zoomIn')}
        >
          <svg viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14"></path>
          </svg>
        </button>
        <div className="zoom">
          <input
            id="ts-zoom"
            type="range"
            min="8"
            max="16"
            step="0.1"
            defaultValue="11.4"
            title="축척"
            onInput={(e) => act('setZoom', e.currentTarget.value)}
          />
        </div>
        <button
          className="ibtn"
          id="ts-zoom-out"
          title="축소"
          onClick={() => act('zoomOut')}
        >
          <svg viewBox="0 0 24 24">
            <path d="M5 12h14"></path>
          </svg>
        </button>
        <button
          className="ibtn"
          id="ts-fit"
          title="범위 맞춤"
          onClick={() => act('fitAll')}
        >
          <svg viewBox="0 0 24 24">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"></path>
          </svg>
        </button>
        <button
          className="ibtn"
          id="ts-sat"
          title="위성영상/일반지도"
          onClick={() => act('toggleBasemap')}
        >
          <svg viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="16" rx="2"></rect>
            <path d="M3 15l5-5 4 4 3-3 6 6"></path>
          </svg>
        </button>
      </div>
      <button
        id="risk-box"
        className="cv-only"
        title="산불 위험도"
        aria-label="산불 위험도"
        onClick={() => act('openRisk')}
      ></button>
      <RiskPanel />
      <ChatPanel />
      <ResourcePanel />
      <EventLogPanel />
      <button
        id="chat-fab"
        className="commander-only"
        onClick={() => act('openChat')}
      >
        <svg viewBox="0 0 24 24">
          <path d="M4 5h16v11H8l-4 4z"></path>
        </svg>
        {'AI 어시스턴트 '}
      </button>
      <div id="coord">{'—'}</div>
    </div>
  );
});
