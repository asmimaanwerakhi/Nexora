import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  MessageCircle,
  MessagesSquare,
  Phone,
  Plus,
  Search,
  UserPlus,
  Users,
  Video,
  X,
  Zap,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import {
  acceptFriendRequest,
  getCallHistory,
  getConversations,
  getFriendRequests,
  getFriends,
  rejectFriendRequest,
} from '../services/chatApi.js';
import { getMeetings } from '../services/meetingApi.js';
import { useAuthStore } from '../stores/authStore.js';

const quickActions = [
  {
    to: '/chat',
    title: 'Start a conversation',
    description: 'Catch up with your team',
    icon: MessagesSquare,
    tone: 'orange',
  },
  {
    to: '/meetings',
    title: 'Meet your team',
    description: 'Join or start a meeting',
    icon: Video,
    tone: 'violet',
  },
  {
    to: '/friends',
    title: 'Find people',
    description: 'Connect with teammates',
    icon: UserPlus,
    tone: 'green',
  },
  {
    to: '/meetings',
    title: 'Schedule a meeting',
    description: 'Plan time together',
    icon: CalendarDays,
    tone: 'blue',
  },
];

const formatMeetingTime = (value) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

const getErrorMessage = (error, fallback) =>
  error.response?.data?.error?.message || error.message || fallback;

function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const [friends, setFriends] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [calls, setCalls] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [busyRequestId, setBusyRequestId] = useState('');
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    let active = true;
    const loadDashboard = async () => {
      setCurrentTime(Date.now());
      try {
        const [friendList, conversationList, meetingList, callResult, requests] = await Promise.all(
          [getFriends(), getConversations(), getMeetings(), getCallHistory(), getFriendRequests()],
        );
        if (!active) return;
        setFriends(friendList);
        setConversations(conversationList);
        setMeetings(meetingList);
        setCalls(callResult.calls);
        setIncomingRequests(requests.incoming);
      } catch (loadError) {
        if (active) setError(getErrorMessage(loadError, 'Could not load your dashboard.'));
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadDashboard();
    return () => {
      active = false;
    };
  }, []);

  const unreadMessages = conversations.reduce(
    (total, conversation) => total + (conversation.unreadCount || 0),
    0,
  );
  const upcomingMeetings = useMemo(
    () =>
      meetings
        .filter(
          (meeting) =>
            meeting.status === 'live' ||
            (meeting.status === 'scheduled' &&
              new Date(meeting.startTime).getTime() >= currentTime),
        )
        .sort((first, second) => new Date(first.startTime) - new Date(second.startTime)),
    [currentTime, meetings],
  );
  const recentConversations = useMemo(
    () =>
      [...conversations]
        .sort(
          (first, second) =>
            new Date(second.lastMessage?.sentAt || second.updatedAt) -
            new Date(first.lastMessage?.sentAt || first.updatedAt),
        )
        .slice(0, 4),
    [conversations],
  );
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there';
  const greeting =
    new Date().getHours() < 12
      ? 'Good morning'
      : new Date().getHours() < 18
        ? 'Good afternoon'
        : 'Good evening';

  const handleFriendRequest = async (request, decision) => {
    setRequestError('');
    setBusyRequestId(request.id);
    try {
      if (decision === 'accepted') {
        await acceptFriendRequest(request.id);
        setFriends((current) => [...current, request.user]);
      } else {
        await rejectFriendRequest(request.id);
      }
      setIncomingRequests((current) => current.filter((entry) => entry.id !== request.id));
    } catch (actionError) {
      setRequestError(getErrorMessage(actionError, 'Could not update this friend request.'));
    } finally {
      setBusyRequestId('');
    }
  };

  const stats = [
    { label: 'Total friends', value: friends.length, icon: Users, tone: 'orange' },
    { label: 'Unread messages', value: unreadMessages, icon: MessageCircle, tone: 'violet' },
    {
      label: 'Upcoming meetings',
      value: upcomingMeetings.length,
      icon: CalendarDays,
      tone: 'blue',
    },
    { label: 'Recent calls', value: calls.length, icon: Phone, tone: 'green' },
  ];

  return (
    <div className="min-w-0 w-full space-y-7">
      {error && (
        <div role="alert" className="rounded-2xl bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      <section className="relative overflow-hidden rounded-3xl border border-brand-primary/15 bg-gradient-to-br from-brand-primary-soft via-bg-subtle to-bg px-6 py-7 sm:px-8 sm:py-9">
        <div
          className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 rounded-full bg-brand-primary/10 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-primary-text">
              <span className="h-2 w-2 rounded-full bg-brand-primary" />
              {greeting}, {firstName}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-heading sm:text-4xl">
              Stay connected.
            </h1>
            <p className="mt-2 text-sm leading-6 text-text-muted sm:text-base">
              Here&apos;s what&apos;s happening in your Nexora today.
            </p>
          </div>
          <Link
            to="/chat"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-on-primary shadow-sm transition hover:bg-brand-primary-hover"
          >
            <MessageCircle size={17} />
            Open your chats
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <section aria-label="Workspace overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <article
            key={label}
            className="rounded-2xl border border-border bg-bg p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5"
          >
            <div className="flex items-center justify-between">
              <span className={`dashboard-icon dashboard-icon-${tone}`}>
                <Icon size={18} />
              </span>
            </div>
            <p className="mt-4 text-2xl font-semibold tracking-tight text-heading">
              {loading ? '—' : value.toLocaleString()}
            </p>
            <h2 className="mt-1 text-xs font-medium text-text-muted">{label}</h2>
          </article>
        ))}
      </section>

      <section aria-labelledby="quick-actions-title">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-primary-text">
              Make it happen
            </p>
            <h2 id="quick-actions-title" className="mt-1 text-lg font-semibold text-heading">
              Quick actions
            </h2>
          </div>
          <Zap size={18} className="text-brand-primary-text" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map(({ to, title, description, icon: Icon, tone }) => (
            <Link
              key={title}
              to={to}
              className="group flex items-center gap-3 rounded-2xl border border-border bg-bg p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-primary/40 hover:shadow-md"
            >
              <span className={`dashboard-icon dashboard-icon-${tone}`}>
                <Icon size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-heading">{title}</span>
                <span className="mt-1 block truncate text-xs text-text-muted">{description}</span>
              </span>
              <ArrowRight
                size={15}
                className="shrink-0 text-text-muted transition group-hover:translate-x-0.5 group-hover:text-brand-primary-text"
              />
            </Link>
          ))}
        </div>
      </section>

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)]">
        <section
          aria-labelledby="recent-conversations-title"
          className="min-w-0 rounded-2xl border border-border bg-bg shadow-sm"
        >
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 id="recent-conversations-title" className="font-semibold text-heading">
                Recent conversations
              </h2>
              <p className="mt-1 text-xs text-text-muted">Pick up where your team left off.</p>
            </div>
            <Link
              to="/chat"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary-text hover:underline"
            >
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {loading ? (
            <p className="px-5 py-8 text-center text-sm text-text-muted">Loading conversations…</p>
          ) : recentConversations.length ? (
            <div className="divide-y divide-border">
              {recentConversations.map((conversation) => (
                <Link
                  key={conversation.id}
                  to={`/chat/${conversation.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-bg-subtle"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-primary-soft text-sm font-semibold text-brand-primary-text">
                    {conversation.participant.avatar ? (
                      <img
                        src={conversation.participant.avatar}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      conversation.participant.name?.slice(0, 1).toUpperCase() || '?'
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-heading">
                      {conversation.participant.name}
                    </span>
                    <span className="mt-1 block truncate text-xs text-text-muted">
                      {conversation.lastMessage?.preview || 'Start a conversation'}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[11px] text-text-muted">
                      {conversation.lastMessage?.sentAt
                        ? formatDistanceToNow(new Date(conversation.lastMessage.sentAt), {
                            addSuffix: true,
                          })
                        : ''}
                    </span>
                    {conversation.unreadCount > 0 && (
                      <span className="rounded-full bg-brand-primary px-2 py-0.5 text-[10px] font-semibold text-on-primary">
                        {conversation.unreadCount}
                      </span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="px-5 py-9 text-center">
              <MessageCircle size={24} className="mx-auto text-brand-primary-text" />
              <p className="mt-2 text-sm font-medium text-heading">Your chats will show up here</p>
              <Link to="/chat" className="mt-2 inline-block text-xs text-brand-primary-text">
                Start a conversation
              </Link>
            </div>
          )}
        </section>

        <section
          aria-labelledby="upcoming-meetings-title"
          className="min-w-0 rounded-2xl border border-border bg-bg shadow-sm"
        >
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 id="upcoming-meetings-title" className="font-semibold text-heading">
                Upcoming meetings
              </h2>
              <p className="mt-1 text-xs text-text-muted">Time set aside to connect.</p>
            </div>
            <Link
              to="/meetings"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary-text hover:underline"
            >
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {loading ? (
            <p className="px-5 py-8 text-center text-sm text-text-muted">Loading meetings…</p>
          ) : upcomingMeetings.length ? (
            <div className="space-y-3 p-4">
              {upcomingMeetings.slice(0, 3).map((meeting) => (
                <article
                  key={meeting.id}
                  className="rounded-xl border border-border bg-bg-subtle p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-heading">
                        {meeting.title}
                      </h3>
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
                        <Clock3 size={14} />
                        {formatMeetingTime(meeting.startTime)}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        {meeting.durationMinutes} minutes
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                        meeting.status === 'live'
                          ? 'bg-success/10 text-success'
                          : 'bg-brand-primary-soft text-brand-primary-text'
                      }`}
                    >
                      {meeting.status === 'live' ? 'Live now' : 'Scheduled'}
                    </span>
                  </div>
                  <Link
                    to={`/meet/${meeting.meetingLink}`}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-primary px-3 py-2 text-xs font-semibold text-on-primary transition hover:bg-brand-primary-hover"
                  >
                    <Video size={15} />
                    {meeting.status === 'live' ? 'Join meeting' : 'Open meeting'}
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="px-5 py-9 text-center">
              <CalendarDays size={24} className="mx-auto text-brand-primary-text" />
              <p className="mt-2 text-sm font-medium text-heading">No upcoming meetings</p>
              <Link to="/meetings" className="mt-2 inline-block text-xs text-brand-primary-text">
                Schedule a meeting
              </Link>
            </div>
          )}
        </section>
      </div>

      <section
        aria-labelledby="friend-requests-title"
        className="rounded-2xl border border-border bg-bg shadow-sm"
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="friend-requests-title" className="font-semibold text-heading">
              Friend requests
            </h2>
            <p className="mt-1 text-xs text-text-muted">New people hoping to connect.</p>
          </div>
          <Link
            to="/friends?tab=requests"
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary-text hover:underline"
          >
            View all <ArrowRight size={14} />
          </Link>
        </div>
        {requestError && (
          <p role="alert" className="mx-4 mt-4 rounded-xl bg-error/10 px-3 py-2 text-xs text-error">
            {requestError}
          </p>
        )}
        {loading ? (
          <p className="px-5 py-7 text-center text-sm text-text-muted">Loading friend requests…</p>
        ) : incomingRequests.length ? (
          <div className="divide-y divide-border">
            {incomingRequests.slice(0, 3).map((request) => (
              <div key={request.id} className="flex items-center gap-3 px-5 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-primary-soft text-sm font-semibold text-brand-primary-text">
                  {request.user.avatar ? (
                    <img src={request.user.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    request.user.name?.slice(0, 1).toUpperCase() || '?'
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-heading">
                    {request.user.name}
                  </span>
                  <span className="block truncate text-xs text-text-muted">
                    {request.user.username ? `@${request.user.username}` : 'Wants to connect'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void handleFriendRequest(request, 'accepted')}
                  disabled={Boolean(busyRequestId)}
                  aria-label={`Accept ${request.user.name}'s friend request`}
                  className="rounded-lg p-2 text-success transition hover:bg-success/10 disabled:opacity-50"
                >
                  <Check size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => void handleFriendRequest(request, 'rejected')}
                  disabled={Boolean(busyRequestId)}
                  aria-label={`Decline ${request.user.name}'s friend request`}
                  className="rounded-lg p-2 text-text-muted transition hover:bg-error/10 hover:text-error disabled:opacity-50"
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-7 text-center">
            <Users size={22} className="mx-auto text-text-muted" />
            <p className="mt-2 text-sm text-text-muted">You&apos;re all caught up.</p>
          </div>
        )}
      </section>

      <div className="flex justify-center">
        <Link
          to="/chat"
          className="inline-flex items-center gap-2 text-xs font-semibold text-brand-primary-text hover:underline"
        >
          <Search size={14} />
          Find your next conversation
          <Plus size={14} />
        </Link>
      </div>
    </div>
  );
}

export default DashboardPage;
