import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';
import PageLoader from './PageLoader.jsx';

function RequireAuth() {
  const initialized = useAuthStore((state) => state.initialized);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();

  if (!initialized) {
    return <PageLoader />;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

export default RequireAuth;
