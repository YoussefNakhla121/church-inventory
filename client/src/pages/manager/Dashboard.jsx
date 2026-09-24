import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAllRequests } from '../../api/requests';
import RequestStatusBadge from '../../components/RequestStatusBadge';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const [requests, setRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState(''); // empty string means "All"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRequests = async (status) => {
    try {
      setLoading(true);
      const response = await getAllRequests(status);
      setRequests(response.data || []);
      setError(null);
    } catch (err) {
      console.error('Failed to load manager requests:', err);
      setError('Unable to fetch requests. Please verify your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests(statusFilter);
  }, [statusFilter]);

  const handleFilterChange = (status) => {
    setStatusFilter(status);
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
      </div>

      {/* Requests Table */}
      {loading ? (
        <div className={styles.loading}>Updating list...</div>
      ) : requests.length === 0 ? (
        <div className={styles.tableContainer}>
          <div className={styles.noRequests}>
            <h3>No reservation requests found.</h3>
            {statusFilter && <p>Try checking other status filters.</p>}
          </div>
        </div>
      ) : (
        <div className={styles.tableContainer}>
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
                const requesterGmail = req.requester?.gmail || 'Unknown';
                const requesterPhone = req.requester?.phone || 'No phone';
                const itemsList = req.request_items || [];

                return (
                  <tr key={req.id} className={styles.tr}>
                    <td className={styles.td}>
                      <div className={styles.requesterInfo}>
                        <span className={styles.requesterName}>{requesterGmail}</span>
                        <span className={styles.requesterPhone}>📞 {requesterPhone}</span>
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
    </div>
  );
}
