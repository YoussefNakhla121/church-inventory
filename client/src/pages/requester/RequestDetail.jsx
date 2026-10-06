import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getMyRequests, cancelRequest } from '../../api/requests';
import RequestStatusBadge from '../../components/RequestStatusBadge';
import CommentThread from '../../components/CommentThread';
import styles from './RequestDetail.module.css';

export default function RequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const fetchRequestDetail = async () => {
    try {
      setLoading(true);
      const response = await getMyRequests();
      const found = (response.data || []).find((r) => r.id === id);
      if (!found) {
        setError('Reservation request not found.');
      } else {
        setRequest(found);
      }
      setError(null);
    } catch (err) {
      console.error('Failed to load request details:', err);
      setError('Could not fetch reservation details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchRequestDetail();
    }
  }, [id]);

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel this reservation request? This will release reserved quantities.')) {
      return;
    }

    try {
      setCancelLoading(true);
      setError(null);
      await cancelRequest(id);
      setRequest((prev) => (prev ? { ...prev, status: 'cancelled' } : null));
    } catch (err) {
      console.error('Cancellation failed:', err);
      setError(err.response?.data?.error || 'Failed to cancel reservation.');
    } finally {
      setCancelLoading(false);
    }
  };

  const formatDateTime = (isoString) => {
    return new Date(isoString).toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  if (loading) {
    return <div className={styles.loading}>Loading reservation details...</div>;
  }

  if (error || !request) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error || 'Request not found.'}</div>
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <Link to="/requests" className={styles.backLink}>
            &larr; Back to My Requests
          </Link>
        </div>
      </div>
    );
  }

  const isCancellable = request.status?.toLowerCase() === 'approved';
  const reqItems = request.request_items || [];
  const conflicts = request.status?.toLowerCase() === 'rejected' && request.rejection_detail?.conflicts;

  return (
    <div className={styles.container}>
      <div>
        <Link to="/requests" className={styles.backLink}>
          &larr; Back to My Requests
        </Link>
      </div>

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Reservation Request Details</h1>
          <p className={styles.metaInfo}>ID: {request.id} &bull; Created: {new Date(request.created_at).toLocaleDateString()}</p>
        </div>
        <RequestStatusBadge status={request.status} />
      </div>

      <div className={styles.grid}>
        {/* Main Details and Comments */}
        <div className={styles.leftCol}>
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>Requested Items</h3>
            <div className={styles.itemsList}>
              {reqItems.map((ri) => (
                <div key={ri.id} className={styles.itemRow}>
                  {ri.items?.photo_url ? (
                    <img
                      src={ri.items.photo_url}
                      alt={ri.items.name}
                      loading="lazy"
                      decoding="async"
                      className={styles.itemImage}
                    />
                  ) : (
                    <div className={styles.itemPlaceholder}>📦</div>
                  )}
                  <span className={styles.itemName}>
                    {ri.items?.name || 'Item'}
                  </span>
                  <span className={styles.itemQty}>
                    Qty: {ri.quantity_requested}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Comment Thread Component */}
          <CommentThread requestId={request.id} />
        </div>

        {/* Info Column */}
        <div className={styles.rightCol}>
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>Reservation Window</h3>
            <div className={styles.detailsList}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Start Time</span>
                <span className={styles.detailValue}>
                  {formatDateTime(request.start_time)}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>End Time</span>
                <span className={styles.detailValue}>
                  {formatDateTime(request.end_time)}
                </span>
              </div>
            </div>
          </div>

          {request.notes && (
            <div className={styles.card}>
              <h3 className={styles.sectionTitle}>Request Notes</h3>
              <p className={styles.notes}>{request.notes}</p>
            </div>
          )}

          {/* Rejection / Conflicts Card */}
          {request.status?.toLowerCase() === 'rejected' && (
            <div className={`${styles.card} ${styles.rejectionCard}`}>
              <h3 className={styles.sectionTitle} style={{ color: '#991b1b', borderBottomColor: '#fca5a5' }}>
                Rejection Details
              </h3>
              <p className={styles.rejectionReason}>
                {request.rejection_reason || 'Rejection reason not specified.'}
              </p>
              {conflicts && conflicts.length > 0 && (
                <ul className={styles.conflictList}>
                  {conflicts.map((conflict, idx) => (
                    <li key={conflict.item_id || idx} className={styles.conflictItem}>
                      <span style={{ fontWeight: 'bold' }}>{conflict.item_name}</span>
                      <div>
                        Requested: {conflict.requested} &bull; Available: {conflict.available_in_window}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Cancel Actions */}
          {isCancellable && (
            <div className={styles.card}>
              <h3 className={styles.sectionTitle}>Actions</h3>
              <div className={styles.cancelActionBox}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>
                  You can cancel this reservation before it is prepared.
                </p>
                <button
                  onClick={handleCancel}
                  disabled={cancelLoading}
                  className={styles.cancelBtn}
                >
                  {cancelLoading ? 'Cancelling...' : 'Cancel Reservation'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
