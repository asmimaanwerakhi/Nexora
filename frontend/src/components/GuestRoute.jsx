import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';
import PageLoader from './PageLoader.jsx';

function GuestRoute() {
  const initialized = useAuthStore((state) => state.initialized);
  const user = useAuthStore((state) => state.user);

  if (!initialized) {
    return <PageLoader />;
  }
  return user ? <Navigate to="/profile" replace /> : <Outlet />;
}

export default GuestRoute;
