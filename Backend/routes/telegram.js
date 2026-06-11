import express from 'express';
import supabase from '../models/index.js';
import { broadcast } from '../services/websocket.js';
import { recalculateConfidence, shouldEscalate, shouldDismiss } from '../services/confidence.js';
import { sendEscalationEmail } from '../services/email.js';

const router = express.Router();

// POST /api/telegram/webhook — Telegram sends button clicks here
router.post('/webhook', async (req, res) => {
  try {
    res.sendStatus(200);

    const update = req.body;

    // Handle YES/NO button press from reporter
    if (update.callback_query) {
      const data     = update.callback_query.data; // e.g. "YES_AQA-DEMO-123_919876543210"
      const parts    = data.split('_');
      const response = parts[0];                   // YES or NO
      const phone    = parts[parts.length - 1];    // last part = phone
      const alertId  = parts.slice(1, -1).join('_'); // middle = alertId

      if (!['YES', 'NO'].includes(response) || !alertId || !phone) return;

      await processReporterResponse({
        alertId,
        phone,
        response,
        responseText: response === 'YES' ? 'हाँ, स्थिति गंभीर है' : 'नहीं, यहाँ ठीक है',
      });

      // Acknowledge button so it stops spinning
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          callback_query_id: update.callback_query.id,
          text: response === 'YES' ? '✅ जवाब दर्ज — धन्यवाद!' : '❌ जवाब दर्ज — धन्यवाद!',
        }),
      });
    }

  } catch (err) {
    console.error('[TG WEBHOOK]', err.message);
  }
});

async function processReporterResponse({ alertId, phone, response, responseText }) {
  const { data: alertRow } = await supabase
    .from('alerts')
    .select(`*, reporter_responses(*)`)
    .eq('alert_id', alertId)
    .single();

  if (!alertRow) {
    console.log(`[TG WEBHOOK] Alert not found: ${alertId}`);
    return;
  }

  const slot = alertRow.reporter_responses.find(r => r.phone === phone && r.response === 'PENDING');
  if (!slot) {
    console.log(`[TG WEBHOOK] No pending slot for phone ${phone} on alert ${alertId}`);
    return;
  }

  await supabase
    .from('reporter_responses')
    .update({ response, response_text: responseText, responded_at: new Date().toISOString() })
    .eq('id', slot.id);

  const updatedResponses = alertRow.reporter_responses.map(r =>
    r.id === slot.id ? { ...r, response } : r
  );

  const mockAlert = {
    initialConfidence: alertRow.initial_confidence,
    reporterResponses: updatedResponses.map(r => ({ response: r.response })),
    reportersPinged:   alertRow.reporters_pinged,
  };

  const oldLabel = alertRow.confidence_label;
  const { confidence, label, yesCount, noCount, responded } = recalculateConfidence(mockAlert);

  let newStatus = alertRow.status;
  if (shouldDismiss(confidence)) newStatus = 'DISMISSED';
  else if (label === 'CRITICAL') newStatus = 'ESCALATED';

  await supabase
    .from('alerts')
    .update({
      current_confidence: confidence,
      confidence_label:   label,
      reporters_confirmed: yesCount,
      status:             newStatus,
    })
    .eq('alert_id', alertId);

  if (newStatus === 'ESCALATED' && alertRow.email_sent_to?.length) {
    sendEscalationEmail({ alert: alertRow, recipients: alertRow.email_sent_to })
      .catch(e => console.error('[ESC EMAIL]', e.message));
    broadcast('ALERT_ESCALATED', {
      alertId,
      district:   alertRow.district,
      confidence,
      yesCount,
      total:      alertRow.reporters_pinged,
    });
  }

  broadcast('CONFIDENCE_UPDATE', {
    alertId,
    district:         alertRow.district,
    state:            alertRow.state,
    alertType:        alertRow.alert_type,
    newConfidence:    confidence,
    confidenceLabel:  label,
    yesCount, noCount, responded,
    total:            alertRow.reporters_pinged,
    status:           newStatus,
    reporterName:     slot.reporter_name,
    reporterResponse: response,
    escalated:        shouldEscalate(oldLabel, label),
    dismissed:        shouldDismiss(confidence),
  });

  console.log(`[TG WEBHOOK] ${alertId} → ${response} | confidence: ${confidence} | status: ${newStatus}`);
}

export default router;