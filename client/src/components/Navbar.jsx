import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';
import styles from './Navbar.module.css';

export default function Navbar() {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  if (!isAuthenticated) return null;
  const isManager = user?.role === 'manager';
  const initials = user?.gmail?.slice(0, 2).toUpperCase() || 'U';

  const handleNavClick = () => {
    setMobileOpen(false);
  };

  const handleProfileClick = () => {
    navigate('/profile/edit');
    setMobileOpen(false);
  };

  return (
    <nav className={styles.navbar}>
      <Link to="/" className={styles.brand} onClick={handleNavClick}>
        <div className={styles.brandIcon}>⛪</div>
        <div className={styles.brandText}>
          <span className={styles.brandName}>Church Inventory</span>
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
        {!isManager ? (
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
            <span className={styles.gmail}>{user?.gmail}</span>
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
            <span className={styles.gmail}>{user?.gmail}</span>
          </div>
        </button>
        <button onClick={logout} className={styles.logoutBtn}>Logout</button>
      </div>
    </nav>
  );
}
