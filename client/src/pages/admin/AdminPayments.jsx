import { useCallback, useEffect, useState } from 'react';
import {
  getAdminRequests,
  getAdminSummary,
  getMyPayments,
  requestPayment,
} from '../../api/admin';
import { formatDate, formatDateTime, formatMoney } from '../../utils/format';
import styles from './AdminPayments.module.css';

const PAGE_SIZE = 20;

const toDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getInitialPeriod = () => {
  const today = new Date();
  return {
    start: toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)),
    end: toDateInputValue(today),
  };
};

const getPaymentErrorMessage = (error) => {
  const code = error.response?.data?.code;
  const missingCount = error.response?.data?.missing_count;
  switch (code) {
    case 'invalid_period': return 'The selected payment period is invalid.';
    case 'not_admin': return 'Only an admin can request a payment.';
    case 'nothing_payable': return 'There are no payable requests in this period.';
    case 'missing_prices': return `Payment is blocked because ${missingCount || 'some'} request(s) have no price. A manager must fix the missing prices first.`;
    case 'zero_total': return 'Payment is blocked because the payable total is zero.';
    default: return 'Unable to request payment. Please try again.';
  }
};

const getRequestBadge = (request) => {
  if (request.payable) return { label: 'Payable', className: styles.payable };
  if (request.payment_status === 'pending') {
    return { label: 'Pending approval', className: styles.pending };
  }
  if (request.paid || request.payment_status === 'approved') {
    return { label: 'Paid', className: styles.paid };
  }
  if (request.status === 'cancelled' || request.status === 'rejected') {
    return { label: 'Cancelled', className: styles.cancelled };
  }
  return { label: request.status || 'Unavailable', className: styles.neutral };
};

const getPaymentStatusClass = (status) => styles[status] || styles.neutral;

const RequestItems = ({ items = [] }) => (
  <div className={styles.items}>
    {items.length > 0
      ? items.map((item, index) => (
        <span key={`${item.name}-${index}`}>
          {item.name} <strong>x{item.quantity}</strong>
        </span>
      ))
      : <span>—</span>}
  </div>
);

export default function AdminPayments() {
  const [period, setPeriod] = useState(getInitialPeriod);
  const [summary, setSummary] = useState(null);
  const [requests, setRequests] = useState([]);
  const [requestTotal, setRequestTotal] = useState(0);
  const [requestPage, setRequestPage] = useState(1);
  const [payments, setPayments] = useState([]);
  const [paymentTotal, setPaymentTotal] = useState(0);
  const [paymentPage, setPaymentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadAdminData = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryResponse, requestsResponse] = await Promise.all([
        getAdminSummary(period.start, period.end),
        getAdminRequests(period.start, period.end, requestPage, PAGE_SIZE),
      ]);
      setSummary(summaryResponse.data);
      setRequests(requestsResponse.data.data || []);
      setRequestTotal(requestsResponse.data.total || 0);
      setError('');
    } catch (err) {
      console.error('Failed to load admin payment data:', err);
      setError('Unable to load payment data. Please verify your connection.');
    } finally {
      setLoading(false);
    }
  }, [period.end, period.start, requestPage]);

  const loadPayments = useCallback(async () => {
    try {
      setPaymentsLoading(true);
      const response = await getMyPayments(paymentPage, PAGE_SIZE);
      setPayments(response.data.data || []);
      setPaymentTotal(response.data.total || 0);
      setPaymentError('');
    } catch (err) {
      console.error('Failed to load admin payments:', err);
      setPaymentError('Unable to load your payment history.');
    } finally {
      setPaymentsLoading(false);
    }
  }, [paymentPage]);

  useEffect(() => {
    const timer = setTimeout(loadAdminData, 0);
    return () => clearTimeout(timer);
  }, [loadAdminData]);

  useEffect(() => {
    const timer = setTimeout(loadPayments, 0);
    return () => clearTimeout(timer);
  }, [loadPayments]);

  const handlePeriodChange = (field, value) => {
    const nextPeriod = { ...period, [field]: value };
    if (field === 'start' && nextPeriod.end < value) nextPeriod.end = value;
    setPeriod(nextPeriod);
    setRequestPage(1);
    setSuccess('');
  };

  const handleRequestPayment = async () => {
    const confirmed = window.confirm(
      `Request payment for ${summary.gradegroup || 'your scope'} from ${period.start} to ${period.end} for ${formatMoney(summary.payable_total)}?`
    );
    if (!confirmed) return;

    try {
      setSubmitting(true);
      setPaymentError('');
      setSuccess('');
      await requestPayment(period.start, period.end);
      setSuccess('Sent to managers for approval');
      await Promise.all([loadAdminData(), loadPayments()]);
    } catch (err) {
      console.error('Failed to request payment:', err);
      setPaymentError(getPaymentErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const requestPages = Math.max(Math.ceil(requestTotal / PAGE_SIZE), 1);
  const paymentPages = Math.max(Math.ceil(paymentTotal / PAGE_SIZE), 1);
  const scope = summary?.scope || [];
  const byGroup = summary?.by_group || [];

  if (loading && !summary) {
    return <div className={styles.loading}>Loading payments...</div>;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Admin Payments</h1>
          <p className={styles.subtitle}>
            <span dir="auto">{summary?.gradegroup || 'Your gradegroup'}</span>
            {scope.length > 1 && (
              <> · Covers <span dir="auto">{scope.join(', ')}</span></>
            )}
          </p>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {paymentError && <div className={styles.error}>{paymentError}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <section className={styles.periodPanel}>
        <div>
          <h2 className={styles.sectionTitle}>Payment period</h2>
          <p className={styles.sectionHint}>Choose the inclusive Cairo calendar dates to review.</p>
        </div>
        <div className={styles.dateFields}>
          <label>
            Start
            <input
              type="date"
              value={period.start}
              onChange={(event) => handlePeriodChange('start', event.target.value)}
            />
          </label>
          <label>
            End
            <input
              type="date"
              min={period.start}
              value={period.end}
              onChange={(event) => handlePeriodChange('end', event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className={styles.summaryGrid} aria-label="Payment summary">
        {[
          ['Payable', summary?.payable_count, summary?.payable_total, styles.payable],
          ['Pending approval', summary?.pending_count, summary?.pending_total, styles.pending],
          ['Paid', summary?.paid_count, summary?.paid_total, styles.paid],
        ].map(([label, count, total, className]) => (
          <div className={`${styles.summaryCard} ${className}`} key={label}>
            <span className={styles.summaryLabel}>{label}</span>
            <strong>{count || 0}</strong>
            <span>{formatMoney(total)}</span>
          </div>
        ))}
      </section>

      {byGroup.length > 1 && (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Payable by group</h2>
          <div className={styles.breakdownTable}>
            {byGroup.map((group) => (
              <div className={styles.breakdownRow} key={group.gradegroup}>
                <span dir="auto">{group.gradegroup}</span>
                <span>{group.request_count} requests</span>
                <strong>{formatMoney(group.total)}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      {summary?.missing_price_count > 0 && (
        <div className={styles.warning}>
          Payment is blocked until a manager fixes prices for {summary.missing_price_count} request(s).
        </div>
      )}

      <section className={styles.payPanel}>
        <div>
          <h2 className={styles.sectionTitle}>Declare payment</h2>
          <p className={styles.sectionHint}>Managers must approve this payment before requests are marked paid.</p>
        </div>
        <button
          type="button"
          className={styles.payButton}
          disabled={loading || submitting || !summary?.payable_count || summary?.missing_price_count > 0}
          onClick={handleRequestPayment}
        >
          {submitting ? 'Sending...' : 'Pay payable requests'}
        </button>
      </section>

      <section>
        <div className={styles.sectionHeading}>
          <div>
            <h2 className={styles.sectionTitle}>Requests in this period</h2>
            <p className={styles.sectionHint}>{requestTotal} request(s)</p>
          </div>
        </div>
        <div className={styles.tableContainer} style={{ opacity: loading ? 0.6 : 1 }}>
          {requests.length === 0 ? (
            <div className={styles.empty}>No requests found for this period.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Requester</th>
                  <th>Window</th>
                  <th>Items</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => {
                  const badge = getRequestBadge(request);
                  return (
                    <tr key={request.id}>
                      <td data-label="Requester">{request.requester_name || 'Unknown'}</td>
                      <td data-label="Window">
                        {formatDateTime(request.start_time)}
                        <span className={styles.to}>to</span>
                        {formatDateTime(request.end_time)}
                      </td>
                      <td data-label="Items"><RequestItems items={request.items} /></td>
                      <td data-label="Status">{request.status || '—'}</td>
                      <td data-label="Total">{formatMoney(request.total_price)}</td>
                      <td data-label="Payment">
                        <span className={`${styles.badge} ${badge.className}`}>{badge.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <Pagination page={requestPage} pages={requestPages} loading={loading} onPage={setRequestPage} />
      </section>

      <section>
        <div className={styles.sectionHeading}>
          <div>
            <h2 className={styles.sectionTitle}>My payments</h2>
            <p className={styles.sectionHint}>Your payment requests and manager decisions.</p>
          </div>
        </div>
        <div className={styles.paymentList}>
          {paymentsLoading && payments.length === 0 ? (
            <div className={styles.empty}>Loading payment history...</div>
          ) : payments.length === 0 ? (
            <div className={styles.empty}>No payment requests yet.</div>
          ) : payments.map((payment) => (
            <article className={styles.paymentCard} key={payment.id}>
              <div>
                <strong dir="auto">{payment.gradegroup}</strong>
                <span>{formatDate(payment.period_start)} to {formatDate(payment.period_end)}</span>
              </div>
              <strong>{formatMoney(payment.total_price)}</strong>
              <span className={`${styles.badge} ${getPaymentStatusClass(payment.status)}`}>
                {payment.status || 'unknown'}
              </span>
              {payment.status === 'declined' && payment.decision_note && (
                <p className={styles.decisionNote}>Manager note: {payment.decision_note}</p>
              )}
            </article>
          ))}
        </div>
        <Pagination page={paymentPage} pages={paymentPages} loading={paymentsLoading} onPage={setPaymentPage} />
      </section>
    </div>
  );
}

function Pagination({ page, pages, loading, onPage }) {
  return (
    <div className={styles.pagination}>
      <button type="button" onClick={() => onPage((current) => current - 1)} disabled={loading || page === 1}>
        &larr; Prev
      </button>
      <span>Page {page} of {pages}</span>
      <button type="button" onClick={() => onPage((current) => current + 1)} disabled={loading || page >= pages}>
        Next &rarr;
      </button>
    </div>
  );
}
