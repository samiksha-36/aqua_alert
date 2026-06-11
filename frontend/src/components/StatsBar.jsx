export default function StatsBar({ stats }) {
  const items = [
    { label: 'Total Alerts', value: stats.total,    color: '#3b82f6', bg: '#eff6ff' },
    { label: 'Active',       value: stats.active,   color: '#f59e0b', bg: '#fffbeb' },
    { label: 'Critical',     value: stats.critical, color: '#7c3aed', bg: '#f5f3ff' },
    { label: 'Confirmed',    value: stats.confirmed,color: '#16a34a', bg: '#f0fdf4' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
      {items.map(item => (
        <div key={item.label} style={{
          background: '#fff',
          border: `1px solid ${item.bg}`,
          borderRadius: 12,
          padding: '16px 20px',
          borderLeft: `4px solid ${item.color}`,
        }}>
          <p style={{ fontSize: 24, fontWeight: 700, color: item.color }}>{item.value}</p>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{item.label}</p>
        </div>
      ))}
    </div>
  );
}