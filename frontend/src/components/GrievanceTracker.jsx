import { useState, useEffect } from 'react';

const TYPE_EMOJI = { DRY_TAP: '🚱', CONTAMINATION: '☣️', WATERLOGGING: '🌊', PIPE_BURST: '💥', FLOOD: '🌧️', DROUGHT: '🏜️', OTHER: '📝' };
const STATUS_COLOR = { RECEIVED: '#f59e0b', ROUTED: '#3b82f6', IN_PROGRESS: '#7c3aed', RESOLVED: '#16a34a' };

export default function GrievanceTracker() {
  const [grievances, setGrievances]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [seedLoading, setSeedLoading] = useState(false);

  async function load() {
    try {
      const r = await fetch('/api/grievances?limit=50');
      const d = await r.json();
      if (d.success) setGrievances(d.grievances);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function seed() {
    setSeedLoading(true);
    await fetch('/api/grievances/seed', { method: 'POST' });
    await load();
    setSeedLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (loading) return <p style={{ color: '#94a3b8', padding: 40, textAlign: 'center' }}>Loading…</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>NadiBot Grievance Tracker</h2>
        <button onClick={seed} disabled={seedLoading} style={{
          padding: '7px 16px', background: '#3b82f6', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          {seedLoading ? 'Seeding…' : '🌱 Seed Demo Data'}
        </button>
      </div>

      {!grievances.length ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <p style={{ fontSize: 40 }}>📋</p>
          <p style={{ marginTop: 12, fontSize: 14 }}>No grievances yet. Seed demo data to populate.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {grievances.map(g => (
            <div key={g.grievanceId} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 22 }}>{TYPE_EMOJI[g.issueType] || '📝'}</span>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                      {g.reporterName} · {g.village}, {g.district}
                    </p>
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{g.grievanceId}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span className={`badge badge-${g.severity}`}>{g.severity}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[g.status] || '#64748b' }}>
                    ● {g.status}
                  </span>
                </div>
              </div>

              <p style={{ fontSize: 12, color: '#475569', marginTop: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 6 }}>
                {g.description}
              </p>

              <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: '#64748b' }}>
                <span>📌 {g.issueType}</span>
                <span>→ {g.routedTo?.replace(/_/g, ' ')}</span>
                <span>🕐 {new Date(g.createdAt).toLocaleDateString('en-IN')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}