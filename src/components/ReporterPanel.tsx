import { useMockActions } from '../runtime/MockRuntimeProvider';
import { memo } from 'react';

export const ReporterPanel = memo(function ReporterPanel() {
  const act = useMockActions();
  return (
    <section
      id="rep-panel"
      className="side-pane"
      onInput={(e) => act('clearInvalid', e.target as HTMLElement)}
    >
      <div className="sp-hd">
        <span>{'상황 입력 판'}</span>
      </div>
      <div className="sp-body">
        <div className="btnrow">
          <button
            id="rep-new"
            className="primary"
            style={{ flex: '1', justifyContent: 'center' }}
            onClick={() => act('newReport')}
          >
            {' 새 산불 보고'}
          </button>
          <button
            id="rep-perim"
            style={{ flex: '1', justifyContent: 'center' }}
            onClick={() => act('startPerimReport')}
          >
            {' 실측 화선 보고 '}
          </button>
        </div>
        <div className="sec" id="rep-form-title">
          {'발화 정보'}
        </div>
        <div id="rep-closed-note" style={{ display: 'none' }}>
          {' 종료 처리된 산불입니다. 상황 보고를 받지 않습니다. '}
        </div>
        <div className="form">
          <label className="w">
            {'산불명 *'}
            <input id="rep-name" />
          </label>
          <label className="w">
            {'발생 장소(주소) *'}
            <input id="rep-addr" />
          </label>
          <label>
            {'발화 위치 경도 *'}
            <input
              id="rep-lng"
              type="number"
              step="0.00001"
              onInput={() => act('updateCoordinates')}
            />
          </label>
          <label>
            {'발화 위치 위도 *'}
            <input
              id="rep-lat"
              type="number"
              step="0.00001"
              onInput={() => act('updateCoordinates')}
            />
          </label>
          <label className="w">
            <span></span>
            <button
              id="rep-pick"
              style={{ justifyContent: 'center' }}
              onClick={() => act('togglePick')}
            >
              {' 지도에서 발화 위치 지정 '}
            </button>
          </label>
          <label>
            {'발생 일시'}
            <input id="rep-start" type="datetime-local" />
          </label>
          <label>
            {'신고 접수 일시 *'}
            <input id="rep-report" type="datetime-local" />
          </label>
          <label className="w">
            {'신고 내용'}
            <textarea id="rep-text"></textarea>
          </label>
        </div>
        <div className="sec">{' 신고자 정보 '}</div>
        <div className="form">
          <label className="w">
            {'신고 기관명'}
            <input
              id="rep-corg"
              placeholder="기관이 신고한 경우(예: 의성군 산림과)"
            />
          </label>
          <label>
            {'신고자 성명'}
            <input id="rep-cname" />
          </label>
          <label>
            {'연락처'}
            <input id="rep-cphone" type="tel" placeholder="예: 010-0000-0000" />
          </label>
        </div>
        <div className="sec">{' 기관별 접수 기록 '}</div>
        <div id="rep-intake"></div>
        <div className="intake-add">
          <input id="ik-org" placeholder="접수 기관" />
          <input id="ik-at" type="time" />
          <input id="ik-ch" placeholder="접수 경로(예: 119 신고)" />
          <button id="ik-add" onClick={() => act('addIntakeRow')}>
            {'추가'}
          </button>
        </div>
        <div className="sec">{' 실측 화선(폴리곤) '}</div>
        <div id="rep-perim-cur"></div>
        <div className="btnrow">
          <button id="rep-draw" onClick={() => act('toggleDraw')}>
            {'지도에서 그리기'}
          </button>
          <button id="rep-draw-done" disabled onClick={() => act('finishDraw')}>
            {'그리기 완료'}
          </button>
          <button id="rep-draw-clear" onClick={() => act('clearDraw')}>
            {'지우기'}
          </button>
          <button id="rep-geojson" onClick={() => act('openGeoJson')}>
            {'GeoJSON 붙여넣기'}
          </button>
        </div>
        <div id="rep-poly-info">{'제출할 새 화선 없음'}</div>
        <div id="rep-perim-mode"></div>
        <div className="btnrow" style={{ marginTop: '8px' }}>
          <button
            id="rep-save"
            className="primary"
            style={{ flex: '1', justifyContent: 'center' }}
            onClick={() => act('saveReport')}
          >
            {' 저장(제출) '}
          </button>
        </div>
      </div>
    </section>
  );
});
