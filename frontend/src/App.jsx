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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <Sidebar tab={tab} setTab={setTab} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <header style={{
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          padding: '14px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>💧</span>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>AquaAlert</h1>
              <p style={{ fontSize: 11, color: '#64748b' }}>National Water Early Warning System</p>
            </div>
          </div>
          <LiveDot />
        </header>

        <main style={{ flex: 1, padding: '20px 28px', overflowY: 'auto' }}>
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

function LiveDot() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: '#22c55e',
        boxShadow: '0 0 0 3px #dcfce7',
        animation: 'pulse 2s infinite',
        display: 'inline-block',
      }} />
      <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 500 }}>Live</span>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}