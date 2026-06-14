import { Resend } from 'resend';

// Lazy init — reads env at call time, not module load time
function resend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY not set in environment');
  return new Resend(key);
}

const RISK_COLORS = { LOW: '#22c55e', MODERATE: '#f59e0b', HIGH: '#ef4444', CRITICAL: '#7c3aed' };

export async function sendAlertEmail({ alert, recipients }) {
  const color      = RISK_COLORS[alert.riskLevel] || '#ef4444';
  const confidence = Math.round((alert.currentConfidence || 0) * 100);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid ${color}; border-radius: 12px; overflow: hidden;">
      <div style="background: ${color}; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 22px;">
          AquaAlert — ${alert.riskLevel} RISK
        </h1>
        <p style="color: white; margin: 8px 0 0; opacity: 0.9;">
          ${alert.alertType} Warning · ${alert.district}, ${alert.state}
        </p>
      </div>
      <div style="padding: 24px; background: #ffffff;">
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 12px; color: #1e293b;">Risk Assessment</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #64748b;">Alert ID</td><td style="font-weight: bold; color: #1e293b; font-family: monospace;">${alert.alertId}</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Confidence</td><td style="font-weight: bold; color: ${color};">${confidence}%</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">District</td><td style="font-weight: bold; color: #1e293b;">${alert.district}, ${alert.state}</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Issued At</td><td style="color: #1e293b;">${new Date(alert.createdAt).toLocaleString('en-IN')}</td></tr>
          </table>
        </div>
        <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 8px; color: #92400e;">Alert (English)</h3>
          <p style="margin: 0; color: #78350f; line-height: 1.6;">${alert.alertText?.en || 'Alert details pending.'}</p>
        </div>
        <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 8px; color: #1e40af;">सचेतना (हिन्दी)</h3>
          <p style="margin: 0; color: #1e3a8a; line-height: 1.6; font-size: 15px;">${alert.alertText?.hi || 'विवरण प्रतीक्षित।'}</p>
        </div>
        ${alert.triggerData ? `
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 12px; color: #1e293b;">Sensor Data (Open-Meteo / GloFAS)</h3>
          <p style="margin: 4px 0; color: #475569;">Rainfall: <strong>${alert.triggerData.rainfall_mm ?? 'N/A'} mm</strong></p>
          <p style="margin: 4px 0; color: #475569;">River Level: <strong>${alert.triggerData.river_level_m ?? 'N/A'} m</strong></p>
          <p style="margin: 4px 0; color: #475569;">Soil Moisture: <strong>${alert.triggerData.soil_moisture_pct ?? 'N/A'}%</strong></p>
          <p style="margin: 4px 0; color: #475569;">Temperature: <strong>${alert.triggerData.temperature_c ?? 'N/A'}°C</strong></p>
        </div>` : ''}
        <div style="background: #fef2f2; border-radius: 8px; padding: 16px;">
          <p style="margin: 0; color: #991b1b; font-size: 13px;">
            <strong>Action Required:</strong> Share this alert with your community immediately.
            NadiBot community reporters have been pinged on Telegram for ground-truth verification.
          </p>
        </div>
      </div>
      <div style="background: #f1f5f9; padding: 12px; text-align: center;">
        <p style="margin: 0; color: #94a3b8; font-size: 12px;">
          AquaAlert · National Water Innovation Hackathon 2026 · NIT Jalandhar
        </p>
      </div>
    </div>
  `;

  // Send to each recipient independently — one failure won't block the other
  const client = resend();
  const results = await Promise.allSettled(
    recipients.map(to =>
      client.emails.send({
        from:    'AquaAlert <onboarding@resend.dev>',
        to:      [to],
        subject: `[${alert.riskLevel}] ${alert.alertType} Alert — ${alert.district}, ${alert.state}`,
        html,
      })
    )
  );

  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && !r.value.error) {
      console.log(`[EMAIL] Delivered to ${recipients[i]}`);
    } else {
      const msg = r.value?.error?.message || r.reason?.message || 'unknown';
      console.error(`[EMAIL] Failed for ${recipients[i]}: ${msg}`);
    }
  });
}

export async function sendEscalationEmail({ alert, recipients }) {
  const confidence = Math.round((alert.currentConfidence || 0) * 100);
  const confirmed  = alert.reportersConfirmed || 0;
  const total      = alert.reportersPinged    || 0;

  const html = `
    <div style="font-family: Arial; max-width: 600px; margin: 0 auto; border: 3px solid #7c3aed; border-radius: 12px; overflow: hidden;">
      <div style="background: #7c3aed; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">ALERT ESCALATED TO CRITICAL</h1>
        <p style="color: #e9d5ff; margin: 8px 0 0;">${alert.district}, ${alert.state} · ${confirmed}/${total} reporters confirmed</p>
      </div>
      <div style="padding: 24px;">
        <p style="font-size: 18px; color: #1e293b;">Confidence: <strong style="color: #7c3aed;">${confidence}%</strong></p>
        <p style="color: #475569;">${confirmed} of ${total} reporters confirmed the ${alert.alertType?.toLowerCase()} situation on the ground.</p>
        <p style="color: #ef4444; font-weight: bold; margin-top: 16px;">Immediate government action is recommended.</p>
      </div>
      <div style="background: #f1f5f9; padding: 12px; text-align: center;">
        <p style="margin: 0; color: #94a3b8; font-size: 12px;">AquaAlert · NIT Jalandhar</p>
      </div>
    </div>
  `;

  const client = resend();
  const results = await Promise.allSettled(
    recipients.map(to =>
      client.emails.send({
        from:    'AquaAlert <onboarding@resend.dev>',
        to:      [to],
        subject: `[ESCALATED] ${alert.alertType} Alert CONFIRMED — ${alert.district}, ${alert.state}`,
        html,
      })
    )
  );

  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && !r.value.error) {
      console.log(`[EMAIL] Escalation delivered to ${recipients[i]}`);
    } else {
      const msg = r.value?.error?.message || r.reason?.message || 'unknown';
      console.error(`[EMAIL] Escalation failed for ${recipients[i]}: ${msg}`);
    }
  });
}