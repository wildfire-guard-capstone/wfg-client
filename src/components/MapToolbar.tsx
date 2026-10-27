import { useMockActions } from '../runtime/MockRuntimeProvider';
import { memo } from 'react';

export const MapToolbar = memo(function MapToolbar() {
  const act = useMockActions();
  return (
    <div id="top2">
      <div className="lg">
        <span className="cap">{'예측'}</span>
        <button
          className="blue lyr-btn"
          data-layer="fire"
          title="실측 화선(진홍 면) · 재생 시각까지의 예측 확산 범위(빨강) · 다음 1시간(주황 점선)"
          onClick={(e) => act('toggleLayer', e.currentTarget)}
        >
          <i className="sw sw-fire"></i>
          {'화선'}
        </button>
        <button
          className="blue lyr-btn"
          data-layer="risk"
          title="위험구역 P5(주황 면) · 잠재 위험구역 P8(노랑 점선)"
          onClick={(e) => act('toggleLayer', e.currentTarget)}
        >
          <i className="sw sw-risk"></i>
          {'위험구역'}
        </button>
      </div>
      <div className="lg">
        <span className="cap">{'인구'}</span>
        <button
          className="blue lyr-btn"
          data-layer="villages"
          title="마을(화선이 닿으면 빨강)"
          onClick={(e) => act('toggleLayer', e.currentTarget)}
        >
          <i className="sw sw-village"></i>
          {'마을'}
        </button>
        <button
          className="blue lyr-btn off"
          data-layer="houses"
          title="주택(점)"
          onClick={(e) => act('toggleLayer', e.currentTarget)}
        >
          <i className="sw sw-house"></i>
          {'주택'}
        </button>
      </div>
      <div className="lg">
        <span className="cap">{'시설'}</span>
        <button
          className="blue lyr-btn"
          data-layer="care"
          title="요양·장애인 시설 등 취약시설"
          onClick={(e) => act('toggleLayer', e.currentTarget)}
        >
          <i className="sw sw-care"></i>
          {'취약시설'}
        </button>
        <button
          className="blue lyr-btn"
          data-layer="heritage"
          title="국가유산(사찰 등)"
          onClick={(e) => act('toggleLayer', e.currentTarget)}
        >
          <i className="sw sw-heritage"></i>
          {'국가유산'}
        </button>
        <button
          className="blue lyr-btn"
          data-layer="shelters"
          title="대피소(확산 범위 안이면 빨강)"
          onClick={(e) => act('toggleLayer', e.currentTarget)}
        >
          <i className="sw sw-shelter"></i>
          {'대피소'}
        </button>
        <button
          className="blue lyr-btn"
          data-layer="water"
          title="헬기 담수지"
          onClick={(e) => act('toggleLayer', e.currentTarget)}
        >
          <i className="sw sw-water"></i>
          {'담수지'}
        </button>
        <button
          className="blue lyr-btn"
          data-layer="power"
          title="송전선(노랑 점선)"
          onClick={(e) => act('toggleLayer', e.currentTarget)}
        >
          <i className="sw sw-power"></i>
          {'송전선'}
        </button>
        <button
          className="blue lyr-btn"
          data-layer="agencies"
          title="소방·경찰·군청·한전 등 유관기관"
          onClick={(e) => act('toggleLayer', e.currentTarget)}
        >
          <i className="sw sw-agency"></i>
          {'유관기관'}
        </button>
      </div>
      <div className="lg">
        <span className="cap">{'도로'}</span>
        <button
          className="blue lyr-btn"
          data-layer="roads"
          title="도로(고속도로 주황 · 주요 도로 노랑 · 기타 흰색)"
          onClick={(e) => act('toggleLayer', e.currentTarget)}
        >
          <i className="sw sw-road"></i>
          {'도로'}
        </button>
        <button
          className="blue lyr-btn off"
          data-layer="rail"
          title="철도(회색 점선)"
          onClick={(e) => act('toggleLayer', e.currentTarget)}
        >
          <i className="sw sw-rail"></i>
          {'철도'}
        </button>
        <button
          className="blue lyr-btn"
          data-layer="routes"
          title="대피로(파랑) · 진화차량 진입로(흰 점선) · 둘이 겹치는 구간(빨강)"
          onClick={(e) => act('toggleLayer', e.currentTarget)}
        >
          <i className="sw sw-route"></i>
          {'대피로'}
        </button>
      </div>
      <div id="pred-bar" className="cv-only">
        <button
          id="btn-predict"
          className="primary commander-only"
          onClick={() => act('predict')}
        >
          {' 확산 예측 실행 '}
        </button>
        <span id="pred-warn"></span>
        <span id="pred-note" className="commander-only"></span>
        <div id="playbar">
          <button
            id="btn-play"
            className="ibtn primary"
            title="재생"
            onClick={() => act('play')}
          >
            <svg viewBox="0 0 24 24">
              <path
                d="M7 5l12 7-12 7z"
                fill="currentColor"
                stroke="none"
              ></path>
            </svg>
          </button>
          <button
            id="btn-stop"
            className="ibtn"
            title="처음으로"
            onClick={() => act('stop')}
          >
            <svg viewBox="0 0 24 24">
              <rect
                x="6"
                y="6"
                width="12"
                height="12"
                fill="currentColor"
                stroke="none"
              ></rect>
            </svg>
          </button>
          <input
            id="time-slider"
            type="range"
            min="0"
            max="8"
            step="1"
            defaultValue="0"
            title="시간별 확산 재생"
            onInput={(e) => act('setTime', e.currentTarget.value)}
          />
          <div id="time-label" className="num">
            {'—'}
          </div>
          <select id="speed-sel" title="재생 속도" defaultValue="2">
            <option value="1">{'1×'}</option>
            <option value="2">{'2×'}</option>
            <option value="4">{'4×'}</option>
          </select>
        </div>
      </div>
    </div>
  );
});
