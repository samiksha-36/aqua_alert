const BASE_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function sendTelegram(chatId, text, replyMarkup = null) {
  const body = {
    chat_id:    chatId,
    text,
    parse_mode: 'HTML',
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(`${BASE_URL}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error('[TG] Send error:', JSON.stringify(data));
    throw new Error(`Telegram error: ${data.description}`);
  }
  return data;
}

// ── Ground-Truth Ping ─────────────────────────────────────────
export async function pingReporter({ phone, reporterName, alertId, district, alertType, alertHindi }) {
  const chatId    = process.env.TELEGRAM_CHAT_ID;
  const typeEmoji = alertType === 'FLOOD' ? '🌊' : alertType === 'DROUGHT' ? '🌵' : '💧';
  const typeHindi = alertType === 'FLOOD' ? 'बाढ़' : alertType === 'DROUGHT' ? 'सूखा' : 'जल संकट';

  const text =
    `${typeEmoji} <b>AquaAlert — ज़मीनी सत्यापन</b>\n\n` +
    `नमस्ते <b>${reporterName}</b> जी 🙏\n\n` +
    `हमारे सिस्टम ने <b>${district}</b> में <b>${typeHindi}</b> का खतरा दर्ज किया है।\n\n` +
    `<i>${alertHindi || `क्या आपके गाँव में ${typeHindi} की स्थिति है?`}</i>\n\n` +
    `Alert ID: <code>${alertId}</code>\n\n` +
    `नीचे दिए बटन से जवाब दें 👇`;

  const replyMarkup = {
    inline_keyboard: [[
      { text: '✅ हाँ, है',  callback_data: `YES_${alertId}_${phone}` },
      { text: '❌ नहीं है', callback_data: `NO_${alertId}_${phone}`  },
    ]],
  };

  await sendTelegram(chatId, text, replyMarkup);
  console.log(`[TG] Reporter ping sent to ${reporterName} for alert ${alertId}`);
}

// ── Grievance Confirmation ────────────────────────────────────
export async function sendGrievanceConfirmation({ phone, grievanceId, routedTo, issueType }) {
  const chatId   = process.env.TELEGRAM_CHAT_ID;
  const routeMap = {
    GRAM_PANCHAYAT:     'ग्राम पंचायत',
    PHED:               'जल विभाग (PHED)',
    DISTRICT_COLLECTOR: 'जिला कलेक्टर कार्यालय',
    NDRF:               'NDRF',
  };

  const text =
    `✅ <b>आपकी शिकायत दर्ज हो गई है।</b>\n\n` +
    `शिकायत ID: <code>${grievanceId}</code>\n` +
    `समस्या: <b>${issueType}</b>\n` +
    `भेजा गया: <b>${routeMap[routedTo] || routedTo}</b>\n\n` +
    `आपको समाधान होने पर सूचना दी जाएगी। 🙏\n` +
    `— NadiBot · AquaAlert`;

  await sendTelegram(chatId, text);
  console.log(`[TG] Grievance confirmation sent for ${grievanceId}`);
}

// ── Alert Broadcast ───────────────────────────────────────────
export async function broadcastAlertTG({ alertText, riskLevel, district, state, alertType, alertId, confidence }) {
  const chatId     = process.env.TELEGRAM_CHAT_ID;
  const levelEmoji = { LOW: '🟢', MODERATE: '🟡', HIGH: '🔴', CRITICAL: '🟣' };
  const conf       = Math.round((confidence || 0) * 100);

  const text =
    `${levelEmoji[riskLevel] || '🔴'} <b>AquaAlert — ${riskLevel} चेतावनी</b>\n\n` +
    `📍 <b>${district}, ${state}</b>\n` +
    `⚠️ Type: <b>${alertType}</b>\n` +
    `📊 Confidence: <b>${conf}%</b>\n\n` +
    `🇬🇧 <i>${alertText?.en || ''}</i>\n\n` +
    `🇮🇳 ${alertText?.hi || ''}\n\n` +
    `Alert ID: <code>${alertId}</code>\n\n` +
    `— AquaAlert · NIT Jalandhar`;

  await sendTelegram(chatId, text);
  console.log(`[TG] Alert broadcast sent for ${alertId}`);
}