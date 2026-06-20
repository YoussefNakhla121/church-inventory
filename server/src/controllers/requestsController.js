const supabase = require('../config/supabase');

// All valid statuses a manager can assign
const VALID_STATUSES = ['approved', 'prepared', 'completed', 'cancelled', 'rejected'];

// Max days ahead a requester can book
const MAX_ADVANCE_DAYS = 90;

/**
 * POST /api/requests
 * Any authenticated user. Calls the Postgres RPC 'create_request'.
 * Body: { start_time, end_time, notes, items: [{ item_id, quantity_requested }], gradegroup (optional, required for managers) }
 */
const createRequest = async (req, res) => {
  try {
    const { start_time, end_time, notes, items, gradegroup } = req.body;

    // ── Validate required fields ──────────────────────────────────────────────
    if (!start_time || !end_time || !items) {
      return res.status(400).json({ error: 'start_time, end_time, and items are required' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items must be a non-empty array' });
    }

    for (const item of items) {
      if (!item.item_id || !item.quantity_requested || item.quantity_requested < 1) {
        return res
          .status(400)
          .json({ error: 'Each item must have item_id and quantity_requested >= 1' });
      }
    }

    // ── Validate gradegroup for managers ──────────────────────────────────────
    if (req.user.role === 'manager') {
      if (!gradegroup || gradegroup.trim() === '') {
        return res.status(400).json({ error: 'Gradegroup is required for managers' });
      }
    }

    const start = new Date(start_time);
    const end = new Date(end_time);

    if (isNaN(start) || isNaN(end)) {
      return res.status(400).json({ error: 'Invalid date format for start_time or end_time' });
    }

    if (end <= start) {
      return res.status(400).json({ error: 'end_time must be after start_time' });
    }

    // ── Enforce 90-day advance booking rule ───────────────────────────────────
    const now = new Date();
    const diffDays = (start - now) / (1000 * 60 * 60 * 24);
    if (diffDays > MAX_ADVANCE_DAYS) {
      return res.status(400).json({
        error: `Reservations can be made at most ${MAX_ADVANCE_DAYS} days in advance`,
      });
    }

    if (start < now) {
      return res.status(400).json({ error: 'start_time cannot be in the past' });
    }

    // ── Call Supabase RPC (handles availability check + insertion atomically) ─
    const { data, error } = await supabase.rpc('create_request', {
      p_requester_id: req.user.id,
      p_start_time: start.toISOString(),
      p_end_time: end.toISOString(),
      p_notes: notes || null,
      p_items: items,
      p_gradegroup: gradegroup ?? null,
    });

    if (error) return res.status(500).json({ error: error.message });

    // RPC returns { success, request_id } on approval or { success, conflicts } on rejection
    const statusCode = data.success ? 201 : 409;
    return res.status(statusCode).json(data);
  } catch (err) {
    console.error('createRequest error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/requests/mine
 * Returns all requests for the authenticated user,
 * including request_items joined with item name.
 */
const getMyRequests = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('requests')
      .select(`
        id,
        start_time,
        end_time,
        notes,
        status,
        rejection_reason,
        rejection_detail,
        created_at,
        request_items (
          id,
          quantity_requested,
          items (
            id,
            name,
            photo_url
          )
        )
      `)
      .eq('requester_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json(data);
  } catch (err) {
    console.error('getMyRequests error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * PATCH /api/requests/:id/cancel
 * Requester only. Cancels their own request if not yet prepared or completed.
 */
const cancelRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: request, error: lookupError } = await supabase
      .from('requests')
      .select('id, requester_id, status')
      .eq('id', id)
      .maybeSingle();

    if (lookupError) return res.status(500).json({ error: lookupError.message });
    if (!request) return res.status(404).json({ error: 'Request not found' });

    // Verify ownership
    if (request.requester_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only cancel your own requests' });
    }

    // Block cancellation if already prepared or completed
    if (request.status === 'prepared' || request.status === 'completed') {
      return res.status(400).json({
        error: `Cannot cancel a request with status "${request.status}"`,
      });
    }

    if (request.status === 'cancelled') {
      return res.status(400).json({ error: 'Request is already cancelled' });
    }

    const { data, error } = await supabase
      .from('requests')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json(data);
  } catch (err) {
    console.error('cancelRequest error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/requests
 * Manager only. Returns all requests with requester username and phone.
 * Supports optional ?status= query param to filter by status.
 */
const getAllRequests = async (req, res) => {
  try {
    const { status } = req.query;

    const VALID_STATUSES = ['approved', 'rejected', 'prepared', 'completed', 'cancelled'];

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    let query = supabase
      .from('requests')
      .select(`
        id,
        start_time,
        end_time,
        notes,
        status,
        rejection_reason,
        rejection_detail,
        created_at,
        requester:users!requests_requester_id_fkey (
          id,
          username,
          phone
        ),
        request_items (
          id,
          quantity_requested,
          items (
            id,
            name,
            photo_url
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json(data);
  } catch (err) {
    console.error('getAllRequests error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * PATCH /api/requests/:id/status
 * Manager only. Sets status to any valid value.
 */
const updateRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status: newStatus } = req.body;

    if (!newStatus) {
      return res.status(400).json({ error: 'status field is required' });
    }

    if (!VALID_STATUSES.includes(newStatus)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    const { data: request, error: lookupError } = await supabase
      .from('requests')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (lookupError) return res.status(500).json({ error: lookupError.message });
    if (!request) return res.status(404).json({ error: 'Request not found' });

    if (request.status === newStatus) {
      return res.status(400).json({ error: `Request is already "${newStatus}"` });
    }

    const { data, error } = await supabase
      .from('requests')
      .update({ status: newStatus })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json(data);
  } catch (err) {
    console.error('updateRequestStatus error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  createRequest,
  getMyRequests,
  cancelRequest,
  getAllRequests,
  updateRequestStatus,
};
