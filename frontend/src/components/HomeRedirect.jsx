import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';
import PageLoader from './PageLoader.jsx';
import LandingPage from '../pages/LandingPage.jsx';

function HomeRedirect() {
  const initialized = useAuthStore((state) => state.initialized);
  const user = useAuthStore((state) => state.user);

  if (!initialized) {
    return <PageLoader />;
  }
  return user ? <Navigate to="/profile" replace /> : <LandingPage />;
}

export default HomeRedirect;
