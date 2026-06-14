export default function StatsBar({ stats }) {
  const items = [
    { label: 'Total Alerts', value: stats.total,    accent: 'var(--blue)'   },
    { label: 'Active',       value: stats.active,   accent: 'var(--amber)'  },
    { label: 'Critical',     value: stats.critical, accent: 'var(--purple)' },
    { label: 'Confirmed',    value: stats.confirmed,accent: 'var(--green)'  },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
      {items.map(item => (
        <div key={item.label} style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}>
          <div style={{
            width: 3, height: 32, borderRadius: 99,
            background: item.accent, flexShrink: 0,
          }} />
          <div>
            <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1 }}>
              {item.value}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{item.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}