import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function GroundTruthPanel({ alerts }) {
  const active = alerts.filter(a => a.reportersPinged > 0);

  if (!active.length) return (
    <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
      <p style={{ fontSize: 40 }}>📡</p>
      <p style={{ marginTop: 12, fontSize: 14 }}>No alerts with reporter activity yet.</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Ground-Truth Confidence Loop</h2>

      {active.map(alert => <ConfidenceCard key={alert.alertId} alert={alert} />)}
    </div>
  );
}

function ConfidenceCard({ alert }) {
  const conf  = Math.round((alert.currentConfidence || 0) * 100);
  const init  = Math.round((alert.initialConfidence || 0) * 100);
  const yes   = alert.reportersConfirmed || 0;
  const no    = alert.reporterResponses?.filter(r => r.response === 'NO').length || 0;
  const total = alert.reportersPinged || 0;

  const labelColor = {
    CRITICAL: '#7c3aed', HIGH: '#dc2626', MODERATE: '#d97706', MONITOR: '#0369a1', LOW: '#16a34a',
  }[alert.confidenceLabel] || '#dc2626';

  // Chart data — show initial → after each response
  const chartData = [{ name: 'Initial', confidence: init }];
  alert.reporterResponses?.forEach((r, i) => {
    if (r.response !== 'PENDING') {
      chartData.push({ name: r.reporterName?.split(' ')[0], confidence: conf, response: r.response });
    }
  });
  if (chartData.length === 1) chartData.push({ name: 'Current', confidence: conf });

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{alert.district}, {alert.state}</p>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{alert.alertId} · {alert.alertType}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 26, fontWeight: 800, color: labelColor }}>{conf}%</p>
          <p style={{ fontSize: 11, color: labelColor, fontWeight: 600 }}>{alert.confidenceLabel}</p>
        </div>
      </div>

      {/* Reporter scoreboard */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        {[
          { label: `${yes}/${total} confirmed`, color: '#16a34a', bg: '#f0fdf4' },
          { label: `${no} denied`,              color: '#dc2626', bg: '#fef2f2' },
          { label: `${total - yes - no} pending`,color: '#f59e0b', bg: '#fffbeb' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, color: s.color }}>
            {s.label}
          </div>
        ))}
      </div>

      {/* Confidence trajectory chart */}
      <ResponsiveContainer width="100%" height={100}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
          <Tooltip formatter={v => [`${v}%`, 'Confidence']} />
          <Line type="monotone" dataKey="confidence" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4, fill: '#3b82f6' }} />
        </LineChart>
      </ResponsiveContainer>

      {/* Reporter response list */}
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {alert.reporterResponses?.map(r => (
          <div key={r.phone} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f8fafc', borderRadius: 6 }}>
            <span style={{ fontSize: 12, color: '#1e293b' }}>{r.reporterName}</span>
            <span style={{ fontSize: 11, color: '#64748b' }}>{r.village || r.phone}</span>
            <span className={`badge badge-${r.response === 'YES' ? 'HIGH' : r.response === 'NO' ? 'DISMISSED' : 'MONITOR'}`}>
              {r.response === 'YES' ? '✅ हाँ' : r.response === 'NO' ? '❌ नहीं' : '⏳ Pending'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}