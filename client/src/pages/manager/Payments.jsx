import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPayments } from '../../api/payments';
import { formatDateTime, formatMoney } from '../../utils/format';
import styles from './Payments.module.css';

const PAGE_SIZE = 20;
const filters = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Declined', value: 'declined' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'All', value: '' },
];

const statusClass = (status, styles) => styles[`status${status[0].toUpperCase()}${status.slice(1)}`] || '';

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadPayments = async () => {
      try {
        setLoading(true);
        const response = await getPayments({
          status: status || undefined,
          page,
          pageSize: PAGE_SIZE,
        });
        if (cancelled) return;
        const data = response.data.data || [];
        const responseTotal = response.data.total || 0;
        setPayments(data);
        setTotal(responseTotal);
        setError(null);
        if (page > Math.max(Math.ceil(responseTotal / PAGE_SIZE), 1)) setPage(1);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load payments:', err);
          setError('Unable to fetch payments. Please verify your connection.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPayments();
    return () => {
      cancelled = true;
    };
  }, [status, page]);

  const changeFilter = (value) => {
    setStatus(value);
    setPage(1);
  };

  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  if (loading && payments.length === 0) {
    return <div className={styles.loading}>Loading payments...</div>;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Payments</h1>
        <p className={styles.subtitle}>Review payment requests submitted by administrators.</p>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.filterBar}>
        <span className={styles.filterLabel}>Filter by status:</span>
        <div className={styles.filterButtons}>
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => changeFilter(filter.value)}
              className={`${styles.filterButton} ${status === filter.value ? styles.activeFilter : ''}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {payments.length === 0 ? (
        <div className={styles.empty}>
          <h3>No payments found.</h3>
          {status && <p>Try checking another status filter.</p>}
        </div>
      ) : (
        <div className={`${styles.cards} ${loading ? styles.loadingCards : ''}`}>
          {payments.map((payment) => (
            <article key={payment.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.adminName}>{payment.requested_by_name || 'Unknown admin'}</h2>
                  <div className={styles.gradegroup} dir="auto">{payment.gradegroup || '—'}</div>
                </div>
                <span className={`${styles.statusBadge} ${statusClass(payment.status, styles)}`}>
                  {payment.status}
                </span>
              </div>
              <div className={styles.details}>
                <div><span>Period</span><strong>{payment.period_start} - {payment.period_end}</strong></div>
                <div><span>Requests</span><strong>{payment.request_count}</strong></div>
                <div><span>Total</span><strong>{formatMoney(payment.total_price)}</strong></div>
                <div><span>Created</span><strong>{formatDateTime(payment.created_at)}</strong></div>
              </div>
              <Link to={`/manager/payments/${payment.id}`} className={styles.reviewLink}>
                Review <span aria-hidden="true">&rarr;</span>
              </Link>
            </article>
          ))}
        </div>
      )}

      <div className={styles.pagination}>
        <button type="button" className={styles.pageButton} onClick={() => setPage((value) => value - 1)} disabled={loading || page === 1}>
          &larr; Prev
        </button>
        <span>Page {page} of {pageCount}</span>
        <button type="button" className={styles.pageButton} onClick={() => setPage((value) => value + 1)} disabled={loading || page >= pageCount}>
          Next &rarr;
        </button>
      </div>
    </div>
  );
}
