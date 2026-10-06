import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getItemConditionHistory, getItemsAll } from '../../api/items';
import styles from './ItemConditionHistory.module.css';

export default function ItemConditionHistory() {
  const { id } = useParams();
  const [history, setHistory] = useState([]);
  const [itemName, setItemName] = useState('Loading item...');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch condition reports list
        const historyRes = await getItemConditionHistory(id);
        setHistory(historyRes.data || []);

        // Fetch catalog to find the name of the item
        try {
          const itemsRes = await getItemsAll();
          const found = (itemsRes.data || []).find((item) => item.id === id);
          if (found) {
            setItemName(found.name);
          } else {
            setItemName(`Item ID: ${id} (Inactive)`);
          }
        } catch (itemsErr) {
          console.warn('Could not load active item name from catalog:', itemsErr);
          setItemName(`Item ID: ${id}`);
        }
      } catch (err) {
        console.error('Failed to load item condition history:', err);
        setError('Unable to fetch condition history reports.');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchData();
    }
  }, [id]);

  const formatDateTime = (isoString) => {
    return new Date(isoString).toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  if (loading) {
    return <div className={styles.loading}>Loading condition reports log...</div>;
  }

  return (
    <div className={styles.container}>
      <div>
        <Link to="/manager/items" className={styles.backLink}>
          &larr; Back to Catalog Management
        </Link>
      </div>

      <div className={styles.header}>
        <h1 className={styles.title}>Condition History</h1>
        <h3 className={styles.subtitle} style={{ color: '#4f46e5', fontWeight: 700, fontSize: '1.25rem' }}>
          {itemName}
        </h3>
        <p className={styles.subtitle}>
          Historical track of all quality check reports logged across completed reservations.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {history.length === 0 ? (
        <div className={styles.noReports}>
          <h3>No condition reports logged yet.</h3>
          <p>Reports will populate here when completed reservation condition audits are submitted.</p>
        </div>
      ) : (
        <div className={styles.reportsList}>
          {history.map((report) => {
            let badgeStyle = styles.condition_good;
            if (report.condition === 'damaged') badgeStyle = styles.condition_damaged;
            if (report.condition === 'missing') badgeStyle = styles.condition_missing;

            return (
              <div key={report.id} className={styles.reportCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.reporterMeta}>
                    <span className={styles.reporterName}>
                      Logged by: {report.reporter?.full_name || 'System Manager'}
                    </span>
                    <span className={styles.reportDate}>
                      {formatDateTime(report.reported_at)}
                    </span>
                  </div>
                  <span className={`${styles.conditionBadge} ${badgeStyle}`}>
                    {report.condition}
                  </span>
                </div>

                <div className={styles.cardBody}>
                  {report.notes ? (
                    <p className={styles.notes}>&ldquo;{report.notes}&rdquo;</p>
                  ) : (
                    <p className={styles.notes} style={{ color: '#9ca3af', borderLeftColor: '#e5e7eb' }}>
                      No assessment details provided.
                    </p>
                  )}

                  <div className={styles.requestLinkBox}>
                    <span>Associated Reservation:</span>
                    {report.requests?.id ? (
                      <Link to={`/manager/requests/${report.requests.id}`} className={styles.link}>
                        Request Details ({report.requests.id.substring(0, 8)}...) &rarr;
                      </Link>
                    ) : (
                      <span style={{ fontStyle: 'italic' }}>Request details unavailable</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
