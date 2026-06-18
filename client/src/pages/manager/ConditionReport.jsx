import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getAllRequests } from '../../api/requests';
import { submitConditionReports } from '../../api/conditionReports';
import styles from './ConditionReport.module.css';

export default function ConditionReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // local form state: { [itemId]: { condition: 'good' | 'damaged' | 'missing', notes: '' } }
  const [formData, setFormData] = useState({});

  useEffect(() => {
    const fetchRequest = async () => {
      try {
        setLoading(true);
        const response = await getAllRequests();
        const found = (response.data || []).find((r) => r.id === id);

        if (!found) {
          setError('Reservation request not found.');
        } else if (found.status?.toLowerCase() !== 'completed') {
          setError('Condition reports can only be submitted for Completed requests.');
        } else {
          setRequest(found);
          // Initialize form state
          const initialForm = {};
          (found.request_items || []).forEach((ri) => {
            if (ri.items?.id) {
              initialForm[ri.items.id] = {
                condition: 'good',
                notes: '',
              };
            }
          });
          setFormData(initialForm);
        }
        setError(null);
      } catch (err) {
        console.error('Failed to load request:', err);
        setError('Could not load request details. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    if (id) {
      fetchRequest();
    }
  }, [id]);

  const handleConditionChange = (itemId, condition) => {
    setFormData((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        condition,
      },
    }));
  };

  const handleNotesChange = (itemId, notes) => {
    setFormData((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        notes,
      },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!request) return;

    try {
      setSubmitting(true);
      setError(null);

      // Format payload reports array
      const reports = Object.keys(formData).map((itemId) => ({
        item_id: itemId,
        condition: formData[itemId].condition,
        notes: formData[itemId].notes.trim() || null,
      }));

      await submitConditionReports(id, reports);

      // Redirect back to request details
      navigate(`/manager/requests/${id}`);
    } catch (err) {
      console.error('Failed to submit condition reports:', err);
      setError(
        err.response?.data?.error ||
          'Failed to submit reports. Make sure reports are not already logged.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading report form...</div>;
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

  const reqItems = request.request_items || [];

  return (
    <div className={styles.container}>
      <div>
        <Link to={`/manager/requests/${id}`} className={styles.backLink}>
          &larr; Back to Request
        </Link>
      </div>

      <div className={styles.header}>
        <h1 className={styles.title}>Submit Item Condition Reports</h1>
        <p className={styles.subtitle}>
          Assess and log the physical state of each item returned in this completed reservation.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.card}>
        <form onSubmit={handleSubmit} className={styles.form}>
          {reqItems.map((ri) => {
            const item = ri.items;
            if (!item) return null;
            const currentItemForm = formData[item.id] || { condition: 'good', notes: '' };

            return (
              <div key={ri.id} className={styles.itemReportSection}>
                <div className={styles.itemInfo}>
                  <span className={styles.itemName}>{item.name}</span>
                  <span className={styles.itemQty}>Returned Quantity: {ri.quantity_requested}</span>
                </div>

                {/* Condition Radio Selector */}
                <div className={styles.selectorGroup}>
                  <span className={styles.label}>Returned Condition</span>
                  <div className={styles.radioOptions}>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name={`condition-${item.id}`}
                        value="good"
                        checked={currentItemForm.condition === 'good'}
                        onChange={() => handleConditionChange(item.id, 'good')}
                        className={styles.radioInput}
                      />
                      Good (Fully Functional)
                    </label>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name={`condition-${item.id}`}
                        value="damaged"
                        checked={currentItemForm.condition === 'damaged'}
                        onChange={() => handleConditionChange(item.id, 'damaged')}
                        className={styles.radioInput}
                      />
                      Damaged
                    </label>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name={`condition-${item.id}`}
                        value="missing"
                        checked={currentItemForm.condition === 'missing'}
                        onChange={() => handleConditionChange(item.id, 'missing')}
                        className={styles.radioInput}
                      />
                      Missing (Not Returned)
                    </label>
                  </div>
                </div>

                {/* Notes Input */}
                <div className={styles.selectorGroup}>
                  <label className={styles.label} htmlFor={`notes-${item.id}`}>
                    Notes
                  </label>
                  <textarea
                    id={`notes-${item.id}`}
                    value={currentItemForm.notes}
                    onChange={(e) => handleNotesChange(item.id, e.target.value)}
                    placeholder="Provide details about structural damage, replacement needs, or comments..."
                    className={styles.textarea}
                  />
                </div>
              </div>
            );
          })}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => navigate(`/manager/requests/${id}`)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={submitting || reqItems.length === 0}
            >
              {submitting ? 'Submitting Reports...' : 'Submit Condition Reports'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
