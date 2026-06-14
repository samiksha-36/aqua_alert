import { useState } from 'react';

const RISK_HEX = { LOW: '#276749', MODERATE: '#b7791f', HIGH: '#c53030', CRITICAL: '#553c9a' };

export default function AlertFeed({ alerts }) {
  const [selected, setSelected] = useState(null);

  if (!alerts.length) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)' }}>
      <p style={{ fontSize: 13 }}>No alerts yet. Trigger a demo alert from the sidebar.</p>
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {alerts.map(alert => (
          <AlertCard
            key={alert.alertId}
            alert={alert}
            isSelected={selected?.alertId === alert.alertId}
            onClick={() => setSelected(p => p?.alertId === alert.alertId ? null : alert)}
          />
        ))}
      </div>
      {selected && (
        <AlertDetail
          alert={alerts.find(a => a.alertId === selected.alertId) || selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function AlertCard({ alert, isSelected, onClick }) {
  const color = RISK_HEX[alert.riskLevel] || '#c53030';
  const conf  = Math.round((alert.currentConfidence || 0) * 100);
  const type  = alert.alertType === 'FLOOD' ? 'Flood' : alert.alertType === 'DROUGHT' ? 'Drought' : 'Groundwater';

  return (
    <div onClick={onClick} className="fade-up" style={{
      background: 'var(--surface)',
      border: `1px solid ${isSelected ? color + '60' : 'var(--border)'}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 8,
      padding: '14px 18px',
      cursor: 'pointer',
      transition: 'border-color 0.15s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>
            {alert.district}, {alert.state}
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, fontFamily: 'var(--mono)' }}>
            {alert.alertId} · {type} · {new Date(alert.createdAt).toLocaleString('en-IN', { timeStyle: 'short', dateStyle: 'short' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <span className={`badge badge-${alert.riskLevel}`}>{alert.riskLevel}</span>
          <span className={`badge badge-${alert.status}`}>{alert.status}</span>
        </div>
      </div>

      {/* Confidence */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Confidence</span>
          <span style={{ fontSize: 10, fontWeight: 700, color }}>{conf}%</span>
        </div>
        <div style={{ height: 4, background: 'var(--canvas)', borderRadius: 99 }}>
          <div style={{ height: '100%', width: `${conf}%`, background: color, borderRadius: 99, transition: 'width 0.5s' }} />
        </div>
      </div>

      {/* Reporters */}
      {alert.reportersPinged > 0 && (
        <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: 10, color: 'var(--text-3)' }}>
          <span>{alert.reportersPinged} reporters pinged</span>
          <span>{alert.reportersConfirmed || 0} confirmed</span>
          <span>{(alert.reportersPinged || 0) - (alert.reportersConfirmed || 0) - (alert.reporterResponses?.filter(r => r.response === 'NO').length || 0)} pending</span>
        </div>
      )}
    </div>
  );
}

function AlertDetail({ alert, onClose }) {
  const [simLoading, setSimLoading] = useState(null);
  const [simMsg, setSimMsg] = useState('');
  const color = RISK_HEX[alert.riskLevel] || '#c53030';

  async function simulateResponse(phone, response) {
    setSimLoading(phone + response);
    try {
      const r = await fetch('/api/reporters/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId: alert.alertId, phone, response }),
      });
      const d = await r.json();
      setSimMsg(d.success ? `Recorded. Confidence now ${Math.round(d.newConfidence * 100)}%` : d.error);
    } catch { setSimMsg('Connection error'); }
    finally { setSimLoading(null); setTimeout(() => setSimMsg(''), 4000); }
  }

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderTop: `3px solid ${color}`,
      borderRadius: 8, padding: 20,
      position: 'sticky', top: 0,
      maxHeight: '85vh', overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
            {alert.district}, {alert.state}
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
            {alert.alertId}
          </p>
        </div>
        <button onClick={onClose} style={{
          border: 'none', background: 'none', cursor: 'pointer',
          fontSize: 16, color: 'var(--text-3)', padding: '0 4px',
        }}>×</button>
      </div>

      {/* Status row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <span className={`badge badge-${alert.riskLevel}`}>{alert.riskLevel}</span>
        <span className={`badge badge-${alert.status}`}>{alert.status}</span>
        <span className={`badge badge-${alert.alertType}`} style={{ background: 'var(--blue-light)', color: 'var(--blue)' }}>
          {alert.alertType}
        </span>
      </div>

      {/* Alert text */}
      {alert.alertText?.en && (
        <div style={{ background: 'var(--amber-light)', borderLeft: '3px solid var(--amber)', padding: '10px 12px', borderRadius: 4, marginBottom: 10 }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--amber)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>English</p>
          <p style={{ fontSize: 12, color: '#744210', lineHeight: 1.6 }}>{alert.alertText.en}</p>
        </div>
      )}
      {alert.alertText?.hi && (
        <div style={{ background: 'var(--blue-light)', borderLeft: '3px solid var(--blue)', padding: '10px 12px', borderRadius: 4, marginBottom: 14 }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--blue)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hindi</p>
          <p style={{ fontSize: 12, color: '#1e3a8a', lineHeight: 1.6 }}>{alert.alertText.hi}</p>
        </div>
      )}

      {/* Sensor data */}
      {alert.triggerData && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
          {[
            { label: 'Rainfall',     val: `${alert.triggerData.rainfall_mm} mm`      },
            { label: 'River Level',  val: `${alert.triggerData.river_level_m} m`     },
            { label: 'Soil Moisture',val: `${alert.triggerData.soil_moisture_pct}%`  },
            { label: 'Temperature',  val: `${alert.triggerData.temperature_c}°C`     },
          ].map(d => (
            <div key={d.label} style={{ background: 'var(--canvas)', borderRadius: 6, padding: '8px 12px' }}>
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>{d.label}</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--mono)' }}>{d.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Reporters */}
      {alert.reporterResponses?.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Community Reporters
          </p>
          {alert.reporterResponses.map(r => (
            <div key={r.phone} style={{ background: 'var(--canvas)', borderRadius: 6, padding: '10px 12px', marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{r.reporterName}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>{r.phone}</p>
                </div>
                <span className={`badge badge-${r.response}`}>{r.response}</span>
              </div>
              {r.response === 'PENDING' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={() => simulateResponse(r.phone, 'YES')} disabled={!!simLoading} style={{
                    flex: 1, padding: '5px 0', background: 'var(--green-light)',
                    border: '1px solid #9ae6b4', borderRadius: 5,
                    fontSize: 11, fontWeight: 600, color: 'var(--green)', cursor: 'pointer',
                  }}>Yes — हाँ</button>
                  <button onClick={() => simulateResponse(r.phone, 'NO')} disabled={!!simLoading} style={{
                    flex: 1, padding: '5px 0', background: 'var(--red-light)',
                    border: '1px solid #feb2b2', borderRadius: 5,
                    fontSize: 11, fontWeight: 600, color: 'var(--red)', cursor: 'pointer',
                  }}>No — नहीं</button>
                </div>
              )}
            </div>
          ))}
          {simMsg && <p style={{ fontSize: 10, color: 'var(--green)', marginTop: 4 }}>{simMsg}</p>}
        </div>
      )}
    </div>
  );
}