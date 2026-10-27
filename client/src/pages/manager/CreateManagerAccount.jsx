import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGradeGroups, registerAdmin, registerManager } from '../../api/auth';
import { ADMIN_EXTRA_GRADE_GROUPS } from '../../constants/gradeGroups';
import styles from '../auth/Login.module.css';

export default function CreateManagerAccount() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [gmail, setGmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('manager');
  const [gradegroup, setGradegroup] = useState('');
  const [gradeGroups, setGradeGroups] = useState([]);
  const [gradeGroupsLoading, setGradeGroupsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (role !== 'admin') return;

    const fetchGradeGroups = async () => {
      setGradeGroupsLoading(true);
      try {
        const response = await getGradeGroups();
        setGradeGroups(response.data || []);
      } catch (err) {
        console.error('Failed to load grade groups:', err);
        setGradeGroups([]);
      } finally {
        setGradeGroupsLoading(false);
      }
    };

    fetchGradeGroups();
  }, [role]);

  const availableGradeGroups = [...new Set([...gradeGroups, ...ADMIN_EXTRA_GRADE_GROUPS])];
  const isAdmin = role === 'admin';

  const handleRoleChange = (e) => {
    const nextRole = e.target.value;
    setRole(nextRole);
    if (nextRole === 'manager') setGradegroup('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !gmail.trim() || !password || !phone.trim() || (isAdmin && !gradegroup.trim())) return;
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      const account = { full_name: fullName.trim(), gmail: gmail.trim(), password, phone: phone.trim() };
      if (isAdmin) {
        await registerAdmin({ ...account, gradegroup });
      } else {
        await registerManager({ ...account, role: 'manager', gradegroup: 'N/A' });
      }
      setSuccess(`${isAdmin ? 'Admin' : 'Manager'} account created successfully!`);
      setGmail('');
      setFullName('');
      setPassword('');
      setPhone('');
      setGradegroup('');
      setRole('manager');
      setTimeout(() => navigate('/manager'), 2000);
    } catch (err) {
      setError(err.response?.data?.error || `Failed to create ${isAdmin ? 'admin' : 'manager'} account. Gmail might already be taken.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.leftPanel} aria-hidden="true">
        <div className={styles.brandBig}>
          <div className={styles.churchIcon}>⛪</div>
          <h1 className={styles.leftTitle}>Create Account</h1>
          <p className={styles.leftSub}>Add a new inventory {isAdmin ? 'admin' : 'manager'} account.</p>
          <div className={styles.features} />
        </div>
      </div>

      <div className={styles.rightPanel}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h2 className={styles.title}>Create Account</h2>
            <p className={styles.subtitle}>Fill in the details below to create a {isAdmin ? 'admin' : 'manager'} account</p>
          </div>

          {error && <div className={styles.error}>{error}</div>}
          {success && <div style={{ padding: '12px', marginBottom: '16px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '6px', fontSize: '14px' }}>{success}</div>}

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="role">Role</label>
              <select id="role" className={styles.select} value={role} onChange={handleRoleChange} disabled={loading}>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="fullName">Full Name</label>
              <input id="fullName" type="text" className={styles.input} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={`Enter the ${isAdmin ? 'admin' : 'manager'} full name`} required disabled={loading} autoComplete="name" />
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="gmail">Gmail</label>
              <input id="gmail" type="email" className={styles.input} value={gmail} onChange={(e) => setGmail(e.target.value)} placeholder={`Enter the ${isAdmin ? 'admin' : 'manager'} Gmail`} required disabled={loading} autoComplete="email" />
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="password">Password</label>
              <input id="password" type="password" className={styles.input} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 characters" required disabled={loading} autoComplete="new-password" />
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="phone">Phone Number</label>
              <input id="phone" type="tel" className={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 012xxxxxxxx" required disabled={loading} autoComplete="tel" />
            </div>
            {isAdmin && (
              <div className={styles.inputGroup}>
                <label className={styles.label} htmlFor="gradegroup">Grade Group</label>
                <select id="gradegroup" className={styles.select} value={gradegroup} onChange={(e) => setGradegroup(e.target.value)} required disabled={loading || gradeGroupsLoading || availableGradeGroups.length === 0} dir="auto">
                  <option value="">{gradeGroupsLoading ? 'Loading grade groups...' : 'Select Grade Group'}</option>
                  {availableGradeGroups.map((group) => <option key={group} value={group} dir="auto">{group}</option>)}
                </select>
              </div>
            )}
            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? 'Creating Account...' : `${isAdmin ? 'Create Admin' : 'Create Manager'} Account →`}
            </button>
          </form>

          <div className={styles.footer}>
            Want to go back?{' '}
            <button type="button" onClick={() => navigate('/manager')} className={styles.link} style={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
