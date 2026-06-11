import express from 'express';
import { v4 as uuid } from 'uuid';
import supabase from '../models/index.js';
import { broadcast } from '../services/websocket.js';
import { sendAlertEmail } from '../services/email.js';
import { pingReporter, broadcastAlertTG } from '../services/telegram.js';

const router = express.Router();

// GET /api/alerts
router.get('/', async (req, res) => {
  try {
    const { district, state, status, limit = 50 } = req.query;

    let query = supabase
      .from('alerts')
      .select(`*, reporter_responses(*)`)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (district) query = query.ilike('district', `%${district}%`);
    if (state)    query = query.ilike('state',    `%${state}%`);
    if (status)   query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ success: true, count: data.length, alerts: data.map(formatAlert) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/alerts/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('alerts')
      .select(`*, reporter_responses(*)`)
      .eq('alert_id', req.params.id)
      .single();

    if (error) return res.status(404).json({ success: false, error: 'Alert not found' });
    res.json({ success: true, alert: formatAlert(data) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/alerts — called by LangGraph pipeline
router.post('/', async (req, res) => {
  try {
    const data    = req.body;
    const alertId = `AQA-${Date.now()}-${uuid().slice(0, 6).toUpperCase()}`;

    const { data: reporters } = await supabase
      .from('reporters')
      .select('*')
      .ilike('district', `%${data.district}%`)
      .eq('is_active', true)
      .limit(3);

    const { data: alert, error } = await supabase
      .from('alerts')
      .insert({
        alert_id:            alertId,
        district:            data.district,
        state:               data.state,
        alert_type:          data.alertType,
        risk_level:          data.riskLevel,
        initial_confidence:  data.initialConfidence,
        current_confidence:  data.initialConfidence,
        confidence_label:    data.riskLevel,
        alert_text_en:       data.alertText?.en,
        alert_text_hi:       data.alertText?.hi,
        alert_text_regional: data.alertText?.regional,
        rainfall_mm:         data.triggerData?.rainfall_mm,
        river_level_m:       data.triggerData?.river_level_m,
        soil_moisture_pct:   data.triggerData?.soil_moisture_pct,
        temperature_c:       data.triggerData?.temperature_c,
        reporters_pinged:    reporters?.length || 0,
        email_sent_to:       data.emailRecipients || [],
        status:              'GENERATED',
      })
      .select()
      .single();

    if (error) throw error;

    if (reporters?.length) {
      await supabase.from('reporter_responses').insert(
        reporters.map(r => ({
          alert_id:      alertId,
          reporter_name: r.name,
          phone:         r.phone,
          response:      'PENDING',
        }))
      );

      await supabase
        .from('alerts')
        .update({ status: 'DISPATCHED' })
        .eq('alert_id', alertId);
    }

    const fullAlert = buildAlertObject(alert, reporters || []);
    broadcast('ALERT_CREATED', fullAlert);

    if (data.emailRecipients?.length) {
      sendAlertEmail({ alert: fullAlert, recipients: data.emailRecipients })
        .catch(e => console.error('[EMAIL]', e.message));
    }

    broadcastAlertTG({
      alertText:  fullAlert.alertText,
      riskLevel:  fullAlert.riskLevel,
      district:   fullAlert.district,
      state:      fullAlert.state,
      alertType:  fullAlert.alertType,
      alertId:    fullAlert.alertId,
      confidence: fullAlert.currentConfidence,
    }).catch(e => console.error('[TG BROADCAST]', e.message));

    for (const reporter of (reporters || [])) {
      pingReporter({
        phone:        reporter.phone,
        reporterName: reporter.name,
        alertId,
        district:     data.district,
        alertType:    data.alertType,
        alertHindi:   data.alertText?.hi,
      }).catch(e => console.error('[TG PING]', e.message));
    }

    res.status(201).json({ success: true, alertId, alert: fullAlert });
  } catch (err) {
    console.error('[ALERT CREATE]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/alerts/demo/trigger
router.post('/demo/trigger', async (req, res) => {
  try {
    const demos = [
      { district: 'Ludhiana',  state: 'Punjab',    type: 'FLOOD',       rain: 187, river: 8.4, soil: 92 },
      { district: 'Barmer',    state: 'Rajasthan', type: 'DROUGHT',     rain: 2,   river: 0.1, soil: 8  },
      { district: 'Patiala',   state: 'Punjab',    type: 'FLOOD',       rain: 145, river: 7.1, soil: 88 },
      { district: 'Jaisalmer', state: 'Rajasthan', type: 'GROUNDWATER', rain: 4,   river: 0.0, soil: 6  },
    ];

    const demo            = demos[Math.floor(Math.random() * demos.length)];
    const riskLevel       = demo.rain > 150 || demo.soil > 85 ? 'HIGH' : 'MODERATE';
    const confidence      = parseFloat((0.72 + Math.random() * 0.12).toFixed(3));
    const alertId         = `AQA-DEMO-${Date.now()}`;
    const emailRecipients = ['samikshakhaire05@gmail.com', 'kaushishsaksham@gmail.com'];

    const alertTexts = {
      FLOOD: {
        en:       `Heavy rainfall of ${demo.rain}mm recorded in ${demo.district}. River levels at ${demo.river}m, approaching danger mark.`,
        hi:       `${demo.district} में ${demo.rain}mm भारी वर्षा। नदी ${demo.river}m — तत्काल सावधानी।`,
        regional: `${demo.district} ਵਿੱਚ ${demo.rain}mm ਭਾਰੀ ਮੀਂਹ।`,
      },
      DROUGHT: {
        en:       `Critically low rainfall of only ${demo.rain}mm in ${demo.district}. Soil moisture at ${demo.soil}%.`,
        hi:       `${demo.district} में केवल ${demo.rain}mm — सूखे का संकेत। मिट्टी नमी ${demo.soil}%।`,
        regional: `${demo.district} ਵਿੱਚ ਸੋਕੇ ਦਾ ਖ਼ਤਰਾ।`,
      },
      GROUNDWATER: {
        en:       `Groundwater stress in ${demo.district}. Soil moisture critically low at ${demo.soil}%.`,
        hi:       `${demo.district} में भूजल संकट। मिट्टी नमी ${demo.soil}%।`,
        regional: `${demo.district} ਵਿੱਚ ਭੂਜਲ ਸੰਕਟ।`,
      },
    };

    const { data: reporters } = await supabase
      .from('reporters')
      .select('*')
      .ilike('district', `%${demo.district}%`)
      .eq('is_active', true)
      .limit(3);

    const { data: alert, error } = await supabase
      .from('alerts')
      .insert({
        alert_id:            alertId,
        district:            demo.district,
        state:               demo.state,
        alert_type:          demo.type,
        risk_level:          riskLevel,
        initial_confidence:  confidence,
        current_confidence:  confidence,
        confidence_label:    riskLevel,
        alert_text_en:       alertTexts[demo.type].en,
        alert_text_hi:       alertTexts[demo.type].hi,
        alert_text_regional: alertTexts[demo.type].regional,
        rainfall_mm:         demo.rain,
        river_level_m:       demo.river,
        soil_moisture_pct:   demo.soil,
        temperature_c:       demo.type === 'DROUGHT' ? 42 : 28,
        reporters_pinged:    reporters?.length || 0,
        email_sent_to:       emailRecipients,
        status:              'DISPATCHED',
      })
      .select()
      .single();

    if (error) throw error;

    if (reporters?.length) {
      await supabase.from('reporter_responses').insert(
        reporters.map(r => ({
          alert_id:      alertId,
          reporter_name: r.name,
          phone:         r.phone,
          response:      'PENDING',
        }))
      );
    }

    const fullAlert = buildAlertObject(alert, reporters || []);
    broadcast('ALERT_CREATED', fullAlert);

    sendAlertEmail({ alert: fullAlert, recipients: emailRecipients })
      .catch(e => console.error('[EMAIL ERROR]', e.message));

    broadcastAlertTG({
      alertText:  fullAlert.alertText,
      riskLevel:  fullAlert.riskLevel,
      district:   fullAlert.district,
      state:      fullAlert.state,
      alertType:  fullAlert.alertType,
      alertId:    fullAlert.alertId,
      confidence: fullAlert.currentConfidence,
    }).catch(e => console.error('[TG BROADCAST]', e.message));

    for (const reporter of (reporters || [])) {
      pingReporter({
        phone:        reporter.phone,
        reporterName: reporter.name,
        alertId,
        district:     demo.district,
        alertType:    demo.type,
        alertHindi:   alertTexts[demo.type].hi,
      }).catch(e => console.error('[TG PING]', e.message));
    }

    res.json({ success: true, alertId, alert: fullAlert });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Helpers ───────────────────────────────────────────────────

function formatAlert(row) {
  return {
    alertId:            row.alert_id,
    district:           row.district,
    state:              row.state,
    alertType:          row.alert_type,
    riskLevel:          row.risk_level,
    initialConfidence:  row.initial_confidence,
    currentConfidence:  row.current_confidence,
    confidenceLabel:    row.confidence_label,
    alertText: {
      en:       row.alert_text_en,
      hi:       row.alert_text_hi,
      regional: row.alert_text_regional,
    },
    triggerData: {
      rainfall_mm:       row.rainfall_mm,
      river_level_m:     row.river_level_m,
      soil_moisture_pct: row.soil_moisture_pct,
      temperature_c:     row.temperature_c,
    },
    reporterResponses: (row.reporter_responses || []).map(r => ({
      reporterName: r.reporter_name,
      phone:        r.phone,
      response:     r.response,
      responseText: r.response_text,
      respondedAt:  r.responded_at,
    })),
    reportersPinged:    row.reporters_pinged,
    reportersConfirmed: row.reporters_confirmed,
    status:             row.status,
    emailSentTo:        row.email_sent_to,
    createdAt:          row.created_at,
    updatedAt:          row.updated_at,
  };
}

function buildAlertObject(alert, reporters) {
  return {
    alertId:            alert.alert_id,
    district:           alert.district,
    state:              alert.state,
    alertType:          alert.alert_type,
    riskLevel:          alert.risk_level,
    initialConfidence:  alert.initial_confidence,
    currentConfidence:  alert.current_confidence,
    confidenceLabel:    alert.confidence_label,
    alertText: {
      en:       alert.alert_text_en,
      hi:       alert.alert_text_hi,
      regional: alert.alert_text_regional,
    },
    triggerData: {
      rainfall_mm:       alert.rainfall_mm,
      river_level_m:     alert.river_level_m,
      soil_moisture_pct: alert.soil_moisture_pct,
      temperature_c:     alert.temperature_c,
    },
    reporterResponses: reporters.map(r => ({
      reporterName: r.name,
      phone:        r.phone,
      response:     'PENDING',
    })),
    reportersPinged:    reporters.length,
    reportersConfirmed: 0,
    status:             alert.status,
    createdAt:          alert.created_at,
  };
}

export default router;