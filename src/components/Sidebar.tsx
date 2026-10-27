import { useMockActions } from '../runtime/MockRuntimeProvider';
import { memo } from 'react';
import { IncidentDrawer } from './IncidentDrawer';
import { IncidentPanel } from './IncidentPanel';
import { ReporterPanel } from './ReporterPanel';

export const Sidebar = memo(function Sidebar() {
  const act = useMockActions();
  return (
    <aside id="side">
      <div id="side-rail">
        <button
          id="wing-fire"
          className="wing"
          title="산불 목록"
          onClick={() => act('toggleIncidents')}
        >
          {'산불'}
        </button>
      </div>
      <div id="side-body">
        <IncidentPanel />
        <ReporterPanel />
        <IncidentDrawer />
      </div>
    </aside>
  );
});
