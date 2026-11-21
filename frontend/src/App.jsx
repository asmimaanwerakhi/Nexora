import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import AuthLayout from './components/AuthLayout.jsx';
import GuestRoute from './components/GuestRoute.jsx';
import HomeRedirect from './components/HomeRedirect.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import CallHistoryPage from './pages/CallHistoryPage.jsx';
import MeetingsPage from './pages/MeetingsPage.jsx';
import MeetingJoinPage from './pages/MeetingJoinPage.jsx';
import StoriesPage from './pages/StoriesPage.jsx';
import StarredMessagesPage from './pages/StarredMessagesPage.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Login from './pages/Login.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import Profile from './pages/Profile.jsx';
import FriendsPage from './pages/FriendsPage.jsx';
import PublicProfilePage from './pages/PublicProfilePage.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import SetupPage from './pages/SetupPage.jsx';
import Signup from './pages/Signup.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import { useAuthStore } from './stores/authStore.js';

function App() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route element={<GuestRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<Signup />} />
          <Route path="verify-email" element={<VerifyEmail />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="reset-password" element={<ResetPassword />} />
        </Route>
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="profile" element={<Profile />} />
          <Route path="friends" element={<FriendsPage />} />
          <Route path=":profileSlug" element={<PublicProfilePage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="chat/:conversationId" element={<ChatPage />} />
          <Route path="calls" element={<CallHistoryPage />} />
          <Route path="meetings" element={<MeetingsPage />} />
          <Route path="meet/:meetingLink" element={<MeetingJoinPage />} />
          <Route path="stories" element={<StoriesPage />} />
          <Route path="starred" element={<StarredMessagesPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="setup" element={<SetupPage />} />
          <Route path="404" element={<NotFoundPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}

export default App;
