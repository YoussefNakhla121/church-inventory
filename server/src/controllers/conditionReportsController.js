const supabase = require('../config/supabase');

const VALID_CONDITIONS = ['good', 'damaged', 'missing'];

/**
 * POST /api/requests/:id/condition-reports
 * Manager only. Submit condition reports for items in a completed request.
 * Body: { reports: [{ item_id, condition, notes }] }
 */
const submitConditionReports = async (req, res) => {
  try {
    const { id } = req.params;
    const { reports } = req.body;

    // ── Validate body ─────────────────────────────────────────────────────────
    if (!reports || !Array.isArray(reports) || reports.length === 0) {
      return res.status(400).json({ error: 'reports must be a non-empty array' });
    }

    for (const report of reports) {
      if (!report.item_id) {
        return res.status(400).json({ error: 'Each report must have an item_id' });
      }
      if (!report.condition || !VALID_CONDITIONS.includes(report.condition)) {
        return res.status(400).json({
          error: `Each report condition must be one of: ${VALID_CONDITIONS.join(', ')}`,
        });
      }
    }

    // ── Verify request exists and is completed ────────────────────────────────
    const { data: request, error: reqError } = await supabase
      .from('requests')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (reqError) return res.status(500).json({ error: reqError.message });
    if (!request) return res.status(404).json({ error: 'Request not found' });

    if (request.status !== 'completed') {
      return res.status(400).json({
        error: `Condition reports can only be submitted for completed requests. Current status: "${request.status}"`,
      });
    }

    // ── Verify all reported items actually belong to this request ─────────────
    const { data: requestItems, error: riError } = await supabase
      .from('request_items')
      .select('item_id')
      .eq('request_id', id);

    if (riError) return res.status(500).json({ error: riError.message });

    const validItemIds = new Set(requestItems.map((ri) => ri.item_id));
    for (const report of reports) {
      if (!validItemIds.has(report.item_id)) {
        return res.status(400).json({
          error: `Item ${report.item_id} does not belong to this request`,
        });
      }
    }

    // ── Build insert rows ─────────────────────────────────────────────────────
    const rows = reports.map((report) => ({
      request_id: id,
      item_id: report.item_id,
      reported_by: req.user.id,
      condition: report.condition,
      notes: report.notes || null,
    }));

    const { data, error } = await supabase
      .from('item_condition_reports')
      .insert(rows)
      .select(`
        id,
        condition,
        notes,
        reported_at,
        items (
          id,
          name
        ),
        reporter:users!item_condition_reports_reported_by_fkey (
          id,
          full_name,
          gmail
        )
      `);

    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json(data);
  } catch (err) {
    console.error('submitConditionReports error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/requests/:id/condition-reports
 * Manager only. Returns all condition reports for a request
 * joined with item name and reporter gmail.
 */
const getConditionReports = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify request exists
    const { data: request, error: reqError } = await supabase
      .from('requests')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (reqError) return res.status(500).json({ error: reqError.message });
    if (!request) return res.status(404).json({ error: 'Request not found' });

    const { data, error } = await supabase
      .from('item_condition_reports')
      .select(`
        id,
        condition,
        notes,
        reported_at,
        items (
          id,
          name
        ),
        reporter:users!item_condition_reports_reported_by_fkey (
          id,
          full_name,
          gmail
        )
      `)
      .eq('request_id', id)
      .order('reported_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json(data);
  } catch (err) {
    console.error('getConditionReports error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { submitConditionReports, getConditionReports };
