import express from 'express';
import supabase from '../models/index.js';
import { broadcast } from '../services/websocket.js';
import { recalculateConfidence, shouldEscalate, shouldDismiss } from '../services/confidence.js';
import { sendEscalationEmail } from '../services/email.js';

const router = express.Router();

// GET /api/reporters
router.get('/', async (req, res) => {
  try {
    const { district, state } = req.query;
    let query = supabase.from('reporters').select('*').order('created_at', { ascending: false });
    if (district) query = query.ilike('district', `%${district}%`);
    if (state)    query = query.ilike('state',    `%${state}%`);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, count: data.length, reporters: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/reporters
router.post('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('reporters').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json({ success: true, reporter: data });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/reporters/seed
router.post('/seed', async (req, res) => {
  try {
    const demoReporters = [
      { name: 'Gurpreet Kaur',   phone: '919876543210', district: 'Ludhiana',  state: 'Punjab',    village: 'Sahnewal',   role: 'SHG_LEADER',  gender: 'FEMALE' },
      { name: 'Manpreet Singh',  phone: '919876543211', district: 'Ludhiana',  state: 'Punjab',    village: 'Doraha',     role: 'PANCHAYAT',   gender: 'MALE'   },
      { name: 'Simran Bhatia',   phone: '919876543212', district: 'Ludhiana',  state: 'Punjab',    village: 'Machhiwara', role: 'ASHA_WORKER', gender: 'FEMALE' },
      { name: 'Harmeet Kaur',    phone: '919876543213', district: 'Patiala',   state: 'Punjab',    village: 'Rajpura',    role: 'SHG_LEADER',  gender: 'FEMALE' },
      { name: 'Ranjit Dhaliwal', phone: '919876543214', district: 'Patiala',   state: 'Punjab',    village: 'Nabha',      role: 'COMMUNITY',   gender: 'MALE'   },
      { name: 'Navneet Kaur',    phone: '919876543215', district: 'Patiala',   state: 'Punjab',    village: 'Samana',     role: 'ASHA_WORKER', gender: 'FEMALE' },
      { name: 'Lalita Devi',     phone: '919876543216', district: 'Barmer',    state: 'Rajasthan', village: 'Baytu',      role: 'SHG_LEADER',  gender: 'FEMALE' },
      { name: 'Bhura Ram',       phone: '919876543217', district: 'Barmer',    state: 'Rajasthan', village: 'Balotra',    role: 'PANCHAYAT',   gender: 'MALE'   },
      { name: 'Santosh Kumari',  phone: '919876543218', district: 'Barmer',    state: 'Rajasthan', village: 'Sindhari',   role: 'ASHA_WORKER', gender: 'FEMALE' },
      { name: 'Kamla Devi',      phone: '919876543219', district: 'Jaisalmer', state: 'Rajasthan', village: 'Pokaran',    role: 'SHG_LEADER',  gender: 'FEMALE' },
      { name: 'Mohan Lal',       phone: '919876543220', district: 'Jaisalmer', state: 'Rajasthan', village: 'Ramgarh',    role: 'COMMUNITY',   gender: 'MALE'   },
      { name: 'Geeta Sharma',    phone: '919876543221', district: 'Jaisalmer', state: 'Rajasthan', village: 'Sam',        role: 'ASHA_WORKER', gender: 'FEMALE' },
    ];

    await supabase.from('reporters').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    const { data, error } = await supabase.from('reporters').insert(demoReporters).select();
    if (error) throw error;
    res.json({ success: true, count: data.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/reporters/respond — core feedback loop
router.post('/respond', async (req, res) => {
  try {
    const { alertId, phone, response, responseText } = req.body;

    if (!alertId || !phone || !['YES', 'NO'].includes(response)) {
      return res.status(400).json({ success: false, error: 'Required: alertId, phone, response (YES|NO)' });
    }

    // Get alert with reporter responses
    const { data: alertRow, error: alertErr } = await supabase
      .from('alerts')
      .select(`*, reporter_responses(*)`)
      .eq('alert_id', alertId)
      .single();

    if (alertErr || !alertRow) return res.status(404).json({ success: false, error: 'Alert not found' });

    // Find the pending reporter slot
    const slot = alertRow.reporter_responses.find(r => r.phone === phone && r.response === 'PENDING');
    if (!slot) return res.status(409).json({ success: false, error: 'Reporter not found or already responded' });

    // Update response
    await supabase
      .from('reporter_responses')
      .update({ response, response_text: responseText || (response === 'YES' ? 'हाँ, स्थिति गंभीर है' : 'नहीं, यहाँ ठीक है'), responded_at: new Date().toISOString() })
      .eq('id', slot.id);

    // Recalculate confidence using updated responses
    const updatedResponses = alertRow.reporter_responses.map(r =>
      r.id === slot.id ? { ...r, response } : r
    );

    const mockAlert = {
      initialConfidence:  alertRow.initial_confidence,
      reporterResponses:  updatedResponses.map(r => ({ response: r.response })),
      reportersPinged:    alertRow.reporters_pinged,
    };

    const oldLabel = alertRow.confidence_label;
    const { confidence, label, yesCount, noCount, responded } = recalculateConfidence(mockAlert);

    let newStatus = alertRow.status;
    if (shouldDismiss(confidence))                    newStatus = 'DISMISSED';
    else if (label === 'CRITICAL')                    newStatus = 'ESCALATED';

    await supabase
      .from('alerts')
      .update({ current_confidence: confidence, confidence_label: label, reporters_confirmed: yesCount, status: newStatus })
      .eq('alert_id', alertId);

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

    if (newStatus === 'ESCALATED' && alertRow.email_sent_to?.length) {
      sendEscalationEmail({ alert: alertRow, recipients: alertRow.email_sent_to })
        .catch(e => console.error('[ESC EMAIL]', e.message));
    }

    res.json({ success: true, alertId, newConfidence: confidence, newLabel: label, yesCount, noCount, responded, status: newStatus });
  } catch (err) {
    console.error('[RESPOND]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;