const supabase = require('../config/supabase');
const {
  notifyManagersNewRequest,
  notifyRequesterRequestCreated,
  notifyRequesterStatusChange,
} = require('../utils/emails');

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

    // ── Calculate and persist total_price for approved requests ──────────────
    if (data.success && data.request_id) {
      try {
        // Fetch prices for all requested items
        const itemIds = items.map((i) => i.item_id);
        const { data: itemPrices, error: priceError } = await supabase
          .from('items')
          .select('id, price')
          .in('id', itemIds);

        if (!priceError && itemPrices) {
          const priceMap = {};
          for (const item of itemPrices) {
            priceMap[item.id] = item.price ?? 0;
          }

          // Determine number of days (ceiling, so a partial day = 1 day)
          const durationMs = end - start;
          const numDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
          const isMultiDay = numDays > 1;

          let totalPrice = 0;
          for (const item of items) {
            const unitPrice = priceMap[item.item_id] ?? 0;
            const qty = item.quantity_requested;
            if (isMultiDay) {
              // Multi-day: price × 2 × numDays × quantity
              totalPrice += unitPrice * 2 * numDays * qty;
            } else {
              // Single-day: price × quantity
              totalPrice += unitPrice * qty;
            }
          }

          // Round to 2 decimal places to avoid floating-point drift
          totalPrice = Math.round(totalPrice * 100) / 100;

          await supabase
            .from('requests')
            .update({ total_price: totalPrice })
            .eq('id', data.request_id);
        }
      } catch (priceErr) {
        // Non-fatal: log but don't block the response
        console.error('total_price calculation error:', priceErr);
      }
    }

    // RPC returns { success, request_id } on approval or { success, conflicts } on rejection
    const statusCode = data.success ? 201 : 409;
    res.status(statusCode).json(data);

    // ── Fire-and-forget email notifications ──────────────────────────────────
    try {
      const [managersResult, requesterResult, itemNamesResult] = await Promise.all([
        supabase.from('users').select('id, gmail, phone, gradegroup').eq('role', 'manager'),
        supabase.from('users').select('id, gmail, phone, gradegroup').eq('id', req.user.id).single(),
        supabase.from('items').select('id, name').in('id', items.map(i => i.item_id)),
      ]);

      if (managersResult.error || requesterResult.error || itemNamesResult.error) {
        console.error('Email data fetch error:', managersResult.error || requesterResult.error || itemNamesResult.error);
        return;
      }

      const managers = managersResult.data || [];
      const requester = requesterResult.data;
      const requestData = {
        ...data,
        start_time,
        end_time,
        notes: notes || null,
        gradegroup: gradegroup ?? requester?.gradegroup ?? null,
        status: data.success ? 'approved' : 'rejected',
      };

      const itemNameMap = {};
      for (const item of (itemNamesResult.data || [])) {
        itemNameMap[item.id] = item.name;
      }
      const emailItems = items.map(i => ({
        name: itemNameMap[i.item_id] || 'Unknown Item',
        quantity_requested: i.quantity_requested,
      }));

      Promise.all([
        notifyManagersNewRequest(requestData, requester, managers, emailItems),
        notifyRequesterRequestCreated(requestData, requester, emailItems),
      ]).catch(err => console.error('Email error:', err));
    } catch (emailErr) {
      console.error('Email error:', emailErr);
    }
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
 * Manager only. Returns all requests with requester gmail and phone.
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
          gmail,
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

    res.status(200).json(data);

    // ── Fire-and-forget email notification ────────────────────────────────────
    try {
      const { data: fullRequest, error: reqError } = await supabase
        .from('requests')
        .select(`
          id, requester_id, start_time, end_time, notes, status,
          gradegroup,
          request_items (
            quantity_requested,
            items ( id, name )
          )
        `)
        .eq('id', id)
        .single();

      if (reqError) {
        console.error('Email data fetch error:', reqError);
        return;
      }

      const { data: requester, error: userError } = await supabase
        .from('users')
        .select('id, gmail, phone')
        .eq('id', fullRequest.requester_id)
        .single();

      if (userError) {
        console.error('Email data fetch error:', userError);
        return;
      }

      const emailItems = (fullRequest.request_items || []).map(ri => ({
        name: ri.items?.name || 'Unknown Item',
        quantity_requested: ri.quantity_requested,
      }));

      const changedBy = req.user;

      notifyRequesterStatusChange(fullRequest, requester, emailItems, changedBy)
        .catch(err => console.error('Email error:', err));
    } catch (emailErr) {
      console.error('Email error:', emailErr);
    }
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
