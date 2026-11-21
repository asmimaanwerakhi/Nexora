import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  Bell,
  CheckCircle2,
  CircleAlert,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Phone,
  Settings,
  Star,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getAuthErrorMessage, useAuthStore } from '../stores/authStore.js';
import { createChatSocket } from '../services/chatSocket.js';
import { getAccessToken } from '../services/apiClient.js';
import { getFriendRequests } from '../services/chatApi.js';
import { decideMeetingJoinRequest } from '../services/meetingApi.js';
import FormAlert from './FormAlert.jsx';
import CallManager from './CallManager.jsx';

const primaryNavigationItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/chat', label: 'Chat', icon: MessageCircle },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/calls', label: 'Calls', icon: Phone },
];

const moreNavigationItems = [
  { to: '/meetings', label: 'Meetings', icon: CalendarDays },
  { to: '/stories', label: 'Stories', icon: BookOpen },
  { to: '/starred', label: 'Starred', icon: Star },
];

function AppLayout() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isChatRoute = pathname === '/chat' || pathname.startsWith('/chat/');
  const [logoutError, setLogoutError] = useState('');
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [notification, setNotification] = useState(null);
  const [notificationItems, setNotificationItems] = useState([]);
  const [activePopover, setActivePopover] = useState('');
  const [meetingRequests, setMeetingRequests] = useState([]);
  const [meetingRequestError, setMeetingRequestError] = useState('');
  const [realtimeSocket, setRealtimeSocket] = useState(null);
  const headerRef = useRef(null);
  const unreadNotificationCount = notificationItems.filter((item) => !item.read).length;

  const pushNotification = useCallback((message, type = 'info', to = '') => {
    setNotification({ message, type });
    setNotificationItems((current) =>
      [
        {
          id: `${Date.now()}-${Math.random()}`,
          message,
          type,
          to,
          createdAt: new Date().toISOString(),
          read: false,
        },
        ...current,
      ].slice(0, 30),
    );
  }, []);

  useEffect(() => {
    const closePopover = (event) => {
      if (!headerRef.current?.contains(event.target)) setActivePopover('');
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setActivePopover('');
    };
    document.addEventListener('pointerdown', closePopover);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closePopover);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (!notification) return undefined;
    const timer = window.setTimeout(() => setNotification(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notification]);

  useEffect(() => {
    const root = document.documentElement;
    const theme = user?.settings?.theme || 'system';
    const applyTheme = (systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches) => {
      root.classList.toggle('dark', theme === 'dark' || (theme === 'system' && systemDark));
      root.classList.toggle('light', theme === 'light');
    };
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = (event) => applyTheme(event.matches);
    applyTheme();
    mediaQuery.addEventListener('change', handleThemeChange);
    return () => mediaQuery.removeEventListener('change', handleThemeChange);
  }, [user?.settings?.theme]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    const refreshRequestCount = () => {
      getFriendRequests()
        .then((requests) => {
          if (active) setFriendRequestCount(requests.incoming.length);
        })
        .catch((error) => {
          console.error('Could not refresh friend request count', error);
        });
    };
    const socket = createChatSocket();
    const handleSocketConnect = () => setRealtimeSocket(socket);
    socket.on('connect', handleSocketConnect);
    const handleFriendRequest = (request) => {
      pushNotification(`${request.user.name} sent you a friend request.`, 'info', '/friends?tab=requests');
      refreshRequestCount();
    };
    const handleMeetingJoinRequest = (payload) => {
      pushNotification(
        `${payload.request.user.name} requested to join “${payload.title}”.`,
        'info',
        '/meetings',
      );
      setMeetingRequests((current) => {
        const remaining = current.filter((entry) => entry.request.id !== payload.request.id);
        return [...remaining, payload];
      });
    };
    const handleMeetingInvite = (meeting) => {
      pushNotification(`You were invited to “${meeting.title}”.`, 'info', '/meetings');
    };
    const handleMeetingClosed = ({ meetingId }) => {
      setMeetingRequests((current) => current.filter((entry) => entry.meetingId !== meetingId));
    };
    const handleMeetingUpdated = (meeting) => {
      if (!meeting.allowLinkRequests) {
        setMeetingRequests((current) => current.filter((entry) => entry.meetingId !== meeting.id));
      }
    };
    const refreshSocketAuth = (event) => {
      socket.auth = {
        token: event?.detail?.accessToken ? event.detail.accessToken : getAccessToken(),
      };
      socket.disconnect();
      socket.connect();
    };
    const handleAppNotification = (event) => {
      const { message, type } = event.detail || {};
      if (typeof message !== 'string' || !message.trim()) return;
      pushNotification(message, ['success', 'error'].includes(type) ? type : 'info');
    };
    const handleFriendRequestsUpdated = () => refreshRequestCount();
    socket.on('friend:request', handleFriendRequest);
    socket.on('friend:accepted', refreshRequestCount);
    socket.on('friend:removed', refreshRequestCount);
    socket.on('meeting:join-request', handleMeetingJoinRequest);
    socket.on('meeting:invited', handleMeetingInvite);
    socket.on('meeting:cancelled', handleMeetingClosed);
    socket.on('meeting:request-decision', handleMeetingClosed);
    socket.on('meeting:updated', handleMeetingUpdated);
    window.addEventListener('nexora:notification', handleAppNotification);
    window.addEventListener('nexora:friend-requests-updated', handleFriendRequestsUpdated);
    window.addEventListener('nexora:auth-refreshed', refreshSocketAuth);
    refreshRequestCount();

    return () => {
      active = false;
      setRealtimeSocket(null);
      window.removeEventListener('nexora:notification', handleAppNotification);
      window.removeEventListener('nexora:friend-requests-updated', handleFriendRequestsUpdated);
      window.removeEventListener('nexora:auth-refreshed', refreshSocketAuth);
      socket.off('connect', handleSocketConnect);
      socket.off('friend:request', handleFriendRequest);
      socket.off('friend:accepted', refreshRequestCount);
      socket.off('friend:removed', refreshRequestCount);
      socket.off('meeting:join-request', handleMeetingJoinRequest);
      socket.off('meeting:invited', handleMeetingInvite);
      socket.off('meeting:cancelled', handleMeetingClosed);
      socket.off('meeting:request-decision', handleMeetingClosed);
      socket.off('meeting:updated', handleMeetingUpdated);
      socket.disconnect();
    };
  }, [pushNotification, user?.id]);

  const handleMeetingDecision = async (request, decision) => {
    setMeetingRequestError('');
    try {
      await decideMeetingJoinRequest(request.meetingId, request.request.id, decision);
      setMeetingRequests((current) =>
        current.filter((entry) => entry.request.id !== request.request.id),
      );
    } catch (decisionError) {
      setMeetingRequestError(
        decisionError.response?.data?.error?.message ||
          decisionError.message ||
          'Could not decide request.',
      );
    }
  };

  const handleLogout = async () => {
    setLogoutError('');
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      const message = getAuthErrorMessage(error);
      setLogoutError(message);
      navigate('/login', { replace: true, state: { logoutError: message } });
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-brand-primary/10 blur-3xl" />
        <div className="absolute -right-32 top-1/4 h-80 w-80 rounded-full bg-brand-200/20 blur-3xl" />
      </div>

      {(notification || meetingRequests.length > 0) && (
        <aside
          className="pointer-events-none fixed right-4 top-4 z-50 flex w-96 max-w-[calc(100vw_-_2rem)] flex-col gap-3 sm:right-6 sm:top-6"
          aria-label="Notifications"
        >
          {notification && (
            <div
              role={notification.type === 'error' ? 'alert' : 'status'}
              aria-live={notification.type === 'error' ? 'assertive' : 'polite'}
              aria-atomic="true"
              className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 text-sm text-heading shadow-xl backdrop-blur ${
                notification.type === 'success'
                  ? 'border-success/30 bg-bg/95'
                  : notification.type === 'error'
                    ? 'border-error/30 bg-bg/95'
                    : 'border-brand-primary/20 bg-bg/95'
              }`}
            >
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                  notification.type === 'success'
                    ? 'bg-success/10 text-success'
                    : notification.type === 'error'
                      ? 'bg-error/10 text-error'
                      : 'bg-brand-primary-soft text-brand-primary-text'
                }`}
              >
                {notification.type === 'success' ? (
                  <CheckCircle2 size={17} />
                ) : notification.type === 'error' ? (
                  <CircleAlert size={17} />
                ) : (
                  <Bell size={17} />
                )}
              </span>
              <p className="min-w-0 flex-1 pt-1 leading-5">{notification.message}</p>
              <button
                type="button"
                onClick={() => setNotification(null)}
                aria-label="Dismiss notification"
                className="rounded-lg p-1 text-text-muted transition hover:bg-bg-subtle hover:text-heading"
              >
                <X size={17} />
              </button>
            </div>
          )}
          {meetingRequests.length > 0 && (
            <section className="pointer-events-auto space-y-3" aria-label="Meeting join requests">
              {meetingRequestError && (
                <p role="alert" className="rounded-xl bg-error/10 px-4 py-2 text-sm text-error">
                  {meetingRequestError}
                </p>
              )}
              {meetingRequests.map((entry) => (
                <div
                  key={entry.request.id}
                  className="rounded-2xl border border-brand-primary/20 bg-bg/95 p-4 text-sm text-heading shadow-xl backdrop-blur"
                >
                  <p>
                    <strong>{entry.request.user.name}</strong> requested to join{' '}
                    <strong>{entry.title}</strong>.
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
                    <NavLink
                      to={`/meet/${entry.meetingLink || ''}`}
                      className="rounded-lg px-2 py-1 font-medium text-brand-primary-text hover:bg-brand-primary-soft"
                    >
                      Open meeting
                    </NavLink>
                    <button
                      type="button"
                      onClick={() => void handleMeetingDecision(entry, 'accepted')}
                      className="rounded-lg bg-success px-3 py-1 font-semibold text-white"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleMeetingDecision(entry, 'rejected')}
                      className="rounded-lg bg-error px-3 py-1 font-semibold text-white"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}
        </aside>
      )}

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 sm:px-8">
        <header
          ref={headerRef}
          className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-bg/95 px-1 backdrop-blur sm:gap-4 sm:px-2"
        >
          <NavLink
            to="/dashboard"
            className="grid h-11 w-12 shrink-0 place-items-center rounded-xl transition hover:bg-surface"
            aria-label="Nexora dashboard"
          >
            <img
              src="/icons/CorpTalk-Logo.png"
              alt=""
              className="h-10 w-10 rounded-[10px] object-contain"
            />
          </NavLink>

          <nav
            className="hidden flex-1 items-center justify-center gap-1 sm:flex"
            aria-label="Main navigation"
          >
            {primaryNavigationItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/dashboard' || to === '/friends' || to === '/calls'}
                aria-label={label}
                title={label}
                className={({ isActive }) =>
                  `relative grid h-12 w-14 place-items-center rounded-t-xl border-b-[3px] transition ${
                    isActive
                      ? 'border-brand-primary text-brand-primary-text'
                      : 'border-transparent text-text-muted hover:bg-surface hover:text-heading'
                  }`
                }
              >
                <Icon size={22} strokeWidth={1.8} />
                {to === '/friends' && friendRequestCount > 0 && (
                  <span className="absolute right-1 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[9px] font-bold text-white">
                    {friendRequestCount > 9 ? '9+' : friendRequestCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setActivePopover((current) => (current === 'more' ? '' : 'more'))
                }
                aria-label="More navigation"
                aria-haspopup="menu"
                aria-expanded={activePopover === 'more'}
                title="More"
                className={`grid h-11 w-11 place-items-center rounded-full transition ${
                  activePopover === 'more'
                    ? 'bg-brand-primary-soft text-brand-primary-text'
                    : 'bg-surface text-heading hover:bg-border'
                }`}
              >
                <Menu size={21} />
              </button>
              {activePopover === 'more' && (
                <div
                  role="menu"
                  aria-label="More navigation"
                  className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw_-_2rem)] rounded-2xl border border-border bg-bg p-4 shadow-2xl"
                >
                  <h2 className="mb-3 text-sm font-semibold text-heading">Menu</h2>
                  <div className="mb-3 grid grid-cols-2 gap-2 sm:hidden">
                    {primaryNavigationItems.map(({ to, label, icon: Icon }) => (
                      <NavLink
                        key={to}
                        to={to}
                        role="menuitem"
                        onClick={() => setActivePopover('')}
                        className="flex items-center gap-2 rounded-xl border border-border bg-bg-subtle px-3 py-3 text-sm font-medium text-heading transition hover:border-brand-primary/40 hover:bg-brand-primary-soft"
                      >
                        <Icon size={17} className="text-brand-primary-text" />
                        {label}
                      </NavLink>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {moreNavigationItems.map(({ to, label, icon: Icon }) => (
                      <NavLink
                        key={to}
                        to={to}
                        role="menuitem"
                        onClick={() => setActivePopover('')}
                        className={({ isActive }) =>
                          `flex items-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition ${
                            isActive
                              ? 'border-brand-primary/40 bg-brand-primary-soft text-brand-primary-text'
                              : 'border-border bg-bg-subtle text-heading hover:border-brand-primary/40 hover:bg-brand-primary-soft'
                          }`
                        }
                      >
                        <Icon size={17} />
                        {label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setActivePopover((current) =>
                    current === 'notifications' ? '' : 'notifications',
                  )
                }
                aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`}
                aria-haspopup="dialog"
                aria-expanded={activePopover === 'notifications'}
                title="Notifications"
                className={`relative grid h-11 w-11 place-items-center rounded-full transition ${
                  activePopover === 'notifications'
                    ? 'bg-brand-primary-soft text-brand-primary-text'
                    : 'bg-surface text-heading hover:bg-border'
                }`}
              >
                <Bell size={20} />
                {unreadNotificationCount > 0 && (
                  <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[9px] font-bold text-white">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                )}
              </button>
              {activePopover === 'notifications' && (
                <section
                  role="dialog"
                  aria-label="Notifications"
                  className="absolute right-0 top-full z-50 mt-2 w-96 max-w-[calc(100vw_-_2rem)] overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <h2 className="text-lg font-semibold text-heading">Notifications</h2>
                    <button
                      type="button"
                      disabled={!unreadNotificationCount}
                      onClick={() =>
                        setNotificationItems((current) =>
                          current.map((item) => ({ ...item, read: true })),
                        )
                      }
                      className="text-xs font-semibold text-brand-primary-text hover:underline disabled:cursor-default disabled:text-text-muted disabled:no-underline"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-[min(70vh,28rem)] overflow-y-auto p-2">
                    {notificationItems.length ? (
                      notificationItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setNotificationItems((current) =>
                              current.map((entry) =>
                                entry.id === item.id ? { ...entry, read: true } : entry,
                              ),
                            );
                            setActivePopover('');
                            if (item.to) navigate(item.to);
                          }}
                          className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-bg-subtle ${
                            item.read ? '' : 'bg-brand-primary-soft/60'
                          }`}
                        >
                          <span
                            className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                              item.type === 'error'
                                ? 'bg-error/10 text-error'
                                : item.type === 'success'
                                  ? 'bg-success/10 text-success'
                                  : 'bg-brand-primary-soft text-brand-primary-text'
                            }`}
                          >
                            {item.type === 'error' ? (
                              <CircleAlert size={17} />
                            ) : item.type === 'success' ? (
                              <CheckCircle2 size={17} />
                            ) : (
                              <Bell size={17} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm leading-5 text-heading">
                              {item.message}
                            </span>
                            <span className="mt-1 block text-[11px] text-text-muted">
                              {new Date(item.createdAt).toLocaleTimeString([], {
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </span>
                          </span>
                          {!item.read && (
                            <span
                              aria-label="Unread"
                              className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-primary"
                            />
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-10 text-center">
                        <Bell size={25} className="mx-auto text-text-muted" />
                        <p className="mt-2 text-sm font-medium text-heading">
                          You’re all caught up
                        </p>
                        <p className="mt-1 text-xs text-text-muted">
                          New updates will appear here.
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setActivePopover((current) => (current === 'account' ? '' : 'account'))
                }
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={activePopover === 'account'}
                title={user?.name || 'Account'}
                className={`grid h-11 w-11 place-items-center overflow-hidden rounded-full border-2 transition ${
                  activePopover === 'account'
                    ? 'border-brand-primary'
                    : 'border-transparent hover:border-brand-primary/40'
                }`}
              >
                {user?.avatar ? (
                  <img src={user.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center bg-brand-primary-soft text-sm font-semibold text-brand-primary-text">
                    {user?.name?.slice(0, 1).toUpperCase() || <UserRound size={19} />}
                  </span>
                )}
              </button>
              {activePopover === 'account' && (
                <div
                  role="menu"
                  aria-label="Account"
                  className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-border bg-bg p-2 shadow-2xl"
                >
                  <div className="border-b border-border px-3 py-3">
                    <p className="truncate text-sm font-semibold text-heading">{user?.name}</p>
                    <p className="mt-0.5 text-xs text-text-muted">Your Nexora account</p>
                  </div>
                  <NavLink
                    to="/profile"
                    role="menuitem"
                    onClick={() => setActivePopover('')}
                    className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-heading transition hover:bg-bg-subtle"
                  >
                    <UserRound size={17} className="text-text-muted" />
                    Profile
                  </NavLink>
                  <NavLink
                    to="/setup"
                    role="menuitem"
                    onClick={() => setActivePopover('')}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-heading transition hover:bg-bg-subtle"
                  >
                    <Settings size={17} className="text-text-muted" />
                    Settings
                  </NavLink>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActivePopover('');
                      void handleLogout();
                    }}
                    className="mt-1 flex w-full items-center gap-3 rounded-xl border-t border-border px-3 py-3 text-left text-sm font-semibold text-error transition hover:bg-error/5"
                  >
                    <LogOut size={17} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <FormAlert>{logoutError}</FormAlert>
        <CallManager socket={realtimeSocket} user={user} />
        <main
          className={
            isChatRoute
              ? 'flex min-h-0 min-w-0 flex-1 pt-10 sm:pt-14'
              : 'min-w-0 flex-1 py-10 sm:py-14'
          }
        >
          <Outlet />
        </main>

        {!isChatRoute && (
          <footer className="border-t border-border py-5 text-xs text-text-muted">
            Nexora · Secure account and realtime presence
          </footer>
        )}
      </div>
    </div>
  );
}

export default AppLayout;
