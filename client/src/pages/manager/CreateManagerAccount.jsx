import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { register } from '../../api/auth';
import styles from '../auth/Login.module.css';

export default function CreateManagerAccount() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password || !phone.trim()) return;
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      await register({ 
        username: username.trim(), 
        password, 
        phone: phone.trim(), 
        role: 'manager',
        gradegroup: 'N/A'
      });
      setSuccess('Manager account created successfully!');
      setUsername('');
      setPassword('');
      setPhone('');
      setTimeout(() => {
        navigate('/manager');
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create manager account. Username might already be taken.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.leftPanel} aria-hidden="true">
        <div className={styles.brandBig}>
          <div className={styles.churchIcon}>⛪</div>
          <h1 className={styles.leftTitle}>Create Manager<br />Account</h1>
          <p className={styles.leftSub}>Add a new inventory manager to help oversee church resources and coordinate requests.</p>
          <div className={styles.features}>

          </div>
        </div>
      </div>

      <div className={styles.rightPanel}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h2 className={styles.title}>New Manager Account</h2>
            <p className={styles.subtitle}>Fill in the details below to create a manager account</p>
          </div>

          {error && <div className={styles.error}>{error}</div>}
          {success && <div style={{ padding: '12px', marginBottom: '16px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '6px', fontSize: '14px' }}>{success}</div>}

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="username">Username</label>
              <input id="username" type="text" className={styles.input} value={username}
                onChange={(e) => setUsername(e.target.value)} placeholder="Pick a unique username"
                required disabled={loading} autoComplete="username" />
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="password">Password</label>
              <input id="password" type="password" className={styles.input} value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 characters"
                required disabled={loading} autoComplete="new-password" />
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="phone">Phone Number</label>
              <input id="phone" type="tel" className={styles.input} value={phone}
                onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 012xxxxxxxx"
                required disabled={loading} autoComplete="tel" />
            </div>
            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? 'Creating Account...' : 'Create Manager Account →'}
            </button>
          </form>

          <div className={styles.footer}>
            Want to go back?{' '}
            <button 
              type="button"
              onClick={() => navigate('/manager')}
              className={styles.link}
              style={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
