import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import imageCompression from 'browser-image-compression';
import { getItemsAll, createItem, updateItem } from '../../api/items';
import styles from './ItemForm.module.css';

export default function ItemForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = !!id;

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [totalQuantity, setTotalQuantity] = useState(1);
  const [price, setPrice] = useState('');
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEditMode);
  const [error, setError] = useState(null);
  const [compressing, setCompressing] = useState(false);

  useEffect(() => {
    if (isEditMode) {
      const fetchItem = async () => {
        try {
          setFetching(true);
          const response = await getItemsAll();
          const found = (response.data || []).find((item) => item.id === id);

          if (!found) {
            setError('Item not found in database catalog.');
          } else {
            setName(found.name || '');
            setCategory(found.category || '');
            setDescription(found.description || '');
            setTotalQuantity(found.total_quantity || 1);
            setPrice(found.price !== undefined && found.price !== null ? String(found.price) : '');
            if (found.photo_url) {
              setPhotoPreview(found.photo_url);
            }
          }
        } catch (err) {
          console.error('Failed to load item:', err);
          setError('Could not load item details. Please try again.');
        } finally {
          setFetching(false);
        }
      };
      fetchItem();
    }
  }, [id, isEditMode]);

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || totalQuantity < 1) return;

    try {
      setLoading(true);
      setError(null);

      let fileToUpload = photo;

      // Compress photo if selected
      if (photo) {
        try {
          setCompressing(true);
          const options = {
            maxSizeMB: 0.3, // 300 KB limit
            maxWidthOrHeight: 800, // max 800px width or height
            useWebWorker: true,
          };
          const compressed = await imageCompression(photo, options);
          // Convert Blob back to File preserving original name
          fileToUpload = new File([compressed], photo.name, {
            type: photo.type,
            lastModified: Date.now(),
          });
        } catch (compErr) {
          console.warn('Image compression failed, proceeding with original file:', compErr);
          // fallback to original uncompressed photo
          fileToUpload = photo;
        } finally {
          setCompressing(false);
        }
      }

      // Build FormData payload
      const normalizedPrice = price === '' ? 0 : parseFloat(price);
      if (price !== '' && (Number.isNaN(normalizedPrice) || normalizedPrice < 0)) {
        setError('Price must be a valid number equal to or greater than zero.');
        setLoading(false);
        return;
      }

      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('category', category.trim() || '');
      formData.append('description', description.trim() || '');
      formData.append('total_quantity', totalQuantity.toString());
      formData.append('price', normalizedPrice.toString());

      if (fileToUpload) {
        formData.append('photo', fileToUpload);
      }

      if (isEditMode) {
        await updateItem(id, formData);
      } else {
        await createItem(formData);
      }

      // Redirect back to management index
      navigate('/manager/items');
    } catch (err) {
      console.error('Item save failed:', err);
      setError(
        err.response?.data?.error ||
          'Failed to save item. Please verify values and file format.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <div className={styles.loading}>Loading item details...</div>;
  }

  return (
    <div className={styles.container}>
      <div>
        <Link to="/manager/items" className={styles.backLink}>
          &larr; Back to Catalog Management
        </Link>
      </div>

      <div className={styles.header}>
        <h1 className={styles.title}>
          {isEditMode ? 'Edit Inventory Item' : 'Add New Item'}
        </h1>
        <p className={styles.subtitle}>
          {isEditMode
            ? 'Modify the item properties, category, total stock, or upload a new photo.'
            : 'Register a new physical item in the church reservation catalog.'}
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.card}>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="name">
              Item Name *
            </label>
            <input
              id="name"
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Projector, Plastic Chairs"
              required
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="category">
              Category
            </label>
            <input
              id="category"
              type="text"
              className={styles.input}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Electronics, Furniture"
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="totalQuantity">
              Total Stock Quantity *
            </label>
            <input
              id="totalQuantity"
              type="number"
              min="1"
              className={styles.input}
              value={totalQuantity}
              onChange={(e) => setTotalQuantity(parseInt(e.target.value, 10) || 1)}
              required
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="price">
              Price (EGP)
            </label>
            <input
              id="price"
              name="price"
              type="number"
              min="0"
              step="1"
              className={styles.input}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="description">
              Description / Notes
            </label>
            <textarea
              id="description"
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide item specs, storage location details, or other notes..."
              disabled={loading}
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="photo">
              Item Photo (Optional)
            </label>
            <input
              id="photo"
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              disabled={loading}
            />
            {photoPreview && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <img
                  src={photoPreview}
                  alt="Item Preview"
                  className={styles.photoPreview}
                />
                <span className={styles.compressionNote}>
                  Image will be compressed under 300KB automatically before upload.
                </span>
              </div>
            )}
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => navigate('/manager/items')}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={loading || compressing}
            >
              {compressing
                ? 'Compressing Image...'
                : loading
                ? 'Saving Item...'
                : isEditMode
                ? 'Save Changes'
                : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
