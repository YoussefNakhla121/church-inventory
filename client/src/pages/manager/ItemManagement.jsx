import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getItems, getItemsAll, deactivateItem, reactivateItem } from '../../api/items';
import ItemCard from '../../components/ItemCard';
import styles from './ItemManagement.module.css';

export default function ItemManagement() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  // Undo/status change tracking state
  const [successMsg, setSuccessMsg] = useState(null);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const response = showInactive ? await getItemsAll() : await getItems();
      setItems(response.data || []);
      setError(null);
    } catch (err) {
      console.error('Failed to load items for management:', err);
      setError('Could not fetch items list. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [showInactive]);

  const handleDeactivate = async (id, name) => {
    if (!window.confirm(`Are you sure you want to deactivate "${name}"? It will no longer be available for new requests.`)) {
      return;
    }

    try {
      setError(null);
      await deactivateItem(id);
      setSuccessMsg(`"${name}" was successfully deactivated.`);

      if (showInactive) {
        setItems((prev) => prev.map((item) => item.id === id ? { ...item, is_active: false } : item));
      } else {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (err) {
      console.error('Failed to deactivate item:', err);
      setError(err.response?.data?.error || 'Failed to deactivate item. Please try again.');
    }
  };

  const handleReactivate = async (id, name) => {
    try {
      setError(null);
      await reactivateItem(id);
      setSuccessMsg(`"${name}" has been reactivated.`);
      setItems((prev) => prev.map((item) => item.id === id ? { ...item, is_active: true } : item));
    } catch (err) {
      console.error('Failed to reactivate item:', err);
      setError(err.response?.data?.error || 'Failed to reactivate item.');
    }
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className="spinner" />
        <span style={{ marginTop: '1rem', display: 'block' }}>Loading inventory database...</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h1 className={styles.title}>Inventory Management</h1>
          <p className={styles.subtitle}>Add new items, update quantities, edit specifications, or deactivate stock.</p>
        </div>
        <div className={styles.controls}>
          <label className={styles.toggleContainer}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            <span>Show Inactive Items</span>
          </label>
          <Link to="/manager/items/new" className={styles.createBtn}>
            <span>➕</span> Add New Item
          </Link>
        </div>
      </div>

      {successMsg && (
        <div className={styles.alertBar}>
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className={styles.closeAlertBtn}>×</button>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {items.length === 0 ? (
        <div className={styles.noItems}>
          <h3>No items found.</h3>
          <p>Click "Add New Item" to create your first item entry.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              actions={
                <div className={styles.cardActionGroup}>
                  <div className={styles.cardRow}>
                    <Link to={`/manager/items/${item.id}/edit`} className={styles.editBtn}>
                      Edit Item
                    </Link>
                    {item.is_active !== false ? (
                      <button
                        onClick={() => handleDeactivate(item.id, item.name)}
                        className={styles.deactivateBtn}
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReactivate(item.id, item.name)}
                        className={styles.activateBtn}
                      >
                        Activate
                      </button>
                    )}
                  </div>
                  <Link to={`/manager/items/${item.id}/history`} className={styles.historyBtn}>
                    📜 View Condition History
                  </Link>
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
