import { useState } from 'react';

const RISK_COLOR = { LOW: '#16a34a', MODERATE: '#d97706', HIGH: '#dc2626', CRITICAL: '#7c3aed' };
const RISK_BG    = { LOW: '#f0fdf4', MODERATE: '#fffbeb', HIGH: '#fef2f2', CRITICAL: '#f5f3ff' };

export default function AlertFeed({ alerts }) {
  const [selected, setSelected] = useState(null);

  if (!alerts.length) return (
    <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
      <p style={{ fontSize: 40 }}>🌊</p>
      <p style={{ marginTop: 12, fontSize: 14 }}>No alerts yet. Trigger a demo alert from the sidebar.</p>
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: 20 }}>
      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {alerts.map(alert => (
          <AlertCard
            key={alert.alertId}
            alert={alert}
            isSelected={selected?.alertId === alert.alertId}
            onClick={() => setSelected(prev => prev?.alertId === alert.alertId ? null : alert)}
          />
        ))}
      </div>

      {/* Detail Panel */}
      {selected && <AlertDetail alert={alerts.find(a => a.alertId === selected.alertId) || selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AlertCard({ alert, isSelected, onClick }) {
  const color    = RISK_COLOR[alert.riskLevel] || '#dc2626';
  const bg       = RISK_BG[alert.riskLevel]   || '#fef2f2';
  const conf     = Math.round((alert.currentConfidence || 0) * 100);
  const typeEmoji = alert.alertType === 'FLOOD' ? '🌊' : alert.alertType === 'DROUGHT' ? '🌵' : '💧';

  return (
    <div onClick={onClick} style={{
      background: '#fff',
      border: `1px solid ${isSelected ? color : '#e2e8f0'}`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 10,
      padding: '14px 18px',
      cursor: 'pointer',
      transition: 'all 0.15s',
      boxShadow: isSelected ? `0 4px 16px ${bg}` : 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 22 }}>{typeEmoji}</span>
          <div>
            <p style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>
              {alert.district}, {alert.state}
            </p>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>
              {alert.alertId} · {new Date(alert.createdAt).toLocaleString('en-IN', { timeStyle: 'short', dateStyle: 'short' })}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span className={`badge badge-${alert.riskLevel}`}>{alert.riskLevel}</span>
          <span className={`badge badge-${alert.status}`}>{alert.status}</span>
        </div>
      </div>

      {/* Confidence bar */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Confidence</span>
          <span style={{ fontSize: 11, fontWeight: 600, color }}>{conf}% ({alert.confidenceLabel})</span>
        </div>
        <div style={{ height: 5, background: '#f1f5f9', borderRadius: 99 }}>
          <div style={{ height: '100%', width: `${conf}%`, background: color, borderRadius: 99, transition: 'width 0.5s ease' }} />
        </div>
      </div>

      {/* Reporter status */}
      {alert.reportersPinged > 0 && (
        <div style={{ marginTop: 10, display: 'flex', gap: 12, fontSize: 11, color: '#64748b' }}>
          <span>📡 {alert.reportersPinged} pinged</span>
          <span>✅ {alert.reportersConfirmed || 0} confirmed</span>
          <span>⏳ {(alert.reportersPinged || 0) - (alert.reportersConfirmed || 0) - (alert.reporterResponses?.filter(r => r.response === 'NO').length || 0)} pending</span>
        </div>
      )}
    </div>
  );
}

function AlertDetail({ alert, onClose }) {
  const [simLoading, setSimLoading] = useState(null);
  const [simMsg, setSimMsg] = useState('');
  const color = RISK_COLOR[alert.riskLevel] || '#dc2626';

  async function simulateResponse(phone, response) {
    setSimLoading(phone + response);
    try {
      const r = await fetch('/api/reporters/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId: alert.alertId, phone, response }),
      });
      const d = await r.json();
      setSimMsg(d.success ? `✅ ${response} recorded — confidence now ${Math.round(d.newConfidence * 100)}%` : '❌ ' + d.error);
    } catch { setSimMsg('❌ Error'); }
    finally { setSimLoading(null); setTimeout(() => setSimMsg(''), 4000); }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, position: 'sticky', top: 0, height: 'fit-content', maxHeight: '85vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Alert Detail</h3>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: '#94a3b8' }}>✕</button>
      </div>

      {/* Alert text */}
      {alert.alertText?.en && (
        <div style={{ background: '#fffbeb', borderLeft: '3px solid #f59e0b', padding: '10px 14px', borderRadius: 4, marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>{alert.alertText.en}</p>
        </div>
      )}
      {alert.alertText?.hi && (
        <div style={{ background: '#eff6ff', borderLeft: '3px solid #3b82f6', padding: '10px 14px', borderRadius: 4, marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: '#1e40af', lineHeight: 1.6 }}>{alert.alertText.hi}</p>
        </div>
      )}

      {/* Trigger data */}
      {alert.triggerData && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          {[
            { icon: '🌧️', val: `${alert.triggerData.rainfall_mm}mm`, label: 'Rainfall' },
            { icon: '🌊', val: `${alert.triggerData.river_level_m}m`, label: 'River' },
            { icon: '🌱', val: `${alert.triggerData.soil_moisture_pct}%`, label: 'Soil' },
            { icon: '🌡️', val: `${alert.triggerData.temperature_c}°C`, label: 'Temp' },
          ].map(d => (
            <div key={d.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <p style={{ fontSize: 16 }}>{d.icon}</p>
              <p style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{d.val}</p>
              <p style={{ fontSize: 10, color: '#94a3b8' }}>{d.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Reporter responses — simulate for demo */}
      {alert.reporterResponses?.length > 0 && (
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
            📡 Community Reporters
          </p>
          {alert.reporterResponses.map(r => (
            <div key={r.phone} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{r.reporterName}</p>
                  <p style={{ fontSize: 10, color: '#94a3b8' }}>{r.phone}</p>
                </div>
                <span className={`badge badge-${r.response === 'YES' ? 'HIGH' : r.response === 'NO' ? 'DISMISSED' : 'MONITOR'}`}>
                  {r.response}
                </span>
              </div>

              {/* Simulate buttons for demo */}
              {r.response === 'PENDING' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={() => simulateResponse(r.phone, 'YES')} disabled={!!simLoading} style={{
                    flex: 1, padding: '5px 0', background: '#dcfce7', border: '1px solid #86efac',
                    borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#15803d', cursor: 'pointer',
                  }}>✅ हाँ (Simulate)</button>
                  <button onClick={() => simulateResponse(r.phone, 'NO')} disabled={!!simLoading} style={{
                    flex: 1, padding: '5px 0', background: '#fee2e2', border: '1px solid #fca5a5',
                    borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#dc2626', cursor: 'pointer',
                  }}>❌ नहीं (Simulate)</button>
                </div>
              )}
            </div>
          ))}
          {simMsg && <p style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>{simMsg}</p>}
        </div>
      )}
    </div>
  );
}