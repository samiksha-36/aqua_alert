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

// POST /api/alerts/demo/trigger — uses REAL Open-Meteo data
router.post('/demo/trigger', async (req, res) => {
  try {
    const DISTRICTS = [
      { district: 'Ludhiana',  state: 'Punjab',    lat: 30.9,  lon: 75.85, riverWidth: 180 },
      { district: 'Barmer',    state: 'Rajasthan', lat: 25.75, lon: 71.4,  riverWidth: 30  },
      { district: 'Patiala',   state: 'Punjab',    lat: 30.33, lon: 76.4,  riverWidth: 120 },
      { district: 'Jaisalmer', state: 'Rajasthan', lat: 26.92, lon: 70.9,  riverWidth: 20  },
    ];

    const demo = DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)];

    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${demo.lat}&longitude=${demo.lon}` +
      `&daily=precipitation_sum,temperature_2m_max` +
      `&current=soil_moisture_0_to_1cm` +
      `&timezone=Asia/Kolkata&forecast_days=1`;

    const floodUrl =
      `https://flood-api.open-meteo.com/v1/flood` +
      `?latitude=${demo.lat}&longitude=${demo.lon}` +
      `&daily=river_discharge&forecast_days=1`;

    const [weatherRes, floodRes] = await Promise.all([
      fetch(weatherUrl),
      fetch(floodUrl),
    ]);

    const weatherData = await weatherRes.json();
    const floodData   = await floodRes.json();

    const rainfall    = weatherData?.daily?.precipitation_sum?.[0]  ?? 0;
    const temperature = weatherData?.daily?.temperature_2m_max?.[0] ?? 30;
    const soilRaw     = weatherData?.current?.soil_moisture_0_to_1cm ?? 0.3;
    const soilPct     = Math.min(Math.round(soilRaw * 100 * 10) / 10, 100);
    const discharge   = floodData?.daily?.river_discharge?.[0] ?? null;
    const riverLevel  = discharge && discharge > 0
      ? Math.round(((discharge / demo.riverWidth) ** 0.6) * 100) / 100
      : Math.round((rainfall / 20) * 100) / 100;

    let riskScore = 0;
    let alertType = 'FLOOD';

    if (rainfall > 150) riskScore += 0.45;
    else if (rainfall > 80) riskScore += 0.25;
    if (riverLevel > 8) riskScore += 0.30;
    else if (riverLevel > 6) riskScore += 0.15;
    if (soilPct > 85) riskScore += 0.15;
    if (rainfall < 5 && temperature > 38) { riskScore = Math.max(riskScore, 0.55); alertType = 'DROUGHT'; }
    if (soilPct < 10) { riskScore = Math.max(riskScore, 0.50); alertType = alertType !== 'DROUGHT' ? 'GROUNDWATER' : 'DROUGHT'; }

    riskScore = Math.min(riskScore, 1.0);

    const riskLevel  = riskScore >= 0.85 ? 'CRITICAL' : riskScore >= 0.65 ? 'HIGH' : riskScore >= 0.50 ? 'MODERATE' : 'LOW';
    const confidence = parseFloat((0.60 + riskScore * 0.35).toFixed(3));
    const alertId    = `AQA-DEMO-${Date.now()}`;

    const emailRecipients = process.env.ALERT_EMAIL_RECIPIENTS
      ? process.env.ALERT_EMAIL_RECIPIENTS.split(',').map(e => e.trim())
      : ['samikshakhaire05@gmail.com', 'kaushishsaksham@gmail.com'];

    const alertTexts = {
      FLOOD: {
        en:       `Heavy rainfall of ${rainfall.toFixed(1)}mm recorded in ${demo.district}. River discharge ${discharge ? discharge.toFixed(0) + 'm³/s, ' : ''}level at ${riverLevel}m. Immediate precaution advised.`,
        hi:       `${demo.district} में ${rainfall.toFixed(1)}mm भारी वर्षा। नदी स्तर ${riverLevel}m — तत्काल सावधानी बरतें।`,
        regional: `${demo.district} ਵਿੱਚ ${rainfall.toFixed(1)}mm ਭਾਰੀ ਮੀਂਹ। ਦਰਿਆ ${riverLevel}m — ਤੁਰੰਤ ਸੁਚੇਤ ਰਹੋ।`,
      },
      DROUGHT: {
        en:       `Critically low rainfall of only ${rainfall.toFixed(1)}mm in ${demo.district}. Temperature ${temperature.toFixed(1)}°C. Soil moisture at ${soilPct}%. Drought risk is high.`,
        hi:       `${demo.district} में केवल ${rainfall.toFixed(1)}mm — सूखे का संकेत। तापमान ${temperature.toFixed(1)}°C। मिट्टी नमी ${soilPct}%।`,
        regional: `${demo.district} ਵਿੱਚ ਸੋਕੇ ਦਾ ਖ਼ਤਰਾ। ਵਰਖਾ ${rainfall.toFixed(1)}mm।`,
      },
      GROUNDWATER: {
        en:       `Groundwater stress in ${demo.district}. Soil moisture critically low at ${soilPct}%. Temperature ${temperature.toFixed(1)}°C.`,
        hi:       `${demo.district} में भूजल संकट। मिट्टी नमी ${soilPct}%। तापमान ${temperature.toFixed(1)}°C।`,
        regional: `${demo.district} ਵਿੱਚ ਭੂਜਲ ਸੰਕਟ। ਮਿੱਟੀ ਨਮੀ ${soilPct}%।`,
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
        alert_type:          alertType,
        risk_level:          riskLevel,
        initial_confidence:  confidence,
        current_confidence:  confidence,
        confidence_label:    riskLevel,
        alert_text_en:       alertTexts[alertType].en,
        alert_text_hi:       alertTexts[alertType].hi,
        alert_text_regional: alertTexts[alertType].regional,
        rainfall_mm:         Math.round(rainfall * 10) / 10,
        river_level_m:       riverLevel,
        soil_moisture_pct:   soilPct,
        temperature_c:       Math.round(temperature * 10) / 10,
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
        alertType,
        alertHindi:   alertTexts[alertType].hi,
      }).catch(e => console.error('[TG PING]', e.message));
    }

    res.json({ success: true, alertId, alert: fullAlert, source: 'open-meteo-live' });
  } catch (err) {
    console.error('[DEMO TRIGGER]', err);
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