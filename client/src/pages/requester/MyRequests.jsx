import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getMyRequests, cancelRequest } from '../../api/requests';
import RequestStatusBadge from '../../components/RequestStatusBadge';
import styles from './MyRequests.module.css';

export default function MyRequests() {
  const PAGE_SIZE = 20;
  const location = useLocation();
  const [requests, setRequests] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(null); // stores request ID being cancelled

  // Success message from redirects (e.g. NewRequest page)
  const [successMsg, setSuccessMsg] = useState(location.state?.message || null);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const response = await getMyRequests({ page: 1, pageSize: PAGE_SIZE });
      setRequests(response.data.data || []);
      setTotal(response.data.total || 0);
      setPage(1);
      setError(null);
    } catch (err) {
      console.error('Failed to load my requests:', err);
      setError('Unable to fetch your reservation requests. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    // Clear message state from history so it doesn't persist on refresh
    if (location.state?.message) {
      window.history.replaceState({}, document.title);
    }
  }, []);

  const loadMore = async () => {
    try {
      setLoadingMore(true);
      const nextPage = page + 1;
      const response = await getMyRequests({ page: nextPage, pageSize: PAGE_SIZE });
      const nextRequests = response.data.data || [];
      setRequests((prev) => {
        const existingIds = new Set(prev.map((request) => request.id));
        return [...prev, ...nextRequests.filter((request) => !existingIds.has(request.id))];
      });
      setTotal(response.data.total || total);
      setPage(nextPage);
    } catch (err) {
      console.error('Failed to load more requests:', err);
      setError('Unable to fetch more reservation requests. Please try again.');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this reservation request? This will release the reserved quantities.')) {
      return;
    }

    try {
      setCancelLoading(id);
      setError(null);
      await cancelRequest(id);

      // Update local state to show cancelled status
      setRequests((prev) =>
        prev.map((req) =>
          req.id === id ? { ...req, status: 'cancelled' } : req
        )
      );
      setSuccessMsg('Reservation cancelled successfully.');
    } catch (err) {
      console.error('Cancel request failed:', err);
      setError(err.response?.data?.error || 'Failed to cancel reservation. Please try again.');
    } finally {
      setCancelLoading(null);
    }
  };

  const formatDateTime = (isoString) => {
    return new Date(isoString).toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  if (loading) {
    return <div className={styles.loading}>Loading your requests...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>My Reservation Requests</h1>
        <p className={styles.subtitle}>Track your bookings, view details, or cancel active requests.</p>
      </div>

      {successMsg && <div className={styles.successAlert}>{successMsg}</div>}
      {error && <div className={styles.error}>{error}</div>}

      {requests.length === 0 ? (
        <div className={styles.noRequests}>
          <h3>You haven't made any reservation requests yet.</h3>
          <p>Go to the item catalog to choose items and request a reservation.</p>
          <Link to="/" className={styles.viewBtn} style={{ fontSize: '1.05rem', marginTop: '1rem' }}>
            Browse Items &rarr;
          </Link>
        </div>
      ) : (
        <div className={styles.requestsList}>
          {requests.map((request) => {
            const isCancellable = request.status?.toLowerCase() === 'approved';
            const reqItems = request.request_items || [];

            return (
              <div key={request.id} className={styles.requestCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.dateTimeInfo}>
                    <span className={styles.dateRange}>
                      {formatDateTime(request.start_time)} &mdash; {formatDateTime(request.end_time)}
                    </span>
                    <span className={styles.dateSub}>
                      Requested on {new Date(request.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <RequestStatusBadge status={request.status} />
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.itemsSummary}>
                    <span className={styles.itemLabel}>Items Requested</span>
                    <div className={styles.itemsTags}>
                      {reqItems.map((ri) => (
                        <span key={ri.id} className={styles.itemTag}>
                          📦 {ri.items?.name || 'Item'}
                          <span className={styles.itemQty}>x{ri.quantity_requested}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {request.notes && (
                    <div style={{ marginTop: '0.25rem' }}>
                      <span className={styles.itemLabel}>Notes</span>
                      <p className={styles.notes}>{request.notes}</p>
                    </div>
                  )}

                  {request.status?.toLowerCase() === 'rejected' && request.rejection_reason && (
                    <div style={{ marginTop: '0.25rem' }}>
                      <span className={styles.itemLabel} style={{ color: '#dc2626' }}>Rejection Reason</span>
                      <p className={styles.notes} style={{ color: '#b91c1c', fontWeight: 500 }}>
                        {request.rejection_reason}
                      </p>
                    </div>
                  )}
                </div>

                <div className={styles.cardActions}>
                  <Link to={`/requests/${request.id}`} className={styles.viewBtn}>
                    View Details & Comment &rarr;
                  </Link>

                  {isCancellable && (
                    <button
                      onClick={() => handleCancel(request.id)}
                      disabled={cancelLoading === request.id}
                      className={styles.cancelBtn}
                    >
                      {cancelLoading === request.id ? 'Cancelling...' : 'Cancel Request'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {requests.length > 0 && requests.length < total && (
        <button
          type="button"
          className={styles.loadMoreBtn}
          onClick={loadMore}
          disabled={loadingMore}
        >
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
}
