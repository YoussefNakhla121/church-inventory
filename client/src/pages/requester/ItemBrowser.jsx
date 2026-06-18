import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getItems } from '../../api/items';
import ItemCard from '../../components/ItemCard';
import styles from './ItemBrowser.module.css';

export default function ItemBrowser() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  useEffect(() => {
    const fetchItems = async () => {
      try {
        setLoading(true);
        const response = await getItems();
        const activeItems = (response.data || []).filter(item => item.is_active !== false);
        setItems(activeItems);
      } catch (err) {
        console.error('Failed to fetch items:', err);
        setError('Unable to load inventory items. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, []);

  const categories = useMemo(() => {
    const cats = items.map(i => i.category).filter(Boolean);
    return [...new Set(cats)];
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const q = searchQuery.toLowerCase();
      const matchSearch = item.name.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q));
      const matchCat = !selectedCategory || item.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [items, searchQuery, selectedCategory]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className="spinner" />
        <span>Loading inventory...</span>
      </div>
    );
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  return (
    <div className={styles.container}>
      {/* Hero section */}
      <div className={styles.hero}>
        <div className={styles.heroText}>
          <h1 className={styles.heroTitle}>
            Browse <span>Inventory</span>
          </h1>
          <p className={styles.heroSub}>
            Explore all available items. Ready to reserve? Start a request and pick your dates &amp; items.
          </p>
        </div>
        <Link to="/requests/new" className={styles.heroAction}>
          📅 Start a Reservation →
        </Link>
      </div>

      {/* Search + filter controls */}
      <div className={styles.controls}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="🔍  Search by name or description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className={styles.categorySelect}
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <span className={styles.countLabel}>
          {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Items grid */}
      <div className={styles.grid}>
        {filteredItems.length === 0 ? (
          <div className={styles.empty}>
            <h3>No items match your search.</h3>
            <p>Try clearing filters or browsing all categories.</p>
          </div>
        ) : (
          filteredItems.map(item => (
            <ItemCard key={item.id} item={item} />
          ))
        )}
      </div>
    </div>
  );
}
