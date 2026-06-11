import express from 'express';
import supabase from '../models/index.js';
import { broadcast } from '../services/websocket.js';
import { recalculateConfidence, shouldEscalate, shouldDismiss } from '../services/confidence.js';
import { sendEscalationEmail } from '../services/email.js';

const router = express.Router();

// GET /api/whatsapp/webhook — Meta verification handshake
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[WA] Webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// POST /api/whatsapp/webhook — incoming reporter reply (YES/NO button click)
router.post('/webhook', async (req, res) => {
  try {
    res.sendStatus(200); // ack immediately to Meta

    const entry    = req.body?.entry?.[0];
    const changes  = entry?.changes?.[0]?.value;
    const messages = changes?.messages;

    if (!messages?.length) return;

    for (const msg of messages) {
      const phone = msg.from;
      let responseText = '';
      let buttonId     = '';

      if (msg.type === 'interactive' && msg.interactive?.type === 'button_reply') {
        buttonId     = msg.interactive.button_reply.id;   // e.g. "YES_AQA-DEMO-123"
        responseText = msg.interactive.button_reply.title;
      } else if (msg.type === 'text') {
        const text = msg.text?.body?.trim().toUpperCase();
        buttonId   = text === 'हाँ' || text === 'YES' || text === 'HAN' ? 'YES_MANUAL' : 'NO_MANUAL';
        responseText = msg.text.body;
      }

      if (!buttonId) continue;

      const isYes    = buttonId.startsWith('YES');
      const response = isYes ? 'YES' : 'NO';

      // Extract alertId from button ID (format: YES_<alertId> or NO_<alertId>)
      const parts   = buttonId.split('_');
      const alertId = parts.slice(1).join('_');

      if (!alertId || alertId === 'MANUAL') {
        // Can't determine which alert — skip
        continue;
      }

      await processReporterResponse({ alertId, phone, response, responseText });
    }
  } catch (err) {
    console.error('[WA WEBHOOK]', err.message);
  }
});

async function processReporterResponse({ alertId, phone, response, responseText }) {
  const { data: alertRow } = await supabase
    .from('alerts')
    .select(`*, reporter_responses(*)`)
    .eq('alert_id', alertId)
    .single();

  if (!alertRow) return;

  const slot = alertRow.reporter_responses.find(r => r.phone === phone && r.response === 'PENDING');
  if (!slot) return;

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
  if (shouldDismiss(confidence))  newStatus = 'DISMISSED';
  else if (label === 'CRITICAL')  newStatus = 'ESCALATED';

  await supabase
    .from('alerts')
    .update({ current_confidence: confidence, confidence_label: label, reporters_confirmed: yesCount, status: newStatus })
    .eq('alert_id', alertId);

  if (newStatus === 'ESCALATED' && alertRow.email_sent_to?.length) {
    sendEscalationEmail({ alert: alertRow, recipients: alertRow.email_sent_to })
      .catch(e => console.error('[ESC EMAIL]', e.message));
    broadcast('ALERT_ESCALATED', { alertId, district: alertRow.district, confidence, yesCount, total: alertRow.reporters_pinged });
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
}

export default router;