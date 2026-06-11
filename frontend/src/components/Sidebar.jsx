import { useState } from 'react';

const TABS = [
   { id: 'dashboard',   icon: '🏠', label: 'Dashboard'    },
  { id: 'alerts',      icon: '🚨', label: 'Alert Feed'   },
  { id: 'map',         icon: '🗺️', label: 'District Map' },
  { id: 'groundtruth', icon: '📡', label: 'Ground Truth' },
  { id: 'grievances',  icon: '📋', label: 'Grievances'   },

];

export default function Sidebar({ tab, setTab }) {
  return (
    <aside style={{
      width: 220,
      background: '#fff',
      borderRight: '1px solid #e2e8f0',
      padding: '24px 0',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{ padding: '0 16px 20px', borderBottom: '1px solid #f1f5f9', marginBottom: 8 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Navigation
        </p>
      </div>

      {TABS.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 20px',
          background: tab === t.id ? '#eff6ff' : 'transparent',
          border: 'none', cursor: 'pointer',
          borderRight: tab === t.id ? '3px solid #3b82f6' : '3px solid transparent',
          textAlign: 'left',
          transition: 'all 0.15s',
        }}>
          <span style={{ fontSize: 18 }}>{t.icon}</span>
          <span style={{
            fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? '#1d4ed8' : '#475569',
          }}>{t.label}</span>
        </button>
      ))}

      <div style={{ marginTop: 'auto', padding: '20px 16px 0', borderTop: '1px solid #f1f5f9' }}>
        <DemoTrigger />
      </div>
    </aside>
  );
}

function DemoTrigger() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  async function trigger() {
    setLoading(true);
    setMsg('');
    try {
      const r = await fetch('/api/alerts/demo/trigger', { method: 'POST' });
      const d = await r.json();
      setMsg(d.success ? '✅ Alert triggered!' : '❌ Failed');
    } catch {
      setMsg('❌ Error');
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(''), 3000);
    }
  }

  return (
    <div>
      <button onClick={trigger} disabled={loading} style={{
        width: '100%', padding: '9px 0',
        background: loading ? '#94a3b8' : '#3b82f6',
        color: '#fff', border: 'none', borderRadius: 8,
        fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s',
      }}>
        {loading ? 'Triggering…' : '⚡ Demo Alert'}
      </button>
      {msg && <p style={{ fontSize: 11, color: '#16a34a', marginTop: 6, textAlign: 'center' }}>{msg}</p>}
    </div>
  );
}