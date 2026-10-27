import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRoleHome } from '../utils/roleHome';

export default function ManagerRoute({ children }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user?.role !== 'manager') {
    const home = getRoleHome(user?.role);
    if (home === location.pathname) {
      return <Navigate to="/login" replace />;
    }
    return <Navigate to={home} replace />;
  }

  return children;
}
