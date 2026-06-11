export function formatDate(isoString) {
  return new Date(isoString).toLocaleString('en-IN', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function formatConfidence(score) {
  return `${Math.round((score || 0) * 100)}%`;
}

export function riskColor(level) {
  return { LOW: '#16a34a', MODERATE: '#d97706', HIGH: '#dc2626', CRITICAL: '#7c3aed' }[level] || '#dc2626';
}

export function riskBg(level) {
  return { LOW: '#f0fdf4', MODERATE: '#fffbeb', HIGH: '#fef2f2', CRITICAL: '#f5f3ff' }[level] || '#fef2f2';
}