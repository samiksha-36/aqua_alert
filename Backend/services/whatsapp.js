// WhatsApp Business API integration
// Handles: reporter ground-truth pings + grievance confirmations

const BASE_URL = `https://graph.facebook.com/v19.0`;

async function sendWhatsApp(phoneNumberId, to, body) {
  const res = await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('[WA] Send error:', JSON.stringify(data));
    throw new Error(`WhatsApp API error: ${data.error?.message}`);
  }
  return data;
}

// ── Ground-Truth Ping ─────────────────────────────────────────
// Sent to community reporter when AquaAlert fires
// Expects YES/NO reply — processed by /api/whatsapp/webhook
export async function pingReporter({ phone, reporterName, alertId, district, alertType, alertHindi }) {
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  const typeEmoji = alertType === 'FLOOD' ? '🌊' : alertType === 'DROUGHT' ? '🌵' : '💧';
  const typeHindi = alertType === 'FLOOD' ? 'बाढ़' : alertType === 'DROUGHT' ? 'सूखा' : 'जल संकट';

  // Interactive message with YES/NO buttons
  await sendWhatsApp(phoneId, phone, {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: {
        type: 'text',
        text: `${typeEmoji} AquaAlert — ज़मीनी सत्यापन`,
      },
      body: {
        text: `नमस्ते ${reporterName} जी 🙏\n\n` +
          `हमारे सिस्टम ने *${district}* में *${typeHindi}* का खतरा दर्ज किया है।\n\n` +
          `*${alertHindi || `क्या आपके गाँव में ${typeHindi} की स्थिति है?`}*\n\n` +
          `आपका जवाब सरकार तक पहुँचने में मदद करेगा। (Alert ID: ${alertId})`,
      },
      footer: { text: 'AquaAlert · NIT Jalandhar' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `YES_${alertId}`, title: '✅ हाँ, है' } },
          { type: 'reply', reply: { id: `NO_${alertId}`,  title: '❌ नहीं है' } },
        ],
      },
    },
  });

  console.log(`[WA] Ground-truth ping sent to ${reporterName} (${phone}) for alert ${alertId}`);
}

// ── Grievance Confirmation ────────────────────────────────────
// Sent after NadiBot receives a grievance report
export async function sendGrievanceConfirmation({ phone, grievanceId, routedTo, issueType }) {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const routeMap = {
    GRAM_PANCHAYAT: 'ग्राम पंचायत',
    PHED: 'जल विभाग (PHED)',
    DISTRICT_COLLECTOR: 'जिला कलेक्टर कार्यालय',
    NDRF: 'NDRF',
  };

  await sendWhatsApp(phoneId, phone, {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'text',
    text: {
      body: `✅ *आपकी शिकायत दर्ज हो गई है।*\n\n` +
        `शिकायत ID: *${grievanceId}*\n` +
        `समस्या: ${issueType}\n` +
        `भेजा गया: *${routeMap[routedTo] || routedTo}*\n\n` +
        `आपको समाधान होने पर सूचना दी जाएगी। 🙏\n` +
        `— NadiBot · AquaAlert`,
    },
  });
}

// ── Alert Broadcast (to Panchayat/ASHA via WA) ───────────────
export async function broadcastAlertWA({ phone, name, alertText, riskLevel, district, alertType }) {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const levelEmoji = { LOW: '🟢', MODERATE: '🟡', HIGH: '🔴', CRITICAL: '🟣' };

  await sendWhatsApp(phoneId, phone, {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'text',
    text: {
      body: `${levelEmoji[riskLevel] || '🔴'} *AquaAlert — ${riskLevel} चेतावनी*\n\n` +
        `${name} जी, *${district}* में *${alertType}* का खतरा है।\n\n` +
        `${alertText}\n\n` +
        `कृपया अपने क्षेत्र में सतर्कता बरतें और समुदाय को सूचित करें।`,
    },
  });
}