import styles from './ItemCard.module.css';
import { useAuth } from '../context/AuthContext';
import { formatMoney } from '../utils/format';

export default function ItemCard({ item, actions, children, onPhotoClick }) {
  const { user } = useAuth();
  const showPrice = user?.role === 'manager';
  const { name, description, total_quantity, category, photo_url, is_active, price } = item;

  const handlePhotoClick = () => {
    if (onPhotoClick && photo_url) {
      onPhotoClick();
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.imageContainer}>
        {is_active === false && (
          <div className={styles.inactiveOverlay}>
            <span className={styles.inactiveBadge}>Inactive</span>
          </div>
        )}
        {photo_url ? (
          <>
            <img
              src={photo_url}
              alt={name}
              loading="lazy"
              decoding="async"
              className={styles.image}
              onClick={handlePhotoClick}
              style={{ cursor: onPhotoClick ? 'zoom-in' : 'default' }}
            />
            <div className={styles.imageGradient} />
          </>
        ) : (
          <div className={styles.placeholderImage}>
            <span>📦</span>
            <span className={styles.placeholderText}>{category || 'Item'}</span>
          </div>
        )}
      </div>

      <div className={styles.content}>
        {category && <span className={styles.categoryChip}>{category}</span>}
        <h3 className={styles.title}>{name}</h3>
        <p className={styles.description}>{description || 'No description provided.'}</p>

        <div className={styles.infoRowGroup}>
          <div className={styles.infoRow}>
            <span className={styles.qtyLabel}>Total Stock</span>
            <span className={styles.qtyValue}>{total_quantity} units</span>
          </div>
          {showPrice && (
            <div className={styles.infoRow}>
              <span className={styles.qtyLabel}>Price</span>
              <span className={styles.qtyValue}>{formatMoney(price)}</span>
            </div>
          )}
        </div>

        {children && <div>{children}</div>}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}
