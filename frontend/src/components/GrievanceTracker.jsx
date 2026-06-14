import { useState, useEffect } from 'react';

const STATUS_COLOR = { RECEIVED: '#b7791f', ROUTED: '#1a56db', IN_PROGRESS: '#553c9a', RESOLVED: '#276749' };
const TYPE_LABEL   = { DRY_TAP: 'Dry Tap', CONTAMINATION: 'Contamination', WATERLOGGING: 'Waterlogging', PIPE_BURST: 'Pipe Burst', FLOOD: 'Flood', DROUGHT: 'Drought', OTHER: 'Other' };

export default function GrievanceTracker() {
  const [grievances, setGrievances]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [seedLoading, setSeedLoading] = useState(false);

  async function load() {
    try {
      const r = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/grievances?limit=50`);
      const d = await r.json();
      if (d.success) setGrievances(d.grievances);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function seed() {
    setSeedLoading(true);
    await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/grievances/seed`, { method: 'POST' });
    await load();
    setSeedLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (loading) return <p style={{ color: 'var(--text-3)', padding: '40px 0', textAlign: 'center', fontSize: 12 }}>Loading…</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>NadiBot Grievance Tracker</p>
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Community water issue reports routed to government bodies</p>
        </div>
        <button onClick={seed} disabled={seedLoading} style={{
          padding: '7px 16px', background: 'var(--blue)', color: '#fff',
          border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
        }}>
          {seedLoading ? 'Seeding…' : 'Seed Demo Data'}
        </button>
      </div>

      {!grievances.length ? (
        <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-3)' }}>
          <p style={{ fontSize: 12 }}>No grievances yet. Use "Seed Demo Data" to populate.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {grievances.map(g => (
            <div key={g.grievanceId} className="fade-up" style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>
                    {g.reporterName} · {g.village}, {g.district}
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, fontFamily: 'var(--mono)' }}>
                    {g.grievanceId}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className={`badge badge-${g.severity}`}>{g.severity}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: STATUS_COLOR[g.status] || 'var(--text-3)',
                  }}>{g.status}</span>
                </div>
              </div>

              <p style={{
                fontSize: 12, color: 'var(--text-2)', marginTop: 10,
                padding: '8px 12px', background: 'var(--canvas)', borderRadius: 5, lineHeight: 1.6,
              }}>{g.description}</p>

              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10, color: 'var(--text-3)' }}>
                <span>{TYPE_LABEL[g.issueType] || g.issueType}</span>
                <span>Routed to: {g.routedTo?.replace(/_/g, ' ')}</span>
                <span>{new Date(g.createdAt).toLocaleDateString('en-IN')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}