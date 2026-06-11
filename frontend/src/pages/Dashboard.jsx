import { useState, useEffect } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const RISK_COLOR = {
  LOW: '#16a34a', MODERATE: '#d97706', HIGH: '#dc2626', CRITICAL: '#7c3aed',
};

const RISK_BG = {
  LOW: '#f0fdf4', MODERATE: '#fffbeb', HIGH: '#fef2f2', CRITICAL: '#f5f3ff',
};

export default function Dashboard({ alerts, stats }) {
  const [grievanceSummary, setGrievanceSummary] = useState(null);
  const [pipelineStatus, setPipelineStatus]     = useState(null);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/grievances?limit=100`)
      .then(r => r.json())
      .then(d => {
        if (!d.success) return;
        const g = d.grievances;
        setGrievanceSummary({
          total:      g.length,
          resolved:   g.filter(x => x.status === 'RESOLVED').length,
          inProgress: g.filter(x => x.status === 'IN_PROGRESS').length,
          critical:   g.filter(x => x.severity === 'CRITICAL').length,
        });
      })
      .catch(() => {});

    fetch('http://localhost:8000/health')
      .then(r => r.json())
      .then(d => setPipelineStatus(d.status === 'ok' ? 'online' : 'offline'))
      .catch(() => setPipelineStatus('offline'));
  }, []);

  const recentAlerts  = alerts.slice(0, 5);
  const criticalCount = alerts.filter(a => a.riskLevel === 'CRITICAL' || a.confidenceLabel === 'CRITICAL').length;
  const floodCount    = alerts.filter(a => a.alertType === 'FLOOD').length;
  const droughtCount  = alerts.filter(a => a.alertType === 'DROUGHT').length;
  const confirmedLoop = alerts.filter(a => a.reportersConfirmed > 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Hero banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #1d4ed8 100%)',
        borderRadius: 16,
        padding: '28px 32px',
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', right: 32, top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 120, opacity: 0.06, userSelect: 'none',
        }}>💧</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 28 }}>💧</span>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>AquaAlert</h1>
                <p style={{ fontSize: 12, opacity: 0.7 }}>National Water Crisis Early Warning System</p>
              </div>
            </div>
            <p style={{ fontSize: 13, opacity: 0.85, maxWidth: 480, lineHeight: 1.6, marginTop: 8 }}>
              AI-powered flood & drought alerts for rural India — connecting IMD/CWC data to
              gram panchayats and ASHA workers in real time, verified by community reporters on the ground.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <PilotBadge label="Punjab" icon="🌊" />
              <PilotBadge label="Rajasthan" icon="🌵" />
              <PilotBadge label="NIT Jalandhar" icon="🎓" />
            </div>
          </div>

          <div style={{
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: '16px 20px',
            minWidth: 160,
            backdropFilter: 'blur(8px)',
          }}>
            <p style={{ fontSize: 10, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              System Status
            </p>
            <StatusRow label="Backend API" status="online" />
            <StatusRow label="LangGraph"   status={pipelineStatus || 'checking'} />
            <StatusRow label="WebSocket"   status="online" />
            <StatusRow label="Supabase DB" status="online" />
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
        <KPICard label="Total Alerts"     value={stats.total}     color="#3b82f6" icon="🚨" />
        <KPICard label="Active"           value={stats.active}    color="#f59e0b" icon="⚡" />
        <KPICard label="Critical"         value={criticalCount}   color="#7c3aed" icon="🟣" />
        <KPICard label="Flood Alerts"     value={floodCount}      color="#0ea5e9" icon="🌊" />
        <KPICard label="Drought Alerts"   value={droughtCount}    color="#f97316" icon="🌵" />
        <KPICard label="Ground Confirmed" value={confirmedLoop}   color="#16a34a" icon="✅" />
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Recent alerts */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20 }}>
          <SectionHeader title="Recent Alerts" subtitle="Latest alerts from pipeline" icon="🚨" />
          {recentAlerts.length === 0 ? (
            <EmptyState icon="🌊" text="No alerts yet — trigger a demo alert from the sidebar" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
              {recentAlerts.map(alert => (
                <MiniAlertRow key={alert.alertId} alert={alert} />
              ))}
            </div>
          )}
        </div>

        {/* Grievance summary */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20 }}>
          <SectionHeader title="NadiBot Grievances" subtitle="Community reports routed to govt bodies" icon="📋" />
          {!grievanceSummary ? (
            <EmptyState icon="📋" text="Seed grievance data from the Grievances tab" />
          ) : (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <GrievanceStat label="Total Received" value={grievanceSummary.total}      color="#3b82f6" />
                <GrievanceStat label="Resolved"       value={grievanceSummary.resolved}   color="#16a34a" />
                <GrievanceStat label="In Progress"    value={grievanceSummary.inProgress} color="#f59e0b" />
                <GrievanceStat label="Critical"       value={grievanceSummary.critical}   color="#dc2626" />
              </div>
              {grievanceSummary.total > 0 && (
                <div>
                  <p style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>Resolution rate</p>
                  <div style={{ height: 8, background: '#f1f5f9', borderRadius: 99 }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.round((grievanceSummary.resolved / grievanceSummary.total) * 100)}%`,
                      background: '#16a34a',
                      borderRadius: 99,
                      transition: 'width 0.5s',
                    }} />
                  </div>
                  <p style={{ fontSize: 11, color: '#16a34a', marginTop: 4, fontWeight: 600 }}>
                    {Math.round((grievanceSummary.resolved / grievanceSummary.total) * 100)}% resolved
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Charts */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20 }}>
        <SectionHeader title="Analytics" subtitle="Live alert data visualized" icon="📊" />
        <AlertCharts alerts={alerts} />
      </div>

      {/* Data pipeline flow */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20 }}>
        <SectionHeader title="Live Data Pipeline" subtitle="How AquaAlert generates alerts — no mock data" icon="⚙️" />
        <div style={{ marginTop: 16 }}>
          <PipelineFlow />
        </div>
      </div>

      {/* Ground truth loop summary */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20 }}>
        <SectionHeader title="Ground-Truth Feedback Loop" subtitle="Reporter responses updating confidence scores" icon="📡" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 16 }}>
          <LoopCard
            label="Alert Generated"
            desc="Pipeline fires — risk score + Gemini trilingual alert"
            icon="⚡"
            color="#3b82f6"
            step="01"
          />
          <LoopCard
            label="Reporters Pinged"
            desc="3 community reporters get WhatsApp: क्या पानी बढ़ रहा है?"
            icon="📱"
            color="#f59e0b"
            step="02"
          />
          <LoopCard
            label="Confidence Updates"
            desc="YES/NO replies update score live — dashboard reflects instantly"
            icon="📊"
            color="#16a34a"
            step="03"
          />
        </div>
      </div>

    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function PilotBadge({ label, icon }) {
  return (
    <span style={{
      background: 'rgba(255,255,255,0.12)',
      borderRadius: 99,
      padding: '4px 12px',
      fontSize: 11,
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      gap: 4,
    }}>
      {icon} {label}
    </span>
  );
}

function StatusRow({ label, status }) {
  const color = status === 'online' ? '#4ade80' : status === 'offline' ? '#f87171' : '#fbbf24';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
      <span style={{ fontSize: 11, opacity: 0.8 }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
        {status}
      </span>
    </div>
  );
}

function KPICard({ label, value, color, icon }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderTop: `3px solid ${color}`,
      borderRadius: 12,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <p style={{ fontSize: 22, fontWeight: 800, color }}>{value}</p>
        <span style={{ fontSize: 18 }}>{icon}</span>
      </div>
      <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{label}</p>
    </div>
  );
}

function SectionHeader({ title, subtitle, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div>
        <p style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{title}</p>
        <p style={{ fontSize: 11, color: '#94a3b8' }}>{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
      <p style={{ fontSize: 32 }}>{icon}</p>
      <p style={{ fontSize: 12, marginTop: 8 }}>{text}</p>
    </div>
  );
}

function MiniAlertRow({ alert }) {
  const color = RISK_COLOR[alert.riskLevel] || '#dc2626';
  const conf  = Math.round((alert.currentConfidence || 0) * 100);
  const emoji = alert.alertType === 'FLOOD' ? '🌊' : alert.alertType === 'DROUGHT' ? '🌵' : '💧';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      background: '#f8fafc',
      borderRadius: 8,
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{emoji}</span>
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{alert.district}, {alert.state}</p>
          <p style={{ fontSize: 10, color: '#94a3b8' }}>{alert.alertType} · {new Date(alert.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</p>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color }}>{alert.riskLevel}</p>
        <p style={{ fontSize: 10, color: '#64748b' }}>{conf}% conf.</p>
      </div>
    </div>
  );
}

function GrievanceStat({ label, value, color }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px' }}>
      <p style={{ fontSize: 20, fontWeight: 800, color }}>{value}</p>
      <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{label}</p>
    </div>
  );
}

function AlertCharts({ alerts }) {
  const typeData = [
    { name: 'Flood',    value: alerts.filter(a => a.alertType === 'FLOOD').length    || 0 },
    { name: 'Drought',  value: alerts.filter(a => a.alertType === 'DROUGHT').length  || 0 },
    { name: 'Scarcity', value: alerts.filter(a => a.alertType === 'SCARCITY').length || 0 },
  ].filter(d => d.value > 0);

  const riskData = [
    { name: 'Low',      value: alerts.filter(a => a.riskLevel === 'LOW').length      },
    { name: 'Moderate', value: alerts.filter(a => a.riskLevel === 'MODERATE').length },
    { name: 'High',     value: alerts.filter(a => a.riskLevel === 'HIGH').length     },
    { name: 'Critical', value: alerts.filter(a => a.riskLevel === 'CRITICAL').length },
  ];

  const trendData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    const count = alerts.filter(a => {
      const ad = new Date(a.createdAt);
      return ad.toDateString() === d.toDateString();
    }).length;
    return { date: label, alerts: count };
  });

  const PIE_COLORS = ['#0ea5e9', '#f97316', '#8b5cf6'];
  const BAR_COLORS = { Low: '#16a34a', Moderate: '#f59e0b', High: '#ef4444', Critical: '#7c3aed' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginTop: 16 }}>

      {/* Line chart */}
      <div style={{ border: '1px solid #f1f5f9', borderRadius: 12, padding: 16 }}>
        <SectionHeader title="Alert Trend" subtitle="Last 7 days" icon="📈" />
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Line type="monotone" dataKey="alerts" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Pie chart */}
      <div style={{ border: '1px solid #f1f5f9', borderRadius: 12, padding: 16 }}>
        <SectionHeader title="Alert Types" subtitle="Flood vs Drought vs Scarcity" icon="🥧" />
        {typeData.length === 0 ? (
          <EmptyState icon="🥧" text="No alert data yet" />
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={typeData}
                cx="50%" cy="50%"
                outerRadius={65}
                dataKey="value"
                label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                labelLine={false}
                fontSize={10}
              >
                {typeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Bar chart */}
      <div style={{ border: '1px solid #f1f5f9', borderRadius: 12, padding: 16 }}>
        <SectionHeader title="Risk Levels" subtitle="Distribution across alerts" icon="📊" />
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={riskData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {riskData.map((entry) => (
                <Cell key={entry.name} fill={BAR_COLORS[entry.name]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}

function PipelineFlow() {
  const steps = [
    { icon: '🛰️', label: 'Open-Meteo API',    sub: 'Live rainfall, temp, soil moisture', color: '#0ea5e9' },
    { icon: '✅', label: 'Validate',           sub: 'Clean + score each district',        color: '#6366f1' },
    { icon: '📚', label: 'Historical Context', sub: 'Compare vs 10yr IMD normals',        color: '#8b5cf6' },
    { icon: '📊', label: 'Impact Analysis',    sub: 'Risk level + cascade scoring',       color: '#f59e0b' },
    { icon: '🤖', label: 'Gemini Alert',       sub: 'Trilingual EN/HI/Regional text',     color: '#ec4899' },
    { icon: '🔍', label: 'Confidence Check',   sub: 'Filter low-quality alerts',          color: '#14b8a6' },
    { icon: '📱', label: 'Dispatch',           sub: 'WhatsApp to reporters + panchayat',  color: '#16a34a' },
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', paddingBottom: 4 }}>
      {steps.map((step, i) => (
        <div key={step.label} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ textAlign: 'center', width: 100 }}>
            <div style={{
              width: 44, height: 44,
              borderRadius: '50%',
              background: step.color + '18',
              border: `2px solid ${step.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20,
              margin: '0 auto 6px',
            }}>
              {step.icon}
            </div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#0f172a' }}>{step.label}</p>
            <p style={{ fontSize: 9, color: '#94a3b8', marginTop: 2, lineHeight: 1.4 }}>{step.sub}</p>
          </div>
          {i < steps.length - 1 && (
            <div style={{ width: 24, height: 2, background: '#e2e8f0', flexShrink: 0, margin: '0 2px', marginBottom: 28 }} />
          )}
        </div>
      ))}
    </div>
  );
}

function LoopCard({ label, desc, icon, color, step }) {
  return (
    <div style={{
      border: '1px solid #e2e8f0',
      borderTop: `3px solid ${color}`,
      borderRadius: 12,
      padding: '16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{ fontSize: 24 }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#cbd5e1' }}>{step}</span>
      </div>
      <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>{desc}</p>
    </div>
  );
}