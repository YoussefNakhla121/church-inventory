import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRoleHome } from '../utils/roleHome';
import { getPendingPaymentsCount } from '../api/payments';
import { useEffect, useState } from 'react';
import styles from './Navbar.module.css';

export default function Navbar() {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingPayments, setPendingPayments] = useState(0);
  const isManager = user?.role === 'manager';
  const isAdmin = user?.role === 'admin';
  const name = user?.full_name?.trim() || '';
  const nameWords = name.split(/\s+/).filter(Boolean);
  const initials = nameWords.length > 1
    ? `${nameWords[0][0]}${nameWords[1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase() || 'U';

  useEffect(() => {
    if (!isManager) return undefined;
    let cancelled = false;

    const fetchPendingCount = async () => {
      try {
        const response = await getPendingPaymentsCount();
        if (!cancelled) setPendingPayments(response.data.count || 0);
      } catch (error) {
        if (!cancelled) console.error('Failed to load pending payment count:', error);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchPendingCount();
    };
    const handleRefresh = () => fetchPendingCount();

    fetchPendingCount();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchPendingCount();
    }, 60000);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('payments:refresh', handleRefresh);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('payments:refresh', handleRefresh);
    };
  }, [isManager, location.pathname]);

  if (!isAuthenticated) return null;

  const handleNavClick = () => {
    setMobileOpen(false);
  };

  const handleProfileClick = () => {
    navigate('/profile/edit');
    setMobileOpen(false);
  };

  return (
    <nav className={styles.navbar}>
      <Link to={getRoleHome(user?.role)} className={styles.brand} onClick={handleNavClick}>
        <div className={styles.brandIcon}>⛪</div>
        <div className={styles.brandText}>
          <span className={styles.brandName}>Wsa2l El 2daa7</span>
          {/* <span className={styles.brandSub}>Reservation System</span> */}
        </div>
      </Link>

      <button
        className={`${styles.hamburger} ${mobileOpen ? styles.hamburgerOpen : ''}`}
        aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((s) => !s)}
      >
        <span />
        <span />
        <span />
      </button>

      <ul className={`${styles.navLinks} ${mobileOpen ? styles.open : ''}`}>
        {isAdmin ? (
          <li>
            <NavLink
              to="/admin"
              end
              className={({ isActive }) => `${styles.navLink} ${isActive ? styles.activeLink : ''}`}
              onClick={handleNavClick}
            >
              Payments
            </NavLink>
          </li>
        ) : !isManager ? (
          <>
            <li>
              <NavLink 
                to="/" 
                end 
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.activeLink : ''}`}
                onClick={handleNavClick}
              >
                Browse Items
              </NavLink>
            </li>
            <li>
              <NavLink 
                to="/requests" 
                end 
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.activeLink : ''}`}
                onClick={handleNavClick}
              >
                My Requests
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/requests/new"
                className={({ isActive }) => `${styles.navLink} ${isActive ? styles.activeLink : ''}`}
                onClick={handleNavClick}
              >
                New Request
              </NavLink>
            </li>
          </>
        ) : (
          <>
            <li>
              <NavLink 
                to="/manager" 
                end 
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.activeLink : ''}`}
                onClick={handleNavClick}
              >
                Dashboard
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/manager/payments"
                className={({ isActive }) => `${styles.navLink} ${isActive ? styles.activeLink : ''}`}
                onClick={handleNavClick}
              >
                Payments {pendingPayments > 0 && <span className={styles.pendingBadge}>{pendingPayments}</span>}
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/manager/items"
                className={({ isActive }) => `${styles.navLink} ${isActive ? styles.activeLink : ''}`}
                onClick={handleNavClick}
              >
                Manage Items
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/requests/new"
                className={({ isActive }) => `${styles.navLink} ${isActive ? styles.activeLink : ''}`}
                onClick={handleNavClick}
              >
                Special Request
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/requests"
                end
                className={({ isActive }) => `${styles.navLink} ${isActive ? styles.activeLink : ''}`}
                onClick={handleNavClick}
              >
                My Requests
              </NavLink>
            </li>
          </>
        )}
      </ul>

      {/* Mobile user info — rendered after navLinks */}
      <div className={`${styles.userInfoMobile} ${mobileOpen ? styles.userInfoMobileOpen : ''}`}>
        <button 
          onClick={handleProfileClick}
          className={styles.userPillButton}
        >
          <div className={styles.userPill}>
            <div className={styles.avatarCircle}>{initials}</div>
            <span className={styles.gmail}>{user?.full_name}</span>
          </div>
        </button>
        <button onClick={() => { logout(); handleNavClick(); }} className={styles.logoutBtn}>Logout</button>
      </div>

      {/* Desktop user info — always in the top bar */}
      <div className={styles.userInfo}>
        <button 
          onClick={handleProfileClick}
          className={styles.userPillButton}
        >
          <div className={styles.userPill}>
            <div className={styles.avatarCircle}>{initials}</div>
            <span className={styles.gmail}>{user?.full_name}</span>
          </div>
        </button>
        <button onClick={logout} className={styles.logoutBtn}>Logout</button>
      </div>
    </nav>
  );
}
