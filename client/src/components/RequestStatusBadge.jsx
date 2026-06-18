import styles from './RequestStatusBadge.module.css';

const STATUS_LABELS = {
  approved:  'Approved',
  prepared:  'Prepared',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected:  'Rejected',
};

export default function RequestStatusBadge({ status }) {
  const key = status?.toLowerCase() || 'pending';
  const label = STATUS_LABELS[key] || status || 'Unknown';
  const cls = styles[key] || styles.pending;

  return (
    <span className={`${styles.badge} ${cls}`}>
      <span className={styles.dot} />
      {label}
    </span>
  );
}
