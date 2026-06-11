import { useState } from 'react';

const RISK_COLOR = {
  LOW:      '#16a34a',
  MODERATE: '#d97706',
  HIGH:     '#dc2626',
  CRITICAL: '#7c3aed',
};

const RISK_BG = {
  LOW:      '#f0fdf4',
  MODERATE: '#fffbeb',
  HIGH:     '#fef2f2',
  CRITICAL: '#f5f3ff',
};

// SVG coordinates mapped to approximate India positions
// viewBox is 0 0 500 580
const DISTRICT_PINS = {
  Ludhiana:  { x: 155, y: 95  },
  Patiala:   { x: 168, y: 112 },
  Barmer:    { x: 108, y: 215 },
  Jaisalmer: { x: 95,  y: 198 },
  Patna:     { x: 310, y: 185 },
  Varanasi:  { x: 285, y: 190 },
};

const STATE_LABELS = [
  { name: 'Punjab',     x: 155, y: 78  },
  { name: 'Rajasthan',  x: 108, y: 175 },
  { name: 'Bihar',      x: 318, y: 168 },
  { name: 'UP',         x: 265, y: 170 },
];

export default function DistrictMap({ alerts }) {
  const [selected, setSelected] = useState(null);

  // Build a lookup: district → latest alert
  const alertMap = {};
  alerts.forEach(a => {
    if (!alertMap[a.district] || new Date(a.createdAt) > new Date(alertMap[a.district].createdAt)) {
      alertMap[a.district] = a;
    }
  });

  const selectedAlert = selected ? alertMap[selected] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>District Risk Map</h2>
        <Legend />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 340px' : '1fr', gap: 20 }}>
        {/* Map */}
        <div style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 16,
          padding: 24,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <svg
            viewBox="0 0 500 580"
            style={{ width: '100%', maxWidth: 520, height: 'auto' }}
          >
            <defs>
              <style>{`
                @keyframes ripple {
                  0%   { r: 10; opacity: 0.8; }
                  100% { r: 26; opacity: 0;   }
                }
                @keyframes ripple2 {
                  0%   { r: 10; opacity: 0.5; }
                  100% { r: 20; opacity: 0;   }
                }
                .ripple-1 { animation: ripple  1.8s ease-out infinite; }
                .ripple-2 { animation: ripple2 1.8s ease-out infinite 0.5s; }
              `}</style>
            </defs>

            {/* India outline — simplified path */}
            <path
              d="M 148 55
                 L 172 48 L 210 52 L 245 45 L 278 50 L 305 44
                 L 340 55 L 368 72 L 385 95 L 390 120
                 L 400 145 L 405 170 L 395 195 L 410 215
                 L 420 240 L 415 265 L 400 285 L 385 305
                 L 370 328 L 355 350 L 340 375 L 325 400
                 L 310 425 L 295 448 L 280 468 L 265 488
                 L 252 505 L 245 520 L 238 508 L 228 490
                 L 215 472 L 200 452 L 188 432 L 175 410
                 L 162 388 L 148 365 L 135 342 L 122 318
                 L 110 295 L 98  272 L 88  248 L 82  222
                 L 78  196 L 80  170 L 85  145 L 90  118
                 L 98  95  L 112 75  L 130 62  Z"
              fill="#f0f9ff"
              stroke="#bfdbfe"
              strokeWidth="1.5"
            />

            {/* State region shading */}
            {/* Punjab */}
            <ellipse cx="160" cy="102" rx="32" ry="22" fill="#dbeafe" opacity="0.5" />
            {/* Rajasthan */}
            <ellipse cx="112" cy="208" rx="42" ry="35" fill="#fef9c3" opacity="0.5" />
            {/* UP/Bihar */}
            <ellipse cx="295" cy="186" rx="55" ry="22" fill="#dcfce7" opacity="0.4" />

            {/* State labels */}
            {STATE_LABELS.map(s => (
              <text
                key={s.name}
                x={s.x} y={s.y}
                textAnchor="middle"
                fontSize="10"
                fill="#94a3b8"
                fontWeight="600"
                letterSpacing="0.5"
              >
                {s.name.toUpperCase()}
              </text>
            ))}

            {/* District pins */}
            {Object.entries(DISTRICT_PINS).map(([district, pos]) => {
              const alert    = alertMap[district];
              const color    = alert ? RISK_COLOR[alert.riskLevel] : '#cbd5e1';
              const isActive = !!alert;
              const isSelected = selected === district;
              const conf     = alert ? Math.round((alert.currentConfidence || 0) * 100) : 0;

              return (
                <g
                  key={district}
                  onClick={() => setSelected(prev => prev === district ? null : district)}
                  style={{ cursor: isActive ? 'pointer' : 'default' }}
                >
                  {/* Ripple rings for active alerts */}
                  {isActive && (
                    <>
                      <circle
                        cx={pos.x} cy={pos.y}
                        r="10"
                        fill="none"
                        stroke={color}
                        strokeWidth="1.5"
                        opacity="0.6"
                        className="ripple-1"
                      />
                      <circle
                        cx={pos.x} cy={pos.y}
                        r="10"
                        fill="none"
                        stroke={color}
                        strokeWidth="1"
                        opacity="0.4"
                        className="ripple-2"
                      />
                    </>
                  )}

                  {/* Selection ring */}
                  {isSelected && (
                    <circle
                      cx={pos.x} cy={pos.y}
                      r="16"
                      fill="none"
                      stroke={color}
                      strokeWidth="2"
                      strokeDasharray="4 2"
                    />
                  )}

                  {/* Main pin circle */}
                  <circle
                    cx={pos.x} cy={pos.y}
                    r={isSelected ? 11 : 9}
                    fill={color}
                    stroke="#fff"
                    strokeWidth="2"
                    style={{ transition: 'all 0.2s' }}
                  />

                  {/* Alert type emoji inside pin */}
                  {isActive && (
                    <text
                      x={pos.x} y={pos.y + 4}
                      textAnchor="middle"
                      fontSize="9"
                      fill="#fff"
                    >
                      {alert.alertType === 'FLOOD' ? '🌊' : alert.alertType === 'DROUGHT' ? '🌵' : '💧'}
                    </text>
                  )}

                  {/* District label */}
                  <text
                    x={pos.x} y={pos.y + 24}
                    textAnchor="middle"
                    fontSize="9"
                    fill={isActive ? '#1e293b' : '#94a3b8'}
                    fontWeight={isActive ? '700' : '400'}
                  >
                    {district}
                  </text>

                  {/* Confidence % badge on active alerts */}
                  {isActive && (
                    <text
                      x={pos.x} y={pos.y + 35}
                      textAnchor="middle"
                      fontSize="8"
                      fill={color}
                      fontWeight="600"
                    >
                      {conf}%
                    </text>
                  )}
                </g>
              );
            })}

            {/* No alerts watermark */}
            {alerts.length === 0 && (
              <text x="250" y="300" textAnchor="middle" fontSize="13" fill="#cbd5e1">
                No active alerts — trigger a demo alert
              </text>
            )}
          </svg>
        </div>

        {/* Detail panel */}
        {selected && (
          <AlertDetailPanel
            district={selected}
            alert={selectedAlert}
            onClose={() => setSelected(null)}
          />
        )}
      </div>

      {/* District status row */}
      <DistrictStatusRow alertMap={alertMap} onSelect={setSelected} selected={selected} />
    </div>
  );
}

function AlertDetailPanel({ district, alert, onClose }) {
  if (!alert) {
    return (
      <div style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        color: '#94a3b8',
      }}>
        <span style={{ fontSize: 32 }}>🟢</span>
        <p style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{district}</p>
        <p style={{ fontSize: 12 }}>No active alert for this district</p>
        <button
          onClick={onClose}
          style={{ marginTop: 12, border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12 }}
        >
          ✕ Close
        </button>
      </div>
    );
  }

  const color = RISK_COLOR[alert.riskLevel] || '#dc2626';
  const bg    = RISK_BG[alert.riskLevel]   || '#fef2f2';
  const conf  = Math.round((alert.currentConfidence || 0) * 100);
  const yes   = alert.reportersConfirmed || 0;
  const total = alert.reportersPinged    || 0;

  return (
    <div style={{
      background: '#fff',
      border: `1px solid #e2e8f0`,
      borderTop: `4px solid ${color}`,
      borderRadius: 16,
      padding: 20,
      overflowY: 'auto',
      maxHeight: '70vh',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{district}, {alert.state}</p>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{alert.alertId}</p>
        </div>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: '#94a3b8' }}>✕</button>
      </div>

      {/* Risk badge */}
      <div style={{
        background: bg,
        borderRadius: 10,
        padding: '10px 14px',
        marginBottom: 14,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <p style={{ fontSize: 11, color: '#64748b' }}>Risk Level</p>
          <p style={{ fontSize: 18, fontWeight: 800, color }}>{alert.riskLevel}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 11, color: '#64748b' }}>Confidence</p>
          <p style={{ fontSize: 18, fontWeight: 800, color }}>{conf}%</p>
        </div>
      </div>

      {/* Confidence bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ height: 6, background: '#f1f5f9', borderRadius: 99 }}>
          <div style={{
            height: '100%',
            width: `${conf}%`,
            background: color,
            borderRadius: 99,
            transition: 'width 0.5s ease',
          }} />
        </div>
        <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
          {yes}/{total} community reporters confirmed
        </p>
      </div>

      {/* Alert text */}
      {alert.alertText?.en && (
        <div style={{
          background: '#fffbeb',
          borderLeft: '3px solid #f59e0b',
          padding: '10px 12px',
          borderRadius: 4,
          marginBottom: 10,
        }}>
          <p style={{ fontSize: 11, color: '#78350f', lineHeight: 1.6 }}>{alert.alertText.en}</p>
        </div>
      )}
      {alert.alertText?.hi && (
        <div style={{
          background: '#eff6ff',
          borderLeft: '3px solid #3b82f6',
          padding: '10px 12px',
          borderRadius: 4,
          marginBottom: 10,
        }}>
          <p style={{ fontSize: 11, color: '#1e40af', lineHeight: 1.6 }}>{alert.alertText.hi}</p>
        </div>
      )}

      {/* Trigger data grid */}
      {alert.triggerData && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          {[
            { icon: '🌧️', val: `${alert.triggerData.rainfall_mm}mm`,      label: 'Rainfall'   },
            { icon: '🌊', val: `${alert.triggerData.river_level_m}m`,      label: 'River'      },
            { icon: '🌱', val: `${alert.triggerData.soil_moisture_pct}%`,  label: 'Soil'       },
            { icon: '🌡️', val: `${alert.triggerData.temperature_c}°C`,    label: 'Temperature'},
          ].map(d => (
            <div key={d.label} style={{
              background: '#f8fafc',
              borderRadius: 8,
              padding: '8px 10px',
              textAlign: 'center',
            }}>
              <p style={{ fontSize: 15 }}>{d.icon}</p>
              <p style={{ fontWeight: 700, fontSize: 12, color: '#0f172a' }}>{d.val}</p>
              <p style={{ fontSize: 10, color: '#94a3b8' }}>{d.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
        <span>Status: <strong>{alert.status}</strong></span>
        <span>{new Date(alert.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>
      </div>
    </div>
  );
}

function DistrictStatusRow({ alertMap, onSelect, selected }) {
  const districts = Object.keys(DISTRICT_PINS);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(6, 1fr)',
      gap: 10,
    }}>
      {districts.map(d => {
        const alert = alertMap[d];
        const color = alert ? RISK_COLOR[alert.riskLevel] : '#cbd5e1';
        const conf  = alert ? Math.round((alert.currentConfidence || 0) * 100) : null;
        const isSelected = selected === d;

        return (
          <div
            key={d}
            onClick={() => onSelect(prev => prev === d ? null : d)}
            style={{
              background: '#fff',
              border: `1px solid ${isSelected ? color : '#e2e8f0'}`,
              borderTop: `3px solid ${color}`,
              borderRadius: 10,
              padding: '10px 12px',
              cursor: alert ? 'pointer' : 'default',
              transition: 'all 0.15s',
            }}
          >
            <p style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{d}</p>
            {alert ? (
              <>
                <p style={{ fontSize: 10, color, fontWeight: 600 }}>{alert.riskLevel}</p>
                <p style={{ fontSize: 10, color: '#64748b' }}>{conf}% confidence</p>
                <p style={{ fontSize: 10, color: '#94a3b8' }}>{alert.alertType}</p>
              </>
            ) : (
              <p style={{ fontSize: 10, color: '#94a3b8' }}>No alert</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      {Object.entries(RISK_COLOR).map(([level, color]) => (
        <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: color, display: 'inline-block',
          }} />
          <span style={{ fontSize: 11, color: '#64748b' }}>{level}</span>
        </div>
      ))}
    </div>
  );
}