import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAllRequests } from '../../api/requests';
import RequestStatusBadge from '../../components/RequestStatusBadge';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const PAGE_SIZE = 20;
  const [requests, setRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState(''); // empty string means "All"
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetchRequests = async () => {
      try {
        setLoading(true);
        const response = await getAllRequests({
          status: statusFilter || undefined,
          page,
          pageSize: PAGE_SIZE,
          date: date || undefined,
        });
        if (cancelled) return;
        const data = response.data.data || [];
        const responseTotal = response.data.total || 0;
        setRequests(data);
        setTotal(responseTotal);
        if (page > Math.max(Math.ceil(responseTotal / PAGE_SIZE), 1)) {
          setPage(1);
        }
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load manager requests:', err);
        setError('Unable to fetch requests. Please verify your connection.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRequests();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, page, date]);

  const handleFilterChange = (status) => {
    setStatusFilter(status);
    setPage(1);
  };

  const handleDateChange = (event) => {
    setDate(event.target.value);
    setPage(1);
  };

  const clearDate = () => {
    setDate('');
    setPage(1);
  };

  const formatDateTime = (isoString) => {
    return new Date(isoString).toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  const filterOptions = [
    { label: 'All Requests', value: '' },
    { label: 'Approved', value: 'approved' },
    { label: 'Prepared', value: 'prepared' },
    { label: 'Completed', value: 'completed' },
    { label: 'Cancelled', value: 'cancelled' },
    { label: 'Rejected', value: 'rejected' },
  ];

  if (loading && requests.length === 0) {
    return <div className={styles.loading}>Loading reservations...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className={styles.title}>Manager Dashboard</h1>
            <p className={styles.subtitle}>Review reservation requests, coordinate pickups, and log condition reports.</p>
          </div>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* Filter Toolbar */}
      <div className={styles.filterBar}>
        <span className={styles.filterLabel}>Filter by status:</span>
        <div className={styles.filterBtns}>
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleFilterChange(opt.value)}
              className={`${styles.filterBtn} ${
                statusFilter === opt.value ? styles.activeFilter : ''
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <label className={styles.dateInput}>
          Date
          <input type="date" value={date} onChange={handleDateChange} />
        </label>
        {date && (
          <button type="button" className={styles.filterBtn} onClick={clearDate}>
            Clear date
          </button>
        )}
      </div>

      {/* Requests Table */}
      {requests.length === 0 ? (
        <div className={styles.tableContainer}>
          <div className={styles.noRequests}>
            <h3>No reservation requests found.</h3>
            {statusFilter && <p>Try checking other status filters.</p>}
          </div>
        </div>
      ) : (
        <div className={styles.tableContainer} style={{ opacity: loading ? 0.6 : 1 }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Requester</th>
                <th className={styles.th}>Reservation Window</th>
                <th className={styles.th}>Items Requested</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => {
                const requesterName = req.requester?.full_name || 'Unknown';
                const requesterPhone = req.requester?.phone || 'No phone';
                const requesterGradegroup = req.gradegroup || req.requester?.gradegroup;
                const itemsList = req.request_items || [];

                return (
                  <tr key={req.id} className={styles.tr}>
                    <td className={styles.td}>
                      <div className={styles.requesterInfo}>
                        <span className={styles.requesterName}>{requesterName}</span>
                        <span className={styles.requesterPhone}>📞 {requesterPhone}{requesterGradegroup ? ` · ${requesterGradegroup}` : ''}</span>
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div className={styles.dateTimeInfo}>
                        <span className={styles.timeRange}>
                          {formatDateTime(req.start_time)}
                        </span>
                        <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>to</span>
                        <span className={styles.timeRange}>
                          {formatDateTime(req.end_time)}
                        </span>
                        <span className={styles.dateSub}>
                          Submitted: {new Date(req.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div className={styles.itemsSummary}>
                        {itemsList.map((ri) => (
                          <div key={ri.id} className={styles.itemSummaryTag}>
                            📦 {ri.items?.name || 'Item'} (<strong>x{ri.quantity_requested}</strong>)
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className={`${styles.td} ${styles.statusTd}`}>
                      <RequestStatusBadge status={req.status} />
                    </td>
                    <td className={`${styles.td} ${styles.actionTd}`}>
                      <Link to={`/manager/requests/${req.id}`} className={styles.actionBtn}>
                        Manage &rarr;
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className={styles.pagination}>
        <button
          type="button"
          className={styles.pageBtn}
          onClick={() => setPage((current) => current - 1)}
          disabled={loading || page === 1}
        >
          &larr; Prev
        </button>
        <span className={styles.pageInfo}>Page {page} of {Math.max(Math.ceil(total / PAGE_SIZE), 1)}</span>
        <button
          type="button"
          className={styles.pageBtn}
          onClick={() => setPage((current) => current + 1)}
          disabled={loading || page >= Math.max(Math.ceil(total / PAGE_SIZE), 1)}
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
}
