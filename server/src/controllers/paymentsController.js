const { validate: validateUuid } = require('uuid');
const supabase = require('../config/supabase');
const { parsePaging } = require('./requestsController');
const { sendPaymentDecisionEmails } = require('../utils/emails');
const { runInBackground } = require('../utils/background');

const VALID_STATUSES = ['pending', 'approved', 'declined', 'cancelled'];
const VALID_DECISIONS = ['approved', 'declined'];

const paymentSelect = `
  id,
  gradegroup,
  period_start,
  period_end,
  total_price,
  request_count,
  status,
  decision_note,
  created_at,
  decided_at,
  requested_by,
  decided_by,
  requested_by_user:users!payments_requested_by_fkey(full_name),
  decided_by_user:users!payments_decided_by_fkey(full_name)
`;

const mapPayment = (payment) => {
  if (!payment) return payment;
  const {
    requested_by_user: requestedByUser,
    decided_by_user: decidedByUser,
    ...rest
  } = payment;
  return {
    ...rest,
    requested_by_name: requestedByUser?.full_name || null,
    decided_by_name: decidedByUser?.full_name || null,
  };
};

const listPayments = async (req, res) => {
  try {
    const { page, pageSize, from, to } = parsePaging(req.query);
    const status = req.query.status;

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be one of: pending, approved, declined, cancelled',
      });
    }

    let query = supabase
      .from('payments')
      .select(paymentSelect, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status) query = query.eq('status', status);

    const { data, count, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({
      data: (data || []).map(mapPayment),
      total: count || 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error('listPayments error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const getPendingCount = async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ count: count || 0 });
  } catch (err) {
    console.error('getPendingCount error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const getPaymentById = async (req, res) => {
  const { id } = req.params;
  if (!validateUuid(id)) return res.status(400).json({ error: 'Invalid payment ID' });

  try {
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select(paymentSelect)
      .eq('id', id)
      .maybeSingle();

    if (paymentError) return res.status(500).json({ error: paymentError.message });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const { data: paymentRequests, error: requestsError } = await supabase
      .from('payment_requests')
      .select(`
        requests (
          id,
          start_time,
          end_time,
          gradegroup,
          total_price,
          requester:users!requests_requester_id_fkey(full_name),
          request_items (
            quantity_requested,
            items (name)
          )
        )
      `)
      .eq('payment_id', id);

    if (requestsError) return res.status(500).json({ error: requestsError.message });

    const requests = (paymentRequests || [])
      .map((row) => row.requests)
      .filter(Boolean)
      .map((request) => ({
        id: request.id,
        start_time: request.start_time,
        end_time: request.end_time,
        gradegroup: request.gradegroup,
        total_price: request.total_price,
        requester_name: request.requester?.full_name || null,
        items: (request.request_items || [])
          .filter((item) => item.items)
          .map((item) => ({
            name: item.items.name,
            quantity: item.quantity_requested,
          })),
      }));

    return res.status(200).json({ payment: mapPayment(payment), requests });
  } catch (err) {
    console.error('getPaymentById error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const decidePayment = async (req, res) => {
  const { id } = req.params;
  if (!validateUuid(id)) return res.status(400).json({ error: 'Invalid payment ID' });

  const { decision, note } = req.body || {};
  if (!VALID_DECISIONS.includes(decision)) {
    return res.status(400).json({ error: 'Decision must be approved or declined' });
  }

  try {
    const { data, error } = await supabase.rpc('decide_payment', {
      p_payment_id: id,
      p_manager_id: req.user.id,
      p_decision: decision,
      p_note: note ?? null,
    });

    if (error) return res.status(500).json({ error: error.message });
    if (data?.success) {
      res.status(200).json({ payment: data.payment });
      runInBackground(sendPaymentDecisionEmails(id));
      return;
    }

    const statusByCode = {
      not_found: 404,
      already_decided: 409,
      invalid_decision: 400,
      not_manager: 403,
    };
    const status = statusByCode[data?.code];
    if (status) return res.status(status).json({ error: data.code, code: data.code });

    return res.status(500).json({ error: 'Unexpected payment decision result' });
  } catch (err) {
    console.error('decidePayment error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  listPayments,
  getPendingCount,
  getPaymentById,
  decidePayment,
};
