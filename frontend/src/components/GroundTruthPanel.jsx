import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const LABEL_COLOR = { CRITICAL: '#553c9a', HIGH: '#c53030', MODERATE: '#b7791f', MONITOR: '#2b6cb0', LOW: '#276749' };

export default function GroundTruthPanel({ alerts }) {
  const active = alerts.filter(a => a.reportersPinged > 0);

  if (!active.length) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)' }}>
      <p style={{ fontSize: 13 }}>No alerts with reporter activity yet.</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Ground-Truth Confidence Loop</p>
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Reporter YES / NO responses updating alert confidence scores in real time</p>
      </div>
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
  const labelColor = LABEL_COLOR[alert.confidenceLabel] || '#c53030';

  const chartData = [{ name: 'Initial', confidence: init }];
  (alert.reporterResponses || []).forEach(r => {
    if (r.response !== 'PENDING') {
      chartData.push({ name: r.reporterName?.split(' ')[0], confidence: conf, response: r.response });
    }
  });
  if (chartData.length === 1) chartData.push({ name: 'Current', confidence: conf });

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>{alert.district}, {alert.state}</p>
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, fontFamily: 'var(--mono)' }}>
            {alert.alertId} · {alert.alertType}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 28, fontWeight: 800, color: labelColor, lineHeight: 1 }}>{conf}%</p>
          <p style={{ fontSize: 10, fontWeight: 600, color: labelColor, marginTop: 2 }}>{alert.confidenceLabel}</p>
        </div>
      </div>

      {/* Reporter count pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[
          { label: `${yes} of ${total} confirmed`, color: '#276749', bg: 'var(--green-light)' },
          { label: `${no} denied`,                 color: '#c53030', bg: 'var(--red-light)'   },
          { label: `${total - yes - no} pending`,  color: '#b7791f', bg: 'var(--amber-light)' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 4, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: s.color }}>
            {s.label}
          </div>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={90}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#8a9ab0' }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#8a9ab0' }} />
          <Tooltip
            formatter={v => [`${v}%`, 'Confidence']}
            contentStyle={{ border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
          />
          <Line type="monotone" dataKey="confidence" stroke="#1a56db" strokeWidth={2} dot={{ r: 3, fill: '#1a56db' }} />
        </LineChart>
      </ResponsiveContainer>

      {/* Reporter list */}
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {(alert.reporterResponses || []).map(r => (
          <div key={r.phone} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '6px 10px', background: 'var(--canvas)', borderRadius: 5,
          }}>
            <div>
              <span style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 500 }}>{r.reporterName}</span>
              <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 8, fontFamily: 'var(--mono)' }}>{r.phone}</span>
            </div>
            <span className={`badge badge-${r.response}`}>
              {r.response === 'YES' ? 'Yes — हाँ' : r.response === 'NO' ? 'No — नहीं' : 'Pending'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}