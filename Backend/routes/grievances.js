import express from 'express';
import { v4 as uuid } from 'uuid';
import supabase from '../models/index.js';
import { broadcast } from '../services/websocket.js';
import { sendGrievanceConfirmation } from '../services/telegram.js';

const router = express.Router();

const ROUTING_MAP = {
  FLOOD: 'NDRF', WATERLOGGING: 'GRAM_PANCHAYAT', PIPE_BURST: 'PHED',
  CONTAMINATION: 'PHED', DRY_TAP: 'PHED', DROUGHT: 'DISTRICT_COLLECTOR',
  GROUNDWATER: 'DISTRICT_COLLECTOR', OTHER: 'GRAM_PANCHAYAT',
};

// GET /api/grievances
router.get('/', async (req, res) => {
  try {
    const { district, status, issueType, limit = 50 } = req.query;
    let query = supabase.from('grievances').select('*').order('created_at', { ascending: false }).limit(parseInt(limit));
    if (district)  query = query.ilike('district',   `%${district}%`);
    if (status)    query = query.eq('status',         status);
    if (issueType) query = query.eq('issue_type',     issueType);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, count: data.length, grievances: data.map(formatGrievance) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/grievances
router.post('/', async (req, res) => {
  try {
    const grievanceId = `GRV-${Date.now()}-${uuid().slice(0, 5).toUpperCase()}`;
    const routedTo    = ROUTING_MAP[req.body.issueType] || 'GRAM_PANCHAYAT';

    const { data, error } = await supabase
      .from('grievances')
      .insert({ ...mapGrievanceToRow(req.body), grievance_id: grievanceId, routed_to: routedTo, status: 'ROUTED' })
      .select()
      .single();

    if (error) throw error;
    const g = formatGrievance(data);
    broadcast('GRIEVANCE_RECEIVED', g);

    if (req.body.reporterPhone) {
      sendGrievanceConfirmation({ phone: req.body.reporterPhone, grievanceId, routedTo, issueType: req.body.issueType })
        .catch(e => console.error('[WA GRIEVANCE]', e.message));
    }

    res.status(201).json({ success: true, grievanceId, grievance: g });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/grievances/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const { data, error } = await supabase
      .from('grievances')
      .update({ status, ...(status === 'RESOLVED' ? { resolved_at: new Date().toISOString() } : {}) })
      .eq('grievance_id', req.params.id)
      .select()
      .single();

    if (error) return res.status(404).json({ success: false, error: 'Not found' });
    const g = formatGrievance(data);
    broadcast('GRIEVANCE_UPDATED', g);
    res.json({ success: true, grievance: g });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/grievances/seed
router.post('/seed', async (req, res) => {
  try {
    const demos = [
      { reporter_phone: '919876543210', reporter_name: 'Gurpreet Kaur',  district: 'Ludhiana',  state: 'Punjab',    village: 'Sahnewal',  issue_type: 'WATERLOGGING', description: 'पानी भर गया है खेतों में',  severity: 'HIGH',     routed_to: 'GRAM_PANCHAYAT',     status: 'ROUTED'      },
      { reporter_phone: '919876543216', reporter_name: 'Lalita Devi',    district: 'Barmer',    state: 'Rajasthan', village: 'Baytu',     issue_type: 'DRY_TAP',      description: 'नल में पानी नहीं आ रहा',  severity: 'HIGH',     routed_to: 'PHED',               status: 'IN_PROGRESS' },
      { reporter_phone: '919876543213', reporter_name: 'Harmeet Kaur',   district: 'Patiala',   state: 'Punjab',    village: 'Rajpura',   issue_type: 'PIPE_BURST',   description: 'पाइप फट गई है',           severity: 'MEDIUM',   routed_to: 'PHED',               status: 'RESOLVED'    },
      { reporter_phone: '919876543219', reporter_name: 'Kamla Devi',     district: 'Jaisalmer', state: 'Rajasthan', village: 'Pokaran',   issue_type: 'DROUGHT',      description: 'कुएं सूख गए हैं',         severity: 'CRITICAL', routed_to: 'DISTRICT_COLLECTOR', status: 'ROUTED'      },
      { reporter_phone: '919876543211', reporter_name: 'Manpreet Singh', district: 'Ludhiana',  state: 'Punjab',    village: 'Doraha',    issue_type: 'CONTAMINATION',description: 'पानी गंदा आ रहा है',      severity: 'HIGH',     routed_to: 'PHED',               status: 'IN_PROGRESS' },
    ];

    await supabase.from('grievances').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    const seeded = await Promise.all(
      demos.map((d, i) =>
        supabase.from('grievances').insert({ ...d, grievance_id: `GRV-DEMO-${i + 1}` }).select().single()
      )
    );

    res.json({ success: true, count: seeded.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function formatGrievance(row) {
  return {
    grievanceId:   row.grievance_id,
    reporterPhone: row.reporter_phone,
    reporterName:  row.reporter_name,
    district:      row.district,
    state:         row.state,
    village:       row.village,
    issueType:     row.issue_type,
    description:   row.description,
    severity:      row.severity,
    routedTo:      row.routed_to,
    status:        row.status,
    createdAt:     row.created_at,
    resolvedAt:    row.resolved_at,
  };
}

function mapGrievanceToRow(body) {
  return {
    reporter_phone: body.reporterPhone,
    reporter_name:  body.reporterName,
    district:       body.district,
    state:          body.state,
    village:        body.village,
    issue_type:     body.issueType,
    description:    body.description,
    severity:       body.severity,
  };
}

export default router;