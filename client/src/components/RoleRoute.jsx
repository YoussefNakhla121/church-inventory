import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRoleHome } from '../utils/roleHome';

export default function RoleRoute({ allow, children }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allow.includes(user?.role)) {
    const home = getRoleHome(user?.role);
    if (home === location.pathname) {
      return <Navigate to="/login" replace />;
    }
    return <Navigate to={home} replace />;
  }

  return children;
}
