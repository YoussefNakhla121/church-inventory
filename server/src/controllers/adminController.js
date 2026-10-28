const supabase = require('../config/supabase');
const { parsePaging } = require('./requestsController');
const { validatePeriod } = require('../utils/dates');
const { sendPaymentRequestedEmails } = require('../utils/emails');
const { runInBackground } = require('../utils/background');

const validateRequestPeriod = (req, res) => {
  const { start, end } = req.query;
  const error = validatePeriod(start, end);

  if (error) {
    res.status(400).json({ error });
    return null;
  }

  return { start, end };
};

const validatePaymentPeriod = (req, res) => {
  const { start, end } = req.body || {};
  const error = validatePeriod(start, end);

  if (error) {
    res.status(400).json({ error });
    return null;
  }

  return { start, end };
};

const getSummary = async (req, res) => {
  const period = validateRequestPeriod(req, res);
  if (!period) return;

  try {
    const { data, error } = await supabase.rpc('admin_period_summary', {
      p_admin_id: req.user.id,
      p_start: period.start,
      p_end: period.end,
    });

    if (error) return res.status(500).json({ error: error.message });

    const { success, ...summary } = data || {};
    return res.status(200).json(summary);
  } catch (err) {
    console.error('getSummary error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const getRequests = async (req, res) => {
  const period = validateRequestPeriod(req, res);
  if (!period) return;

  try {
    const { page, pageSize, from } = parsePaging(req.query);
    const { data, error } = await supabase.rpc('admin_list_requests', {
      p_admin_id: req.user.id,
      p_start: period.start,
      p_end: period.end,
      p_limit: pageSize,
      p_offset: from,
    });

    if (error) return res.status(500).json({ error: error.message });

    const rows = Array.isArray(data) ? data : data?.rows || data?.data || [];
    const total = Array.isArray(data) ? rows.length : data?.total || 0;
    return res.status(200).json({ data: rows, total, page, pageSize });
  } catch (err) {
    console.error('getRequests error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const requestPayment = async (req, res) => {
  const period = validatePaymentPeriod(req, res);
  if (!period) return;

  try {
    const { data, error } = await supabase.rpc('request_payment', {
      p_admin_id: req.user.id,
      p_start: period.start,
      p_end: period.end,
    });

    if (error) return res.status(500).json({ error: error.message });
    if (data?.success) {
      res.status(201).json({ payment: data.payment });
      runInBackground(sendPaymentRequestedEmails(data.payment.id));
      return;
    }

    const messages = {
      not_admin: 'Only an admin can request a payment.',
      invalid_period: 'The payment period is invalid.',
      nothing_payable: 'There are no payable requests in this period.',
      missing_prices: 'Some payable requests are missing prices.',
      zero_total: 'The payable requests have a total price of zero.',
    };
    const code = data?.code;

    if (code === 'not_admin') return res.status(403).json({ error: messages[code], code });
    if (code === 'invalid_period') return res.status(400).json({ error: messages[code], code });
    if (['nothing_payable', 'missing_prices', 'zero_total'].includes(code)) {
      const response = { error: messages[code], code };
      if (code === 'missing_prices') response.missing_count = data.missing_count;
      return res.status(409).json(response);
    }

    return res.status(500).json({ error: 'Unexpected payment request result' });
  } catch (err) {
    console.error('requestPayment error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const getPayments = async (req, res) => {
  try {
    const { page, pageSize, from, to } = parsePaging(req.query);
    const { data, count, error } = await supabase
      .from('payments')
      .select(
        'id, gradegroup, period_start, period_end, total_price, request_count, status, decision_note, created_at, decided_at',
        { count: 'exact' }
      )
      .eq('requested_by', req.user.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({
      data: data || [],
      total: count || 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error('getPayments error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getSummary, getRequests, requestPayment, getPayments };
