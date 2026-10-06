import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register, getGradeGroups } from '../../api/auth';
import styles from './Login.module.css';

export default function Register() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [gmail, setGmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('requester');
  const [gradegroup, setGradegroup] = useState('');
  const [gradeGroups, setGradeGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !gmail.trim() || !password || !phone.trim() || !role || !gradegroup) return;
    try {
      setLoading(true);
      setError(null);
      await register({ full_name: fullName.trim(), gmail: gmail.trim(), password, phone: phone.trim(), role, gradegroup: gradegroup });
      navigate('/login', { state: { message: 'Registration successful! Please sign in.' } });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to register. Gmail might already be taken.');
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
          <p className={styles.leftSub}>Create your account to start reserving church's Wsa2l El 2daa7 and resources.</p>
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
              <label className={styles.label} htmlFor="fullName">Full Name</label>
              <input id="fullName" type="text" className={styles.input} value={fullName}
                onChange={(e) => setFullName(e.target.value)} placeholder="Enter your full name"
                required disabled={loading} autoComplete="name" />
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="gmail">Gmail</label>
              <input id="gmail" type="email" className={styles.input} value={gmail}
                onChange={(e) => setGmail(e.target.value)} placeholder="Enter your Gmail"
                required disabled={loading} autoComplete="email" />
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
              <label className={styles.label} htmlFor="gradegroup">Grade Group</label>
              <select id="gradegroup" className={styles.select} value={gradegroup}
                onChange={(e) => setGradegroup(e.target.value)} required disabled={loading || gradeGroups.length === 0}>
                <option value="">{gradeGroups.length ? 'Select Grade Group' : 'Loading grade groups...'}</option>
                {gradeGroups.map((group) => (
                  <option key={group} value={group}>{group}</option>
                ))}
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
