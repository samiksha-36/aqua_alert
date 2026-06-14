import { useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import AlertFeed from './components/AlertFeed.jsx';
import GroundTruthPanel from './components/GroundTruthPanel.jsx';
import GrievanceTracker from './components/GrievanceTracker.jsx';
import StatsBar from './components/StatsBar.jsx';
import useWebSocket from './hooks/useWebSocket.js';
import useAlerts from './hooks/useAlerts.js';
import DistrictMap from './components/DistrictMap.jsx';
import Dashboard from './pages/Dashboard.jsx';

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const { alerts, setAlerts, stats } = useAlerts();
  useWebSocket(setAlerts);

  const TAB_TITLE = {
    dashboard:   'Overview',
    alerts:      'Alert Feed',
    map:         'District Map',
    groundtruth: 'Ground Truth',
    grievances:  'Grievances',
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--canvas)' }}>
      <Sidebar tab={tab} setTab={setTab} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top bar */}
        <header style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          padding: '0 28px',
          height: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              AquaAlert
            </span>
            <span style={{ color: 'var(--border)', fontSize: 16 }}>/</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
              {TAB_TITLE[tab]}
            </span>
          </div>
          <LiveIndicator />
        </header>

        <main style={{ flex: 1, padding: '24px 28px', overflowY: 'auto' }}>
          <StatsBar stats={stats} />
          {tab === 'dashboard'   && <Dashboard alerts={alerts} stats={stats} />}
          {tab === 'alerts'      && <AlertFeed alerts={alerts} />}
          {tab === 'map'         && <DistrictMap alerts={alerts} />}
          {tab === 'groundtruth' && <GroundTruthPanel alerts={alerts} />}
          {tab === 'grievances'  && <GrievanceTracker />}
        </main>
      </div>
    </div>
  );
}

function LiveIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: '#34c759',
        display: 'inline-block',
        animation: 'livePulse 2s ease infinite',
      }} />
      <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 500 }}>Live</span>
    </div>
  );
}