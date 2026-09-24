import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { updateProfile as updateProfileApi } from '../../api/auth';
import styles from './ProfileEdit.module.css';

export default function ProfileEdit() {
  const { user, updateUserProfile } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    gmail: '',
    phone: '',
    gradegroup: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        gmail: user.gmail || '',
        phone: user.phone || '',
        gradegroup: user.gradegroup || '',
      });
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const isManager = user?.role === 'manager';
    
    // For requesters, all fields are required. For managers, gradegroup is not required
    if (!formData.gmail.trim() || !formData.phone.trim() || (!isManager && !formData.gradegroup.trim())) {
      setError('All fields are required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await updateProfileApi(formData);
      updateUserProfile(response.data.user);
      setSuccess(true);
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h2 className={styles.title}>Edit Profile</h2>
            <p className={styles.subtitle}>Update your personal information</p>
          </div>

          {error && <div className={styles.error}>{error}</div>}
          {success && <div className={styles.success}>Profile updated successfully! Redirecting...</div>}

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="gmail">Gmail</label>
              <input
                id="gmail"
                type="email"
                className={styles.input}
                name="gmail"
                value={formData.gmail}
                onChange={handleChange}
                disabled={loading}
                required
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="phone">Phone Number</label>
              <input
                id="phone"
                type="tel"
                className={styles.input}
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                disabled={loading}
                required
              />
            </div>

            {user?.role !== 'manager' && (
              <div className={styles.inputGroup}>
                <label className={styles.label} htmlFor="gradegroup">Grade/Group</label>
                <select
                  id="gradegroup"
                  className={styles.select}
                  name="gradegroup"
                  value={formData.gradegroup}
                  onChange={handleChange}
                  disabled={loading}
                  required
                >
                  <option value="">Select Grade Group</option>
                  <option value="اول و تاني">اول و تاني</option>
                  <option value="تلاته و رابعه">تلاته و رابعه</option>
                  <option value="خامسه و سادسه">خامسه و سادسه</option>
                  <option value="اعدادي">اعدادي</option>
                  <option value="ثانوي">ثانوي</option>
                </select>
              </div>
            )}


            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? 'Saving Changes...' : 'Save Changes →'}
            </button>
          </form>

          <div className={styles.footer}>
            <button 
              onClick={() => navigate('/')} 
              className={styles.link}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Cancel
            </button>
          </div>

          {user?.role === 'manager' && (
            <div className={styles.managerSection}>
              <div className={styles.divider} />
              <p className={styles.managerSectionTitle}>Manager Tools</p>
              <button
                type="button"
                className={styles.createManagerBtn}
                onClick={() => navigate('/manager/create-account')}
              >
                ➕ Create Manager Account
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

