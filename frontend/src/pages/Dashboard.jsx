import { useState, useEffect } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const RISK_COLOR = { LOW: 'var(--green)', MODERATE: 'var(--amber)', HIGH: 'var(--red)', CRITICAL: 'var(--purple)' };
const RISK_HEX   = { LOW: '#276749',      MODERATE: '#b7791f',      HIGH: '#c53030',    CRITICAL: '#553c9a' };

export default function Dashboard({ alerts, stats }) {
  const [grievanceSummary, setGrievanceSummary] = useState(null);
  const [pipelineStatus,  setPipelineStatus]  = useState(null);
  const [backendStatus,   setBackendStatus]   = useState('checking');
  const [wsStatus,        setWsStatus]        = useState('checking');
  const [supabaseStatus,  setSupabaseStatus]  = useState('checking');
  

  useEffect(() => {
    const backend = import.meta.env.VITE_BACKEND_URL || '';

    // Backend API health
    fetch(`${backend}/api/health`)
      .then(r => r.json())
      .then(d => {
        setBackendStatus(d.status === 'ok' ? 'online' : 'degraded');
        setWsStatus(d.websocket === true ? 'online' : 'offline');
      })
      .catch(() => { setBackendStatus('offline'); setWsStatus('offline'); });

    // LangGraph pipeline health
    fetch('https://aqua-alert-pipeline.onrender.com//health')
      .then(r => r.json())
      .then(d => setPipelineStatus(d.status === 'ok' ? 'online' : 'offline'))
      .catch(() => setPipelineStatus('offline'));

    // Supabase — lightweight alerts query
    fetch(`${backend}/api/alerts?limit=1`)
      .then(r => r.ok ? setSupabaseStatus('online') : setSupabaseStatus('degraded'))
      .catch(() => setSupabaseStatus('offline'));

    
    // Grievances
    fetch(`${backend}/api/grievances?limit=100`)
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
      }).catch(() => {});
  }, []);

  const recentAlerts  = alerts.slice(0, 5);
  const criticalCount = alerts.filter(a => a.riskLevel === 'CRITICAL' || a.confidenceLabel === 'CRITICAL').length;
  const floodCount    = alerts.filter(a => a.alertType === 'FLOOD').length;
  const droughtCount  = alerts.filter(a => a.alertType === 'DROUGHT').length;
  const confirmedLoop = alerts.filter(a => a.reportersConfirmed > 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* System header */}
      <div style={{
        background: 'var(--navy)',
        borderRadius: 10,
        padding: '22px 28px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 24,
      }}>
        <div>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
            National Water Crisis Early Warning System
          </p>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', marginBottom: 6 }}>
            AquaAlert
          </h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', maxWidth: 480, lineHeight: 1.7 }}>
            AI-powered flood and drought alerts for rural India — connecting Open-Meteo and GloFAS data to
            gram panchayats and ASHA workers, verified by community reporters on the ground.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {['Punjab', 'Rajasthan', 'Bihar', 'UP'].map(s => (
              <span key={s} style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4, padding: '2px 10px',
                fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>{s}</span>
            ))}
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, padding: '16px 20px', minWidth: 180, flexShrink: 0,
        }}>
          <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            System Status
          </p>
          {[
            { label: 'Backend API',  status: backendStatus                 },
            { label: 'LangGraph',    status: pipelineStatus || 'checking'  },
            { label: 'WebSocket',    status: wsStatus                      },
            { label: 'Supabase DB',  status: supabaseStatus                },
                                
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{s.label}</span>
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: s.status === 'online' ? '#68d391' : s.status === 'offline' ? '#fc8181' : '#fbd38d',
              }}>
                {s.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
        {[
          { label: 'Total Alerts',  value: stats.total,    color: '#1a56db' },
          { label: 'Active',        value: stats.active,   color: '#b7791f' },
          { label: 'Critical',      value: criticalCount,  color: '#553c9a' },
          { label: 'Flood',         value: floodCount,     color: '#2b6cb0' },
          { label: 'Drought',       value: droughtCount,   color: '#c05621' },
          { label: 'Confirmed',     value: confirmedLoop,  color: '#276749' },
        ].map(k => (
          <div key={k.label} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderTop: `3px solid ${k.color}`,
            borderRadius: 8, padding: '12px 16px',
          }}>
            <p style={{ fontSize: 24, fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* Main 2-col */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Recent alerts */}
        <Panel title="Recent Alerts" sub="Latest from the pipeline">
          {recentAlerts.length === 0 ? (
            <Empty text="No alerts yet. Trigger a demo alert from the sidebar." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
              {recentAlerts.map(alert => <MiniAlertRow key={alert.alertId} alert={alert} />)}
            </div>
          )}
        </Panel>

        {/* Grievances */}
        <Panel title="NadiBot Grievances" sub="Community reports routed to government bodies">
          {!grievanceSummary ? (
            <Empty text="Seed grievance data from the Grievances tab." />
          ) : (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                {[
                  { label: 'Total',      value: grievanceSummary.total,      color: '#1a56db' },
                  { label: 'Resolved',   value: grievanceSummary.resolved,   color: '#276749' },
                  { label: 'In Progress',value: grievanceSummary.inProgress, color: '#b7791f' },
                  { label: 'Critical',   value: grievanceSummary.critical,   color: '#c53030' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--canvas)', borderRadius: 6, padding: '10px 14px' }}>
                    <p style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{s.label}</p>
                  </div>
                ))}
              </div>
              {grievanceSummary.total > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Resolution rate</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)' }}>
                      {Math.round((grievanceSummary.resolved / grievanceSummary.total) * 100)}%
                    </span>
                  </div>
                  <div style={{ height: 5, background: 'var(--canvas)', borderRadius: 99 }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.round((grievanceSummary.resolved / grievanceSummary.total) * 100)}%`,
                      background: 'var(--green)', borderRadius: 99, transition: 'width 0.5s',
                    }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* Charts */}
      <Panel title="Analytics" sub="Live alert data">
        <AlertCharts alerts={alerts} />
      </Panel>

      {/* Pipeline */}
      <Panel title="Data Pipeline" sub="7-node LangGraph — no mock data in production path">
        <PipelineFlow />
      </Panel>

      {/* Ground truth loop */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { step: '01', label: 'Alert Generated',    desc: 'Pipeline fires — risk scoring + Gemini trilingual alert text.',          color: '#1a56db' },
          { step: '02', label: 'Reporters Pinged',   desc: '3 community reporters receive a Telegram message in Hindi.',             color: '#b7791f' },
          { step: '03', label: 'Confidence Updated', desc: 'YES / NO replies update the confidence score and dashboard in real time.', color: '#276749' },
        ].map(c => (
          <div key={c.step} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderTop: `3px solid ${c.color}`,
            borderRadius: 8, padding: '16px 18px',
          }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: c.color, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
              Step {c.step}
            </p>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>{c.label}</p>
            <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6 }}>{c.desc}</p>
          </div>
        ))}
      </div>

    </div>
  );
}

/* ── Sub-components ── */

function Panel({ title, sub, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '18px 20px' }}>
      <div style={{ marginBottom: 2 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{title}</p>
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{sub}</p>
      </div>
      {children}
    </div>
  );
}

function Empty({ text }) {
  return (
    <div style={{ padding: '28px 0', textAlign: 'center' }}>
      <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{text}</p>
    </div>
  );
}

function MiniAlertRow({ alert }) {
  const color = RISK_HEX[alert.riskLevel] || '#c53030';
  const conf  = Math.round((alert.currentConfidence || 0) * 100);
  const type  = alert.alertType === 'FLOOD' ? 'Flood' : alert.alertType === 'DROUGHT' ? 'Drought' : 'Scarcity';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 12px', background: 'var(--canvas)', borderRadius: 6,
      borderLeft: `3px solid ${color}`,
    }}>
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>
          {alert.district}, {alert.state}
        </p>
        <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
          {type} · {new Date(alert.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
        </p>
      </div>
      <div style={{ textAlign: 'right' }}>
        <span className={`badge badge-${alert.riskLevel}`}>{alert.riskLevel}</span>
        <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{conf}% confidence</p>
      </div>
    </div>
  );
}

function AlertCharts({ alerts }) {
  const typeData = [
    { name: 'Flood',    value: alerts.filter(a => a.alertType === 'FLOOD').length    || 0 },
    { name: 'Drought',  value: alerts.filter(a => a.alertType === 'DROUGHT').length  || 0 },
    { name: 'Scarcity', value: alerts.filter(a => a.alertType === 'GROUNDWATER').length || 0 },
  ].filter(d => d.value > 0);

  const riskData = [
    { name: 'Low',      value: alerts.filter(a => a.riskLevel === 'LOW').length      },
    { name: 'Moderate', value: alerts.filter(a => a.riskLevel === 'MODERATE').length },
    { name: 'High',     value: alerts.filter(a => a.riskLevel === 'HIGH').length     },
    { name: 'Critical', value: alerts.filter(a => a.riskLevel === 'CRITICAL').length },
  ];

  const trendData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return {
      date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      alerts: alerts.filter(a => new Date(a.createdAt).toDateString() === d.toDateString()).length,
    };
  });

  const PIE_COLORS = ['#1a56db', '#c05621', '#553c9a'];
  const BAR_COLORS = { Low: '#276749', Moderate: '#b7791f', High: '#c53030', Critical: '#553c9a' };

  const tooltipStyle = {
    contentStyle: { background: '#fff', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 },
    itemStyle: { color: 'var(--text-1)' },
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 16 }}>
      <ChartBox title="Alert Trend" sub="Last 7 days">
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={trendData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#8a9ab0' }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: '#8a9ab0' }} />
            <Tooltip {...tooltipStyle} />
            <Line type="monotone" dataKey="alerts" stroke="#1a56db" strokeWidth={2} dot={{ r: 3, fill: '#1a56db' }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartBox>

      <ChartBox title="By Type" sub="Flood · Drought · Scarcity">
        {typeData.length === 0 ? <Empty text="No alert data yet." /> : (
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={typeData} cx="50%" cy="50%" outerRadius={58} dataKey="value"
                label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                labelLine={false} fontSize={9}>
                {typeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip {...tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartBox>

      <ChartBox title="Risk Levels" sub="Distribution">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={riskData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#8a9ab0' }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: '#8a9ab0' }} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {riskData.map(entry => <Cell key={entry.name} fill={BAR_COLORS[entry.name]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartBox>
    </div>
  );
}

function ChartBox({ title, sub, children }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px' }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)' }}>{title}</p>
      <p style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8 }}>{sub}</p>
      {children}
    </div>
  );
}

function PipelineFlow() {
  const steps = [
    { n: '01', label: 'Open-Meteo',      sub: 'Rainfall, temp, soil moisture'   },
    { n: '02', label: 'GloFAS Flood',    sub: 'River discharge (m³/s)'          },
    { n: '03', label: 'Validate',        sub: 'Clean + threshold scoring'       },
    { n: '04', label: 'IMD Context',     sub: 'Compare vs historical normals'   },
    { n: '05', label: 'Impact',          sub: 'Risk level + cascade score'      },
    { n: '06', label: 'Gemini',          sub: 'Trilingual EN / HI / Regional'   },
    { n: '07', label: 'Dispatch',        sub: 'Telegram + Email to panchayat'   },
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, overflowX: 'auto', paddingBottom: 4, marginTop: 16 }}>
      {steps.map((s, i) => (
        <div key={s.n} style={{ display: 'flex', alignItems: 'flex-start', flexShrink: 0 }}>
          <div style={{ textAlign: 'center', width: 96 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'var(--navy)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, margin: '0 auto 6px',
              fontFamily: 'var(--mono)',
            }}>{s.n}</div>
            <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-1)' }}>{s.label}</p>
            <p style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>{s.sub}</p>
          </div>
          {i < steps.length - 1 && (
            <div style={{ width: 20, height: 1, background: 'var(--border)', margin: '18px 0 0', flexShrink: 0 }} />
          )}
        </div>
      ))}
    </div>
  );
}