import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../../api/auth';
import styles from './Login.module.css';

export default function Register() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('requester');
  const [gradegroup, setGradeGroup] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password || !phone.trim() || !role || !gradegroup) return;
    try {
      setLoading(true);
      setError(null);
      await register({ username: username.trim(), password, phone: phone.trim(), role, gradegroup: gradegroup });
      navigate('/login', { state: { message: 'Registration successful! Please sign in.' } });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to register. Username might already be taken.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.leftPanel} aria-hidden="true">
        <div className={styles.brandBig}>
          <div className={styles.churchIcon}>⛪</div>
          <h1 className={styles.leftTitle}>Join the<br />Community</h1>
          <p className={styles.leftSub}>Create your account to start reserving church inventory and resources.</p>
          <div className={styles.features}>

          </div>
        </div>
      </div>

      <div className={styles.rightPanel}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h2 className={styles.title}>Create Account</h2>
            <p className={styles.subtitle}>Fill in the details below to get started</p>
          </div>

          {error && <div className={styles.error}>{error}</div>}

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
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="role">Account Type</label>
              <select id="role" className={styles.select} value={role}
                onChange={(e) => setRole(e.target.value)} required disabled={loading}>
                <option value="requester">Requester (Church Member)</option>
                <option value="manager">Manager (Inventory Administrator)</option>
              </select>
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="gradeGroup">Grade Group</label>
              <select id="gradeGroup" className={styles.select} value={gradegroup}
                onChange={(e) => setGradeGroup(e.target.value)} required disabled={loading}>
                <option value="">Select Grade Group</option>
                <option value="اول و تاني">اول و تاني</option>
                <option value="تلاته و رابعه">تلاته و رابعه</option>
                <option value="خامسه و سادسه">خامسه و سادسه</option>
                <option value="اعدادي">اعدادي</option>
                <option value="ثانوي">ثانوي</option>
              </select>
            </div>
            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? 'Creating Account...' : 'Create Account →'}
            </button>
          </form>

          <div className={styles.footer}>
            Already have an account?{' '}
            <Link to="/login" className={styles.link}>Sign in here</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
