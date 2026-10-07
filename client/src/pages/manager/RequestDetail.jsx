import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getRequestById, updateRequestStatus } from '../../api/requests';
import { getConditionReports } from '../../api/conditionReports';
import RequestStatusBadge from '../../components/RequestStatusBadge';
import CommentThread from '../../components/CommentThread';
import styles from './RequestDetail.module.css';

export default function RequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRequestDetail = async () => {
    try {
      setLoading(true);
      const response = await getRequestById(id);
      const found = response.data;
      setRequest(found);
      setError(null);
      // If request is completed, check if condition reports exist
      if (found.status?.toLowerCase() === 'completed') {
        try {
          const reportsRes = await getConditionReports(id);
          setReports(reportsRes.data || []);
        } catch (err) {
          console.error('Failed to load condition reports:', err);
        }
      }
    } catch (err) {
      console.error('Failed to load request details:', err);
      setError(
        err.response?.status === 404
          ? 'Reservation request not found.'
          : 'Could not fetch reservation details. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchRequestDetail();
    }
  }, [id]);

  const handleUpdateStatus = async (nextStatus) => {
    try {
      setActionLoading(true);
      setError(null);
      await updateRequestStatus(id, nextStatus);

      setRequest((prev) => (prev ? { ...prev, status: nextStatus } : null));

      // Refresh reports if status changed to completed
      if (nextStatus === 'completed') {
        try {
          const reportsRes = await getConditionReports(id);
          setReports(reportsRes.data || []);
        } catch (err) {
          console.error('Failed to load condition reports:', err);
        }
        // Redirect immediately to logging report if marked completed
        navigate(`/manager/requests/${id}/condition-report`);
      }
    } catch (err) {
      console.error('Failed to update request status:', err);
      setError(
        err.response?.data?.error ||
          'Failed to update status. Please try again.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const formatDateTime = (isoString) => {
    return new Date(isoString).toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className="spinner" />
        <span style={{ marginTop: '1rem', display: 'block' }}>Loading reservation details...</span>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error || 'Request not found.'}</div>
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <Link to="/manager" className={styles.backLink}>
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const status = request.status?.toLowerCase();
  const reqItems = request.request_items || [];
  const requester = request.requester || {};

  return (
    <div className={styles.container}>
      <div>
        <Link to="/manager" className={styles.backLink}>
          &larr; Back to Dashboard
        </Link>
      </div>

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Manage Reservation Request</h1>
          <p className={styles.metaInfo}>ID: {request.id} &bull; Created: {new Date(request.created_at).toLocaleDateString()}</p>
        </div>
        <RequestStatusBadge status={request.status} />
      </div>

      <div className={styles.grid}>
        {/* Left Column: Items and comments */}
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
                  <div>
                    <span className={styles.itemName}>
                      {ri.items?.name || 'Item'}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      ID: {ri.items?.id}
                    </span>
                  </div>
                  <span className={styles.itemQty}>
                    Qty: {ri.quantity_requested}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Comment Thread */}
          <CommentThread requestId={request.id} />
        </div>

        {/* Right Column: Requester details and actions */}
        <div className={styles.rightCol}>
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>Requester Contacts</h3>
            <div className={styles.detailsList}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Full Name</span>
                <span className={styles.detailValue}>{requester?.full_name || 'Unknown'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Grade Group</span>
                <span className={styles.detailValue}>{request.gradegroup || requester?.gradegroup || 'N/A'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Phone Number</span>
                <span className={styles.detailValue}>
                  <a href={`tel:${requester?.phone}`} className={styles.phoneLink}>
                    {requester?.phone || 'No phone'}
                  </a>
                </span>
              </div>
            </div>
          </div>

          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>Schedule</h3>
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

          {/* Manager Actions Box */}
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>Reservation Status</h3>
            <div className={styles.actionBox}>
              <div className={styles.statusSelectGroup}>
                <label className={styles.label}>Change Status To:</label>
                <select
                  value={request.status}
                  onChange={(e) => handleUpdateStatus(e.target.value)}
                  disabled={actionLoading}
                  className={styles.statusSelect}
                >
                  <option value="approved">Approved</option>
                  <option value="prepared">Prepared</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              {status === 'completed' && (
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                  {reports.length === 0 ? (
                    <>
                      <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        This reservation is completed. Please submit a condition report for each item returned.
                      </p>
                      <Link
                        to={`/manager/requests/${request.id}/condition-report`}
                        className={styles.primaryBtn}
                        style={{ display: 'block', textAlign: 'center' }}
                      >
                        Log Condition Reports
                      </Link>
                    </>
                  ) : (
                    <div className={styles.reportsList}>
                      <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        Submitted Condition Reports:
                      </h4>
                      {reports.map((rep) => {
                        const itemObj = reqItems.find((ri) => ri.items?.id === rep.item_id)?.items;
                        let condStyle = styles.condition_good;
                        if (rep.condition === 'damaged') condStyle = styles.condition_damaged;
                        if (rep.condition === 'missing') condStyle = styles.condition_missing;

                        return (
                          <div key={rep.id} className={styles.reportItem}>
                            <div className={styles.reportItemHeader}>
                              <span className={styles.reportItemName}>
                                {itemObj?.name || 'Item'}
                              </span>
                              <span className={`${styles.conditionBadge} ${condStyle}`}>
                                {rep.condition}
                              </span>
                            </div>
                            {rep.notes && <p className={styles.reportNotes}>&ldquo;{rep.notes}&rdquo;</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
