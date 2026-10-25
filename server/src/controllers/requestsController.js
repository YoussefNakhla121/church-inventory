const supabase = require('../config/supabase');
const {
  sendNewRequestEmails,
  sendStatusChangeEmails,
} = require('../utils/emails');
const { runInBackground } = require('../utils/background');
const { invalidateAvailability } = require('../utils/cacheKeys');
const { calculateTotalPrice } = require('../utils/pricing');
const { photoUrl } = require('../utils/storage');

// All valid statuses a manager can assign
const VALID_STATUSES = ['approved', 'prepared', 'completed', 'cancelled', 'rejected'];

// Max days ahead a requester can book
const MAX_ADVANCE_DAYS = 90;

const parsePaging = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(query.pageSize, 10) || 20, 1), 50);
  const from = (page - 1) * pageSize;
  return { page, pageSize, from, to: from + pageSize - 1 };
};

const expandRequestPhotos = (request) => ({
  ...request,
  request_items: (request.request_items || []).map((requestItem) => ({
    ...requestItem,
    items: requestItem.items
      ? { ...requestItem.items, photo_url: photoUrl(requestItem.items.photo_url) }
      : requestItem.items,
  })),
});

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

          const totalPrice = calculateTotalPrice(items, priceMap, start, end);

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

    if (data.success) {
      await invalidateAvailability();
    }

    // RPC returns { success, request_id } on approval or { success, conflicts } on rejection
    const statusCode = data.success ? 201 : 409;
    res.status(statusCode).json(data);

    const requestData = {
      ...data,
      start_time,
      end_time,
      notes: notes || null,
      gradegroup: gradegroup ?? null,
      status: data.success ? 'approved' : 'rejected',
    };
    runInBackground(
      sendNewRequestEmails(data.request_id || 'unknown', requestData, req.user.id, items)
    );
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
    const { page, pageSize, from, to } = parsePaging(req.query);
    const { data, count, error } = await supabase
      .from('requests')
      .select(`
        id,
        start_time,
        end_time,
        notes,
        status,
        gradegroup,
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
      `, { count: 'exact' })
      .eq('requester_id', req.user.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({
      data: (data || []).map(expandRequestPhotos),
      total: count || 0,
      page,
      pageSize,
    });
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

    await invalidateAvailability();
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
    const { page, pageSize, from, to } = parsePaging(req.query);

    const VALID_STATUSES = ['approved', 'rejected', 'prepared', 'completed', 'cancelled'];

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    const requestedDate = req.query.date
      ? new Date(`${req.query.date}T00:00:00.000Z`)
      : null;

    if (requestedDate && isNaN(requestedDate)) {
      return res.status(400).json({ error: 'Invalid date filter' });
    }

    let query = supabase
      .from('requests')
      .select(`
        id,
        start_time,
        end_time,
        notes,
        status,
        gradegroup,
        rejection_reason,
        rejection_detail,
        created_at,
        requester:users!requests_requester_id_fkey (
          id,
          full_name,
          gmail,
          phone,
          gradegroup
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
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    if (status) {
      query = query.eq('status', status);
    }
    if (requestedDate) {
      const nextDate = new Date(requestedDate);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      query = query
        .lt('start_time', nextDate.toISOString())
        .gte('end_time', requestedDate.toISOString());
    }

    const { data, count, error } = await query;

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({
      data: (data || []).map(expandRequestPhotos),
      total: count || 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error('getAllRequests error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/requests/:id
 * Managers can fetch any request; requesters can fetch only their own request.
 */
const getRequestById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }

    const requesterSelect =
      req.user.role === 'manager'
        ? `,
        requester:users!requests_requester_id_fkey (
          id,
          full_name,
          gmail,
          phone,
          gradegroup
        )`
        : '';

    const { data, error } = await supabase
      .from('requests')
      .select(`
        id,
        requester_id,
        start_time,
        end_time,
        notes,
        status,
        gradegroup,
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
        )${requesterSelect}
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data || (req.user.role !== 'manager' && data.requester_id !== req.user.id)) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const { requester_id, ...request } = data;
    return res.status(200).json(expandRequestPhotos(request));
  } catch (err) {
    console.error('getRequestById error:', err);
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

    const { data, error } = await supabase.rpc('change_request_status', {
      p_request_id: id,
      p_new_status: newStatus,
    });

    if (error) return res.status(500).json({ error: error.message });

    if (!data?.success) {
      if (data?.code === 'not_found') {
        return res.status(404).json({ error: 'Request not found' });
      }
      if (data?.code === 'unchanged') {
        return res.status(400).json({ error: `Request is already "${newStatus}"` });
      }
      if (data?.code === 'invalid_status') {
        return res.status(400).json({
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        });
      }
      if (data?.code === 'no_items') {
        return res.status(409).json({
          error: 'This request has no items attached (rejected requests do not store items), so it cannot be reinstated. Please create a new request instead.',
        });
      }
      if (data?.code === 'conflict') {
        return res.status(409).json({
          error: 'Some items are unavailable in this window',
          conflicts: data.conflicts,
        });
      }
      return res.status(500).json({ error: 'Unexpected status change result' });
    }

    await invalidateAvailability();
    res.status(200).json(data.request);
    runInBackground(sendStatusChangeEmails(id, data.request, req.user.id));
  } catch (err) {
    console.error('updateRequestStatus error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  parsePaging,
  createRequest,
  getMyRequests,
  cancelRequest,
  getAllRequests,
  getRequestById,
  updateRequestStatus,
};
