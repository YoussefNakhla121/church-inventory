import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { login as loginApi } from '../../api/auth';
import styles from './Login.module.css';

export default function Login() {
  const { login: contextLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [gmail, setGmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const successMsg = location.state?.message;
  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!gmail.trim() || !password) return;
    try {
      setLoading(true);
      setError(null);
      const response = await loginApi({ gmail: gmail.trim(), password });
      const { token, user } = response.data;
      contextLogin(token, user);
      if (from === '/') {
        const home = user.role === 'admin' ? '/admin' : user.role === 'manager' ? '/manager' : '/';
        navigate(home);
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to sign in. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* Left branding panel */}
      <div className={styles.leftPanel}>
        <div className={styles.brandBig}>
          <div className={styles.churchIcon}>⛪</div>
          <h1 className={styles.leftTitle}>Wsa2l El 2daa7</h1>
          <p className={styles.leftSub}>A modern reservation system for church equipment and resources.</p>
          <div className={styles.features}>

          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className={styles.rightPanel}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h2 className={styles.title}>Welcome back</h2>
            <p className={styles.subtitle}>Sign in to your account to continue</p>
          </div>

          {successMsg && <div className={styles.success}>✓ {successMsg}</div>}
          {error && <div className={styles.error}>{error}</div>}

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="gmail">Gmail</label>
              <input id="gmail" type="email" className={styles.input} value={gmail}
                onChange={(e) => setGmail(e.target.value)} placeholder="Enter your Gmail"
                required disabled={loading} autoComplete="email" />
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="password">Password</label>
              <input id="password" type="password" className={styles.input} value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                required disabled={loading} autoComplete="current-password" />
            </div>
            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? 'Signing In...' : 'Sign In →'}
            </button>
          </form>

          <div className={styles.footer}>
            Don't have an account?{' '}
            <Link to="/register" className={styles.link}>Register here</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
