import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getItems, getItemAvailability } from '../../api/items';
import { createRequest } from '../../api/requests';
import { getGradeGroups } from '../../api/auth';
import ImageLightbox from '../../components/ImageLightbox';
import styles from './NewRequest.module.css';

export default function NewRequest() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Wizard state: 1 = Pick Dates, 2 = Select Items, 3 = Review & Submit
  const [step, setStep] = useState(1);

  // Form inputs
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');
  const [gradegroup, setGradegroup] = useState('');

  // Manager-only: separate end date (start date is also the reservation date)
  // endDate === '' means same as start date (single-day)
  const [endDate, setEndDate] = useState('');

  // Item catalogs and availability
  const [catalogItems, setCatalogItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState({}); // { item_id: quantity }
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeGroups, setGradeGroups] = useState([]);

  // Lightbox state
  const [lightbox, setLightbox] = useState({ isOpen: false, src: '', alt: '' });
  
  // UI States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [conflicts, setConflicts] = useState(null);

  useEffect(() => {
    const fetchGradeGroups = async () => {
      try {
        const response = await getGradeGroups();
        setGradeGroups(response.data || []);
      } catch (err) {
        console.error('Failed to load grade groups:', err);
        setGradeGroups([]);
      }
    };

    fetchGradeGroups();
  }, []);

  // Validate dates for step 1
  const validateDates = () => {
    if (!startTime) {
      setError('Please select a reservation date.');
      return false;
    }

    if (isManager && isMultiDay) {
      // Multi-day manager reservation: just validate dates, no time check
      const start = new Date(startTime);
      const end = new Date(endTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        setError('Invalid date format.');
        return false;
      }
      if (end <= start) {
        setError('End date must be after the start date.');
        return false;
      }
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (start < now) {
        setError('Start date cannot be in the past.');
        return false;
      }
      const diffDays = (start - now) / (1000 * 60 * 60 * 24);
      if (diffDays > 90) {
        setError('Reservations can be made at most 90 days in advance.');
        return false;
      }
      setError(null);
      return true;
    }

    // Single-day (or requester): validate start + end times
    if (!endTime) {
      setError('Please select a start time and end time.');
      return false;
    }
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setError('Invalid date or time format.');
      return false;
    }
    if (end <= start) {
      setError('End time must be after the start time.');
      return false;
    }
    const now = new Date();
    if (start < now) {
      setError('Start time cannot be in the past.');
      return false;
    }
    const diffDays = (start - now) / (1000 * 60 * 60 * 24);
    if (diffDays > 90) {
      setError('Reservations can be made at most 90 days in advance.');
      return false;
    }
    setError(null);
    return true;
  };

  // Move to Step 2: load items and fetch their available quantity
  const handleProceedToItems = async () => {
    if (!validateDates()) return;

    try {
      setLoading(true);
      setError(null);
      
      // Fetch active items
      const itemsRes = await getItems();
      const activeItems = (itemsRes.data || []).filter(item => item.is_active !== false);

      // Fetch availability in parallel
      const availabilityPromises = activeItems.map(async (item) => {
        try {
          const availRes = await getItemAvailability(item.id, startTime, endTime);
          return {
            ...item,
            availableQuantity: availRes.data.available_in_window
          };
        } catch (err) {
          console.error(`Error fetching availability for item ${item.id}:`, err);
          return {
            ...item,
            availableQuantity: item.total_quantity
          };
        }
      });

      const itemsWithAvailability = await Promise.all(availabilityPromises);
      setCatalogItems(itemsWithAvailability);
      
      // Clean up selected items that might have been loaded previously but are now unavailable
      const updatedSelections = {};
      Object.keys(selectedItems).forEach((id) => {
        const item = itemsWithAvailability.find(i => i.id === id);
        if (item && item.availableQuantity > 0) {
          updatedSelections[id] = Math.min(selectedItems[id], item.availableQuantity);
        }
      });
      setSelectedItems(updatedSelections);

      setStep(2);
    } catch (err) {
      console.error('Failed to load items availability:', err);
      setError('Failed to fetch item availabilities. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle quantity adjustment in Step 2
  const handleQtyChange = (itemId, change, maxAvailable) => {
    setSelectedItems((prev) => {
      const current = prev[itemId] || 0;
      const next = current + change;
      const updated = { ...prev };

      if (next <= 0) {
        delete updated[itemId];
      } else {
        updated[itemId] = Math.min(next, maxAvailable);
      }
      return updated;
    });
  };

  const handleProceedToReview = () => {
    const hasItems = Object.keys(selectedItems).length > 0;
    if (!hasItems) {
      setError('Please select at least one item.');
      return;
    }
    setError(null);
    setStep(3);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateDates()) {
      setStep(1);
      return;
    }
    const hasItems = Object.keys(selectedItems).length > 0;
    if (!hasItems) {
      setError('Please select at least one item.');
      setStep(2);
      return;
    }

    // Validate gradegroup for managers
    if (user?.role === 'manager' && !gradegroup.trim()) {
      setError('Grade Group is required for managers.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setConflicts(null);

      const itemsPayload = Object.entries(selectedItems).map(([id, qty]) => ({
        item_id: id,
        quantity_requested: qty,
      }));

      const formatLocalDateString = (value) => {
        if (!value) return null;
        const [date, time] = value.split('T');
        if (!date || !time) return null;
        const normalizedTime = time.length === 2 ? `${time}:00` : time;
        const localDate = new Date(`${date}T${normalizedTime}`);
        if (isNaN(localDate.getTime())) return null;
        return localDate.toISOString();
      };

      const payload = {
        start_time: formatLocalDateString(startTime),
        end_time: formatLocalDateString(endTime),
        notes: notes.trim() || null,
        items: itemsPayload,
      };

      // Add gradegroup for managers
      if (user?.role === 'manager') {
        payload.gradegroup = gradegroup;
      }

      const response = await createRequest(payload);

      if (response.data && response.data.success === false) {
        setConflicts(response.data.conflicts || []);
        setError('Your request was rejected due to inventory conflicts.');
        return;
      }

      navigate('/requests', {
        state: { message: 'Reservation request approved successfully!' },
      });
    } catch (err) {
      console.error('Request submission failed:', err);
      if (err.response?.status === 409) {
        setConflicts(err.response.data?.conflicts || err.response.data?.rejection_detail?.conflicts || []);
        setError('Your request was rejected due to inventory conflicts.');
      } else {
        setError(err.response?.data?.error || 'Failed to submit request. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  // Normalize a datetime-local input value to hour granularity (zero minutes/seconds)
  const formatForInput = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`;
  };

  const normalizeToHourInput = (value) => {
    if (!value) return '';
    const d = new Date(value);
    d.setMinutes(0, 0, 0);
    return formatForInput(d);
  };

  const getDatePart = (value) => (value ? value.split('T')[0] : '');
  const getHourPart = (value) => (value ? (value.split('T')[1] || '').slice(0, 2) : '');

  const isManager = user?.role === 'manager';
  // For managers: are start and end on different days?
  const startDatePart = getDatePart(startTime);
  const isMultiDay = isManager && endDate && endDate !== startDatePart;

  const ensureDateFor = (value) => {
    if (getDatePart(value)) return getDatePart(value);
    return new Date().toISOString().slice(0, 10);
  };

  const handleDateChange = (date) => {
    const startHour = getHourPart(startTime) || '08';
    const endHour = getHourPart(endTime) || '09';
    setStartTime(`${date}T${startHour}:00`);
    // If manager has no separate end date set, keep end on same day
    if (!isManager || !endDate || endDate === getDatePart(startTime)) {
      setEndTime(`${date}T${endHour}:00`);
      setEndDate(''); // reset end date to track "same as start"
    }
    // else: manager has a different end date chosen — leave endTime/endDate untouched
  };

  const handleManagerEndDateChange = (date) => {
    const currentStartDate = getDatePart(startTime);
    setEndDate(date);
    if (date === currentStartDate || !date) {
      // Same as start date → single day mode, endTime on same date
      const endHour = getHourPart(endTime) || '09';
      setEndTime(`${currentStartDate}T${endHour}:00`);
    } else {
      // Different date → multi-day: set end to midnight of that day
      setEndTime(`${date}T23:59`);
    }
  };

  const handleStartHourChange = (hour) => {
    const date = ensureDateFor(startTime);
    setStartTime(`${date}T${hour}:00`);

    const curEndDate = ensureDateFor(endTime);
    if (curEndDate !== date) {
      setEndTime(`${date}T${getHourPart(endTime) || '09'}:00`);
    }
  };

  const handleEndHourChange = (hour) => {
    const date = ensureDateFor(startTime);
    setEndTime(`${date}T${hour}:00`);
  };

  // Gather details of items that are selected
  const getSelectedItemsDetails = () => {
    return Object.entries(selectedItems).map(([id, qty]) => {
      const item = catalogItems.find(i => i.id === id);
      return {
        id,
        qty,
        name: item?.name || 'Unknown Item',
        category: item?.category,
        photo_url: item?.photo_url
      };
    });
  };

  const stepItems = getSelectedItemsDetails();

  return (
    <div className={styles.container}>
      {/* Step Progress Bar */}
      <div className={styles.progressTracker}>
        <div className={`${styles.progressStep} ${step >= 1 ? styles.stepActive : ''}`}>
          <div className={styles.stepNum}>1</div>
          <div className={styles.stepLabel}>Pick Dates</div>
        </div>
        <div className={styles.progressLine} />
        <div className={`${styles.progressStep} ${step >= 2 ? styles.stepActive : ''}`}>
          <div className={styles.stepNum}>2</div>
          <div className={styles.stepLabel}>Select Items</div>
        </div>
        <div className={styles.progressLine} />
        <div className={`${styles.progressStep} ${step >= 3 ? styles.stepActive : ''}`}>
          <div className={styles.stepNum}>3</div>
          <div className={styles.stepLabel}>Confirm</div>
        </div>
      </div>

      <div className={styles.header}>
        <h1 className={styles.title}>New Reservation</h1>
        <p className={styles.subtitle}>
          {step === 1 && 'Select the start and end dates for your reservation request.'}
          {step === 2 && 'Browse items and choose quantities available during your selected window.'}
          {step === 3 && 'Review your details and submit the reservation request.'}
        </p>
      </div>

      {error && !conflicts && <div className={styles.errorText}>{error}</div>}

      {/* Conflict Display Box */}
      {conflicts && conflicts.length > 0 && (
        <div className={styles.conflictAlert}>
          <h4 className={styles.conflictTitle}>⚠️ Inventory Conflicts Detected</h4>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(239, 68, 68, 0.9)' }}>
            The following items do not have enough stock during the requested window:
          </p>
          <ul className={styles.conflictList}>
            {conflicts.map((conflict, idx) => (
              <li key={conflict.item_id || idx} className={styles.conflictItem}>
                <span className={styles.conflictItemName}>{conflict.item_name}</span>
                <span className={styles.conflictDetails}>
                  <span>Requested: <strong>{conflict.requested}</strong></span>
                  <span>Available: <strong style={{ color: 'var(--error)' }}>{conflict.available_in_window}</strong></span>
                  <span>Total Stock: <strong>{conflict.total_quantity}</strong></span>
                </span>
              </li>
            ))}
          </ul>
          <button onClick={() => setStep(2)} className={styles.adjustBtn}>
            ← Go Back to Adjust Quantities
          </button>
        </div>
      )}

      {loading && (
        <div className={styles.loadingOverlay}>
          <div className="spinner" />
          <span style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Checking item availabilities...</span>
        </div>
      )}

      {!loading && (
        <div className={styles.card}>
          {step === 1 && (
            <div className={styles.stepForm}>
              <h3 className={styles.sectionTitle}>1. Choose Reservation Window</h3>
              <div className={styles.timeFields}>
                {/* Start Date (always shown) */}
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Start Date</label>
                  <input
                    type="date"
                    className={styles.input}
                    value={getDatePart(startTime)}
                    onChange={(e) => handleDateChange(e.target.value)}
                    required
                  />
                </div>

                {/* Manager-only: End Date */}
                {isManager && (
                  <div className={styles.inputGroup}>
                    <label className={styles.label}>End Date</label>
                    <input
                      type="date"
                      className={styles.input}
                      value={endDate || getDatePart(startTime)}
                      min={getDatePart(startTime)}
                      onChange={(e) => handleManagerEndDateChange(e.target.value)}
                      required
                    />
                  </div>
                )}
              </div>

              {/* Time selectors: shown when single-day (or requester) */}
              {!isMultiDay && (
                <div className={styles.timeFields} style={{ marginTop: '1rem' }}>
                  <div className={styles.inputGroup}>
                    <label className={styles.label}>Start Time</label>
                    <select
                      className={styles.input}
                      value={getHourPart(startTime) || '08'}
                      onChange={(e) => handleStartHourChange(e.target.value)}
                      required
                    >
                      {Array.from({ length: 24 }).map((_, i) => {
                        const hh = String(i).padStart(2, '0');
                        return (
                          <option key={hh} value={hh}>{hh}:00</option>
                        );
                      })}
                    </select>
                  </div>

                  <div className={styles.inputGroup}>
                    <label className={styles.label}>End Time</label>
                    <select
                      className={styles.input}
                      value={getHourPart(endTime) || '09'}
                      onChange={(e) => handleEndHourChange(e.target.value)}
                      required
                    >
                      {Array.from({ length: 24 }).map((_, i) => {
                        const hh = String(i).padStart(2, '0');
                        return (
                          <option key={hh} value={hh}>{hh}:00</option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              )}

              <div className={styles.actions}>
                <button
                  type="button"
                  onClick={handleProceedToItems}
                  className={styles.submitBtn}
                >
                  Next: Select Items →
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className={styles.stepForm}>
              <div className={styles.stepHeaderRow}>
                <h3 className={styles.sectionTitle}>2. Choose Available Equipment</h3>
                <span className={styles.windowBadge}>
                  📅 {formatDateTime(startTime)} - {formatDateTime(endTime)}
                </span>
              </div>

              <div className={styles.searchBarContainer}>
                <input
                  type="text"
                  placeholder="🔍 Search items by name, category, or description..."
                  className={styles.searchInput}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className={styles.itemsGrid}>
                {catalogItems.length === 0 ? (
                  <div className={styles.emptyGrid}>
                    <p>No active items found in the inventory database.</p>
                  </div>
                ) : (() => {
                  const filteredItems = catalogItems.filter((item) => {
                    const searchLower = searchQuery.toLowerCase();
                    return (
                      item.name.toLowerCase().includes(searchLower) ||
                      (item.description && item.description.toLowerCase().includes(searchLower)) ||
                      (item.category && item.category.toLowerCase().includes(searchLower))
                    );
                  });

                  return filteredItems.length === 0 ? (
                    <div className={styles.emptyGrid}>
                      <p>No items match your search. Try a different keyword.</p>
                    </div>
                  ) : (
                    filteredItems.map((item) => {
                      const selectedQty = selectedItems[item.id] || 0;
                      return (
                        <div key={item.id} className={`${styles.itemCard} ${selectedQty > 0 ? styles.itemCardSelected : ''}`}>
                          <div className={styles.itemImageContainer}>
                            {item.photo_url ? (
                              <img
                                src={item.photo_url}
                                alt={item.name}
                                className={styles.itemImage}
                                onClick={() => setLightbox({ isOpen: true, src: item.photo_url, alt: item.name })}
                                style={{ cursor: 'zoom-in' }}
                              />
                            ) : (
                              <div className={styles.itemPlaceholder}>📦</div>
                            )}
                          </div>
                          <div className={styles.itemInfo}>
                            {item.category && <span className={styles.categoryChip}>{item.category}</span>}
                            <h4 className={styles.itemNameText}>{item.name}</h4>
                            <p className={styles.itemDescriptionText}>{item.description || 'No description.'}</p>
                            
                            <div className={styles.availabilityRow}>
                              <span className={styles.availText}>Available:</span>
                              <span className={item.availableQuantity > 0 ? styles.stockGreen : styles.stockRed}>
                                {item.availableQuantity} units
                              </span>
                            </div>

                            {item.availableQuantity > 0 ? (
                              <div className={styles.qtySelector}>
                                <button
                                  type="button"
                                  onClick={() => handleQtyChange(item.id, -1, item.availableQuantity)}
                                  className={styles.qtyBtn}
                                  disabled={selectedQty <= 0}
                                >
                                  -
                                </button>
                                <span className={styles.qtyVal}>{selectedQty}</span>
                                <button
                                  type="button"
                                  onClick={() => handleQtyChange(item.id, 1, item.availableQuantity)}
                                  className={styles.qtyBtn}
                                  disabled={selectedQty >= item.availableQuantity}
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <div className={styles.outOfStock}>Unavailable</div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  );
                })()}
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className={styles.cancelBtn}
                >
                  ← Back to Dates
                </button>
                <button
                  type="button"
                  onClick={handleProceedToReview}
                  className={styles.submitBtn}
                  disabled={stepItems.length === 0}
                >
                  Next: Review details →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <form onSubmit={handleSubmit} className={styles.stepForm}>
              <h3 className={styles.sectionTitle}>3. Review &amp; Confirm Request</h3>

              <div className={styles.reviewSummaryGrid}>
                <div className={styles.summaryCard}>
                  <h4 className={styles.summaryTitle}>📅 Reservation Dates</h4>
                  <div className={styles.summaryRow}>
                    <span>Start:</span>
                    <strong>{formatDateTime(startTime)}</strong>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>End:</span>
                    <strong>{formatDateTime(endTime)}</strong>
                  </div>
                  <button type="button" onClick={() => setStep(1)} className={styles.changeBtn}>
                    Change Dates
                  </button>
                </div>

                <div className={styles.summaryCard}>
                  <h4 className={styles.summaryTitle}>📦 Selected Equipment</h4>
                  <div className={styles.reviewItemsList}>
                    {stepItems.map((item) => (
                      <div key={item.id} className={styles.reviewItemRow}>
                        <span>{item.name}</span>
                        <strong>Qty: {item.qty}</strong>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => setStep(2)} className={styles.changeBtn}>
                    Change Items
                  </button>
                </div>
              </div>

              <div className={styles.inputGroup} style={{ marginTop: '1rem' }}>
                <label className={styles.label}>Grade Group {user?.role === 'manager' && <span style={{ color: 'var(--error)' }}>*</span>}</label>
                {user?.role === 'manager' ? (
                  <select
                    className={styles.input}
                    value={gradegroup}
                    onChange={(e) => setGradegroup(e.target.value)}
                    required
                    disabled={gradeGroups.length === 0}
                  >
                    <option value="">{gradeGroups.length ? 'Select a grade group...' : 'Loading grade groups...'}</option>
                    {gradeGroups.map((group) => (
                      <option key={group} value={group}>{group}</option>
                    ))}
                  </select>
                ) : null}
              </div>

              <div className={styles.inputGroup} style={{ marginTop: '1rem' }}>
                <label className={styles.label}>Notes / Special Requests (Optional)</label>
                <textarea
                  className={styles.textarea}
                  placeholder="Tell us about the event or any special requirements..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className={styles.cancelBtn}
                >
                  ← Back to Items
                </button>
                <button
                  type="submit"
                  className={styles.submitBtn}
                >
                  Confirm &amp; Submit Request
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <ImageLightbox
        src={lightbox.src}
        alt={lightbox.alt}
        isOpen={lightbox.isOpen}
        onClose={() => setLightbox({ isOpen: false, src: '', alt: '' })}
      />
    </div>
  );
}
