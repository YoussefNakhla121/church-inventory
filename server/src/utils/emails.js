const transporter = require('../config/mailer');
const supabase = require('../config/supabase');

const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'Church Inventory System';

// ── Status badge colors ────────────────────────────────────────────────────────
const STATUS_COLORS = {
  approved:  { bg: '#d1fae5', color: '#065f46' },
  rejected:  { bg: '#fee2e2', color: '#991b1b' },
  prepared:  { bg: '#fef3c7', color: '#92400e' },
  completed: { bg: '#dbeafe', color: '#1e40af' },
  cancelled: { bg: '#f3f4f6', color: '#374151' },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Format a date string as "Mon DD YYYY, HH:MM AM/PM"
 */
function fmtDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Build an inline status badge span.
 */
function statusBadge(status) {
  const s = status.toLowerCase();
  const colors = STATUS_COLORS[s] || { bg: '#f3f4f6', color: '#374151' };
  const label = s.charAt(0).toUpperCase() + s.slice(1);
  return `<span style="background:${colors.bg};color:${colors.color};padding:3px 10px;border-radius:12px;font-size:13px;font-weight:600;">${label}</span>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Wrap email body content in the standard Church Inventory layout.
 */
function wrapHtml(bodyContent) {
  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a0f0a;">
  <div style="background:#2c1810;padding:20px 24px;border-radius:8px 8px 0 0;">
    <h2 style="color:#ffffff;margin:0;font-size:18px;">Wsa2l El 2daa7</h2>
  </div>
  <div style="background:#ffffff;padding:24px;border:1px solid #e8ddd0;border-top:none;border-radius:0 0 8px 8px;">
    ${bodyContent}
  </div>
  <p style="color:#8b6e5c;font-size:12px;text-align:center;margin-top:16px;">
    This is an automated message from the Wsa2l El 2daa7.
  </p>
</div>`.trim();
}

/**
 * Build the items list HTML (bullet list of item × qty).
 */
function itemsList(items) {
  return `<ul style="margin:8px 0;padding-left:20px;">
${items.map(i => `    <li>${i.name} &times; ${i.quantity_requested}</li>`).join('\n')}
  </ul>`;
}

/**
 * Build the conflicts list HTML.
 */
function conflictsList(conflicts) {
  if (!conflicts || conflicts.length === 0) return '';
  return `<ul style="margin:8px 0;padding-left:20px;">
${conflicts.map(c => `    <li><strong>${c.item_name}</strong>: requested ${c.requested}, only ${c.available} available</li>`).join('\n')}
  </ul>`;
}

/**
 * Validate email address format.
 */
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

function getGradegroupValue(request, fallbackUser = null) {
  const candidates = [
    request?.gradegroup,
    request?.grade_group,
    request?.gradeGroup,
    request?.requester?.gradegroup,
    fallbackUser?.gradegroup,
    fallbackUser?.grade_group,
    fallbackUser?.gradeGroup,
  ];

  for (const value of candidates) {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return String(value).trim();
    }
  }

  return 'N/A';
}

/**
 * Send one transactional email via Nodemailer + Gmail.
 */
async function sendEmail(to, subject, htmlContent) {
  if (!transporter) {
    console.warn('WARNING: Mailer is not initialized. Skipping email.');
    return;
  }
  if (!to || !isValidEmail(to)) {
    console.warn(`WARNING: Skipping sending email to "${to}" because it is not a valid email address.`);
    return;
  }
  const result = await transporter.sendMail({
    from: `"${MAIL_FROM_NAME}" <${process.env.GMAIL_USER}>`,
    to: to,
    subject: subject,
    html: htmlContent
  });
  console.log(`Email sent to ${to}:`, result.messageId || result);
  return result;
}

// ── Email functions ────────────────────────────────────────────────────────────

/**
 * 1. Notify all managers about a new reservation request.
 */
async function notifyManagersNewRequest(request, requester, managers, items) {
  if (process.env.NODE_ENV === 'test') return;

  const status = request.status || (request.success ? 'approved' : 'rejected');

  let conflictsHtml = '';
  if (status === 'rejected') {
    conflictsHtml = `
    <p style="margin:12px 0 4px;"><strong>Reason:</strong> Some items are unavailable</p>
    ${conflictsList(request.conflicts || [])}`;
  }

  const body = wrapHtml(`
    <p style="margin:0 0 16px;">A new reservation request has been submitted.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tr><td style="padding:4px 8px;font-weight:600;">Requester:</td><td style="padding:4px 8px;">${requester.full_name} &mdash; ${requester.phone || 'N/A'}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">Grade Group:</td><td style="padding:4px 8px;">${getGradegroupValue(request, requester)}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">From:</td><td style="padding:4px 8px;">${fmtDate(request.start_time)}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">To:</td><td style="padding:4px 8px;">${fmtDate(request.end_time)}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">Notes:</td><td style="padding:4px 8px;">${request.notes || 'None'}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">Status:</td><td style="padding:4px 8px;">${statusBadge(status)}</td></tr>
    </table>
    <p style="margin:0 0 4px;font-weight:600;">Items Requested:</p>
    ${itemsList(items)}
    ${conflictsHtml}
  `);

  const subject = `New Reservation Request from ${requester.full_name}`;

  // Send manager emails sequentially with a small delay to avoid Gmail rate limiting
  for (let i = 0; i < managers.length; i++) {
    const manager = managers[i];
    try {
      await sendEmail(manager.gmail, subject, body);
      // Add 500ms delay between emails to prevent Gmail from blocking as spam
      if (i < managers.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (err) {
      console.error(`Email to manager ${manager.gmail} failed:`, err.message);
    }
  }
}

/**
 * 2. Notify the requester that their request has been received.
 */
async function notifyRequesterRequestCreated(request, requester, items) {
  if (process.env.NODE_ENV === 'test') return;

  const status = request.status || (request.success ? 'approved' : 'rejected');

  let statusMessage = '';
  if (status === 'approved') {
    statusMessage = `
    <p style="margin:16px 0 0;color:#065f46;">
      Your items have been reserved. A manager will prepare them before your event.<br/>
      You can track your request status in the app.
    </p>`;
  } else if (status === 'rejected') {
    statusMessage = `
    <p style="margin:16px 0 4px;color:#991b1b;">
      Unfortunately your request was rejected because some items are unavailable
      in the selected time window.
    </p>
    <p style="margin:4px 0 4px;font-weight:600;">Conflicts:</p>
    ${conflictsList(request.conflicts || [])}
    <p style="margin:8px 0 0;color:#991b1b;">
      Please go back to the app and try a different time window or adjust quantities.
    </p>`;
  }

  const body = wrapHtml(`
    <p style="margin:0 0 16px;">Hi ${requester.full_name},</p>
    <p style="margin:0 0 16px;">Your reservation request has been submitted successfully.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tr><td style="padding:4px 8px;font-weight:600;">Status:</td><td style="padding:4px 8px;">${statusBadge(status)}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">Grade Group:</td><td style="padding:4px 8px;">${getGradegroupValue(request, requester)}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">From:</td><td style="padding:4px 8px;">${fmtDate(request.start_time)}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">To:</td><td style="padding:4px 8px;">${fmtDate(request.end_time)}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">Notes:</td><td style="padding:4px 8px;">${request.notes || 'None'}</td></tr>
    </table>
    <p style="margin:0 0 4px;font-weight:600;">Items Requested:</p>
    ${itemsList(items)}
    ${statusMessage}
  `);

  try {
    await sendEmail(
      requester.gmail,
      'Your Reservation Request Has Been Received — Wsa2l El 2daa7',
      body
    );
  } catch (err) {
    console.error(`Email notification for request creation to requester ${requester.gmail} failed:`, err.message);
  }
}

/**
 * 3. Notify the requester that their request status has changed.
 */
async function notifyRequesterStatusChange(request, requester, items, changedBy) {
  if (process.env.NODE_ENV === 'test') return;

  const status = request.status;
  const capitalStatus = status.charAt(0).toUpperCase() + status.slice(1);

  let statusMessage = '';
  if (status === 'prepared') {
    statusMessage = `
    <p style="margin:16px 0 0;color:#92400e;">
      Your items are ready for pickup. Please contact the manager if you have any questions.
    </p>`;
  } else if (status === 'completed') {
    statusMessage = `
    <p style="margin:16px 0 0;color:#1e40af;">
      Your reservation has been completed. Thank you.
    </p>`;
  } else if (status === 'cancelled') {
    statusMessage = `
    <p style="margin:16px 0 0;color:#374151;">
      Your reservation has been cancelled.
    </p>`;
  }

  const body = wrapHtml(`
    <p style="margin:0 0 16px;">Hi ${requester.full_name},</p>
    <p style="margin:0 0 16px;">Your reservation request status has been updated.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tr><td style="padding:4px 8px;font-weight:600;">New Status:</td><td style="padding:4px 8px;">${statusBadge(status)}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">Updated by:</td><td style="padding:4px 8px;">${changedBy.full_name}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">Grade Group:</td><td style="padding:4px 8px;">${getGradegroupValue(request, requester)}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">From:</td><td style="padding:4px 8px;">${fmtDate(request.start_time)}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">To:</td><td style="padding:4px 8px;">${fmtDate(request.end_time)}</td></tr>
    </table>
    <p style="margin:0 0 4px;font-weight:600;">Items:</p>
    ${itemsList(items)}
    ${statusMessage}
  `);

  try {
    await sendEmail(
      requester.gmail,
      `Your Request Has Been ${capitalStatus} — Wsa2l El 2daa7`,
      body
    );
  } catch (err) {
    console.error(`Email notification for status change to requester ${requester.gmail} failed:`, err.message);
  }
}

async function sendNewRequestEmails(requestId, requestData, requesterId, requestedItems) {
  const startedAt = Date.now();
  console.log(`[email:new-request] started request ${requestId}`);

  try {
    const [managersResult, requesterResult, itemNamesResult] = await Promise.all([
      supabase.from('users').select('id, full_name, gmail, phone, gradegroup').eq('role', 'manager'),
      supabase.from('users').select('id, full_name, gmail, phone, gradegroup').eq('id', requesterId).single(),
      supabase.from('items').select('id, name').in('id', requestedItems.map((item) => item.item_id)),
    ]);

    if (managersResult.error || requesterResult.error || itemNamesResult.error) {
      throw managersResult.error || requesterResult.error || itemNamesResult.error;
    }

    const requester = requesterResult.data;
    const itemNameMap = Object.fromEntries(
      (itemNamesResult.data || []).map((item) => [item.id, item.name])
    );
    const emailItems = requestedItems.map((item) => ({
      name: itemNameMap[item.item_id] || 'Unknown Item',
      quantity_requested: item.quantity_requested,
    }));

    await Promise.all([
      notifyManagersNewRequest(requestData, requester, managersResult.data || [], emailItems),
      notifyRequesterRequestCreated(requestData, requester, emailItems),
    ]);
  } catch (err) {
    console.error(`[email:new-request] request ${requestId} failed:`, err);
  } finally {
    console.log(`[email:new-request] finished request ${requestId} in ${Date.now() - startedAt}ms`);
  }
}

async function sendStatusChangeEmails(requestId, request, changedById) {
  const startedAt = Date.now();
  console.log(`[email:status-change] started request ${requestId}`);

  try {
    const [itemsResult, requesterResult, changedByResult] = await Promise.all([
      supabase
        .from('request_items')
        .select('quantity_requested, items ( id, name )')
        .eq('request_id', requestId),
      supabase
        .from('users')
        .select('id, full_name, gmail, phone, gradegroup')
        .eq('id', request.requester_id)
        .single(),
      supabase
        .from('users')
        .select('id, full_name, gmail')
        .eq('id', changedById)
        .single(),
    ]);

    if (itemsResult.error || requesterResult.error || changedByResult.error) {
      throw itemsResult.error || requesterResult.error || changedByResult.error;
    }

    const emailItems = (itemsResult.data || []).map((item) => ({
      name: item.items?.name || 'Unknown Item',
      quantity_requested: item.quantity_requested,
    }));

    await notifyRequesterStatusChange(
      request,
      requesterResult.data,
      emailItems,
      changedByResult.data
    );
  } catch (err) {
    console.error(`[email:status-change] request ${requestId} failed:`, err);
  } finally {
    console.log(`[email:status-change] finished request ${requestId} in ${Date.now() - startedAt}ms`);
  }
}

async function notifyManagersPaymentRequested(payment, admin, managers) {
  if (process.env.NODE_ENV === 'test') return;

  const adminName = escapeHtml(admin.full_name || 'Unknown admin');
  const gradegroup = escapeHtml(payment.gradegroup || 'N/A');
  const periodStart = escapeHtml(payment.period_start);
  const periodEnd = escapeHtml(payment.period_end);
  const paymentUrl = escapeHtml(
    `${process.env.CLIENT_URL || 'https://wsa2l-el-2daa7.vercel.app'}/manager/payments/${payment.id}`
  );
  const body = wrapHtml(`
    <p style="margin:0 0 16px;">A payment request needs manager approval.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tr><td style="padding:4px 8px;font-weight:600;">Admin:</td><td style="padding:4px 8px;">${adminName}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">Grade Group:</td><td style="padding:4px 8px;">${gradegroup}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">Period:</td><td style="padding:4px 8px;">${periodStart} - ${periodEnd}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">Requests:</td><td style="padding:4px 8px;">${payment.request_count}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">Total:</td><td style="padding:4px 8px;">${payment.total_price} EGP</td></tr>
    </table>
    <p style="margin:0;"><a href="${paymentUrl}" style="display:inline-block;background:#c4622d;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none;">Review payment</a></p>
  `);

  const subject = `Payment approval needed: ${payment.gradegroup || 'N/A'}`;
  for (let i = 0; i < managers.length; i++) {
    const manager = managers[i];
    try {
      await sendEmail(manager.gmail, subject, body);
      if (i < managers.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (err) {
      console.error(`Payment email to manager ${manager.gmail} failed:`, err.message);
    }
  }
}

async function notifyAdminPaymentDecision(payment, admin, manager) {
  if (process.env.NODE_ENV === 'test') return;

  const decision = payment.status === 'approved' ? 'approved' : 'declined';
  const adminName = escapeHtml(admin.full_name || 'Unknown admin');
  const managerName = escapeHtml(manager.full_name || 'Unknown manager');
  const gradegroup = escapeHtml(payment.gradegroup || 'N/A');
  const periodStart = escapeHtml(payment.period_start);
  const periodEnd = escapeHtml(payment.period_end);
  const note = payment.decision_note
    ? `<p style="margin:16px 0 0;"><strong>Decline note:</strong> ${escapeHtml(payment.decision_note)}</p>`
    : '';
  const body = wrapHtml(`
    <p style="margin:0 0 16px;">Your payment request has been ${decision}.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tr><td style="padding:4px 8px;font-weight:600;">Admin:</td><td style="padding:4px 8px;">${adminName}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">Grade Group:</td><td style="padding:4px 8px;">${gradegroup}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">Period:</td><td style="padding:4px 8px;">${periodStart} - ${periodEnd}</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">Total:</td><td style="padding:4px 8px;">${payment.total_price} EGP</td></tr>
      <tr><td style="padding:4px 8px;font-weight:600;">Decided by:</td><td style="padding:4px 8px;">${managerName}</td></tr>
    </table>
    ${note}
  `);

  await sendEmail(
    admin.gmail,
    `Your payment was ${decision}`,
    body
  );
}

async function sendPaymentRequestedEmails(paymentId) {
  if (process.env.NODE_ENV === 'test') return;
  const startedAt = Date.now();
  console.log(`[email:payment-requested] started payment ${paymentId}`);

  try {
    const [paymentResult] = await Promise.all([
      supabase.from('payments').select('*').eq('id', paymentId).single(),
    ]);
    if (paymentResult.error) throw paymentResult.error;
    const payment = paymentResult.data;

    const [adminResult, managersResult] = await Promise.all([
      supabase.from('users').select('id, full_name, gmail').eq('id', payment.requested_by).single(),
      supabase.from('users').select('id, full_name, gmail').eq('role', 'manager'),
    ]);
    if (adminResult.error || managersResult.error) {
      throw adminResult.error || managersResult.error;
    }

    await notifyManagersPaymentRequested(payment, adminResult.data, managersResult.data || []);
  } catch (err) {
    console.error(`[email:payment-requested] payment ${paymentId} failed:`, err);
  } finally {
    console.log(`[email:payment-requested] finished payment ${paymentId} in ${Date.now() - startedAt}ms`);
  }
}

async function sendPaymentDecisionEmails(paymentId) {
  if (process.env.NODE_ENV === 'test') return;
  const startedAt = Date.now();
  console.log(`[email:payment-decision] started payment ${paymentId}`);

  try {
    const paymentResult = await supabase.from('payments').select('*').eq('id', paymentId).single();
    if (paymentResult.error) throw paymentResult.error;
    const payment = paymentResult.data;

    const [adminResult, managerResult] = await Promise.all([
      supabase.from('users').select('id, full_name, gmail').eq('id', payment.requested_by).single(),
      supabase.from('users').select('id, full_name, gmail').eq('id', payment.decided_by).single(),
    ]);
    if (adminResult.error || managerResult.error) {
      throw adminResult.error || managerResult.error;
    }

    await notifyAdminPaymentDecision(payment, adminResult.data, managerResult.data);
  } catch (err) {
    console.error(`[email:payment-decision] payment ${paymentId} failed:`, err);
  } finally {
    console.log(`[email:payment-decision] finished payment ${paymentId} in ${Date.now() - startedAt}ms`);
  }
}

module.exports = {
  isValidEmail,
  fmtDate,
  escapeHtml,
  notifyManagersNewRequest,
  notifyRequesterRequestCreated,
  notifyRequesterStatusChange,
  sendNewRequestEmails,
  sendStatusChangeEmails,
  notifyManagersPaymentRequested,
  notifyAdminPaymentDecision,
  sendPaymentRequestedEmails,
  sendPaymentDecisionEmails,
};
