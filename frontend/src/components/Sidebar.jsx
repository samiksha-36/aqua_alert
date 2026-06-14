import { useState } from 'react';

const TABS = [
  { id: 'dashboard',   label: 'Overview',      icon: IconGrid    },
  { id: 'alerts',      label: 'Alert Feed',    icon: IconBell    },
  { id: 'map',         label: 'District Map',  icon: IconMap     },
  { id: 'groundtruth', label: 'Ground Truth',  icon: IconSignal  },
  { id: 'grievances',  label: 'Grievances',    icon: IconClip    },
];

export default function Sidebar({ tab, setTab }) {
  return (
    <aside style={{
      width: 210,
      background: 'var(--navy)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Brand */}
      <div style={{
        padding: '18px 20px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'var(--blue)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C12 2 4 8.5 4 14a8 8 0 0 0 16 0C20 8.5 12 2 12 2z" fill="white"/>
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '-0.2px' }}>AquaAlert</p>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Early Warning</p>
          </div>
        </div>
      </div>

      {/* Nav label */}
      <div style={{ padding: '16px 20px 8px' }}>
        <p style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Navigation
        </p>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '0 10px' }}>
        {TABS.map(t => {
          const active = tab === t.id;
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '8px 10px',
              background: active ? 'rgba(26,86,219,0.2)' : 'transparent',
              border: 'none',
              borderLeft: active ? '2px solid var(--blue)' : '2px solid transparent',
              borderRadius: active ? '0 6px 6px 0' : '6px',
              cursor: 'pointer',
              marginBottom: 2,
              textAlign: 'left',
              transition: 'all 0.12s',
            }}>
              <Icon size={15} color={active ? '#7ba7f7' : 'rgba(255,255,255,0.35)'} />
              <span style={{
                fontSize: 12.5,
                fontWeight: active ? 600 : 400,
                color: active ? '#dce8ff' : 'rgba(255,255,255,0.5)',
              }}>
                {t.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Demo trigger */}
      <div style={{ padding: '16px 14px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <p style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
          Demo
        </p>
        <DemoTrigger />
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', lineHeight: 1.6 }}>
          NIT Jalandhar · 2026<br />
          Open-Meteo · GloFAS · Gemini
        </p>
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
      const r = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/alerts/demo/trigger`, { method: 'POST' });
      const d = await r.json();
      setMsg(d.success ? 'Alert triggered' : 'Failed');
    } catch {
      setMsg('Connection error');
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(''), 3500);
    }
  }

  return (
    <div>
      <button onClick={trigger} disabled={loading} style={{
        width: '100%', padding: '8px 0',
        background: loading ? 'rgba(255,255,255,0.06)' : 'rgba(26,86,219,0.5)',
        color: loading ? 'rgba(255,255,255,0.3)' : '#c8d9ff',
        border: '1px solid rgba(26,86,219,0.4)',
        borderRadius: 6,
        fontSize: 11, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
        letterSpacing: '0.02em',
        transition: 'all 0.15s',
      }}>
        {loading ? 'Running pipeline…' : 'Trigger Demo Alert'}
      </button>
      {msg && (
        <p style={{ fontSize: 10, color: msg.includes('error') || msg === 'Failed' ? '#fc8181' : '#68d391', marginTop: 6, textAlign: 'center' }}>
          {msg}
        </p>
      )}
    </div>
  );
}

/* ── Icon set ── */
function IconGrid({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
}
function IconBell({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
}
function IconMap({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>;
}
function IconSignal({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
}
function IconClip({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>;
}