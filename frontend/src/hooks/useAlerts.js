import { useState, useEffect } from 'react';

export default function useAlerts() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    fetch('/api/alerts?limit=100')
      .then(r => r.json())
      .then(d => { if (d.success) setAlerts(d.alerts); })
      .catch(console.error);
  }, []);

  const stats = {
    total:    alerts.length,
    critical: alerts.filter(a => a.riskLevel === 'CRITICAL' || a.confidenceLabel === 'CRITICAL').length,
    high:     alerts.filter(a => a.riskLevel === 'HIGH').length,
    active:   alerts.filter(a => !['RESOLVED', 'DISMISSED'].includes(a.status)).length,
    confirmed: alerts.filter(a => a.reportersConfirmed > 0).length,
  };

  return { alerts, setAlerts, stats };
}