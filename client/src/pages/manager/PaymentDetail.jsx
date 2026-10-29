import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { decidePayment, getPayment } from '../../api/payments';
import { formatDate, formatDateTime, formatMoney } from '../../utils/format';
import styles from './PaymentDetail.module.css';

const statusClass = (status, styles) => styles[`status${status[0].toUpperCase()}${status.slice(1)}`] || '';

export default function PaymentDetail() {
  const { id } = useParams();
  const [payment, setPayment] = useState(null);
  const [requests, setRequests] = useState([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState(null);

  const loadPayment = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getPayment(id);
      setPayment(response.data.payment);
      setRequests(response.data.requests || []);
      setError(null);
    } catch (err) {
      if (err.response?.status === 404) setError('Payment not found.');
      else {
        console.error('Failed to load payment:', err);
        setError('Unable to fetch payment details. Please verify your connection.');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(loadPayment, 0);
    return () => window.clearTimeout(timer);
  }, [loadPayment]);

  const refreshBadge = () => window.dispatchEvent(new Event('payments:refresh'));

  const handleDecision = async (decision) => {
    if (decision === 'approved') {
      const confirmed = window.confirm(
        `Accept payment for ${formatDate(payment.period_start)} - ${formatDate(payment.period_end)}, ${payment.gradegroup}, total ${formatMoney(payment.total_price)}?`
      );
      if (!confirmed) return;
    }

    try {
      setDeciding(true);
      await decidePayment(id, decision, note);
      await loadPayment();
      refreshBadge();
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.code === 'already_decided') {
        setError('Another manager already decided this payment');
        await loadPayment();
        refreshBadge();
      } else {
        console.error('Failed to decide payment:', err);
        setError(err.response?.data?.error || 'Unable to update this payment.');
      }
    } finally {
      setDeciding(false);
    }
  };

  if (loading && !payment) return <div className={styles.loading}>Loading payment...</div>;
  if (!payment) {
    return <div className={styles.container}><div className={styles.error}>{error || 'Payment not found.'}</div></div>;
  }

  const requestTotal = requests.reduce((sum, request) => sum + (Number(request.total_price) || 0), 0);

  return (
    <div className={styles.container}>
      <Link to="/manager/payments" className={styles.backLink}>&larr; Back to payments</Link>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Payment review</h1>
          <p className={styles.subtitle}>Review the requests included in this payment.</p>
        </div>
        <span className={`${styles.statusBadge} ${statusClass(payment.status, styles)}`}>{payment.status}</span>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.summary}>
        <div><span>Admin</span><strong>{payment.requested_by_name || 'Unknown admin'}</strong></div>
        <div><span>Gradegroup</span><strong dir="auto">{payment.gradegroup || '—'}</strong></div>
        <div><span>Period</span><strong>{formatDate(payment.period_start)} - {formatDate(payment.period_end)}</strong></div>
        <div><span>Total</span><strong>{formatMoney(payment.total_price)}</strong></div>
        <div><span>Requests</span><strong>{payment.request_count}</strong></div>
        <div><span>Decided by</span><strong>{payment.decided_by_name || '—'}</strong></div>
        <div><span>Decided at</span><strong>{formatDateTime(payment.decided_at)}</strong></div>
        <div className={styles.noteValue}><span>Decision note</span><strong>{payment.decision_note || '—'}</strong></div>
      </section>

      <section className={styles.requestsSection}>
        <h2>Included requests</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Date window</th><th>Requester</th><th>Items</th><th>Price</th></tr></thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td>{formatDateTime(request.start_time)}<br />{formatDateTime(request.end_time)}</td>
                  <td>{request.requester_name || 'Unknown'}</td>
                  <td>{request.items?.length ? request.items.map((item) => <div key={`${request.id}-${item.name}`}>{item.name} (x{item.quantity})</div>) : '—'}</td>
                  <td>{formatMoney(request.total_price)}</td>
                </tr>
              ))}
              <tr className={styles.totalRow}><td colSpan="3">Total</td><td>{formatMoney(requestTotal)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {payment.status === 'pending' && (
        <section className={styles.decisionPanel}>
          <label htmlFor="decision-note">Note (optional)</label>
          <textarea id="decision-note" value={note} onChange={(event) => setNote(event.target.value)} rows="4" placeholder="Add a note about this decision" />
          <div className={styles.actions}>
            <button type="button" className={styles.acceptButton} onClick={() => handleDecision('approved')} disabled={deciding}>
              {deciding ? 'Saving...' : 'Accept payment'}
            </button>
            <button type="button" className={styles.declineButton} onClick={() => handleDecision('declined')} disabled={deciding}>
              Decline payment
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
