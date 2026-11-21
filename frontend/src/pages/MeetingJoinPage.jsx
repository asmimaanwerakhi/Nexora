import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, LockKeyhole, Video } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import MeetingRoom from '../components/MeetingRoom.jsx';
import { createChatSocket } from '../services/chatSocket.js';
import { getMeetingByLink, getMeetingToken, requestMeetingAccess } from '../services/meetingApi.js';
import { useAuthStore } from '../stores/authStore.js';

const errorMessage = (error) =>
  error.response?.data?.error?.message || error.message || 'Could not open this meeting.';

function MeetingJoinPage() {
  const { meetingLink } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [meeting, setMeeting] = useState(null);
  const [socket, setSocket] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const current = await getMeetingByLink(meetingLink);
      setMeeting(current);
      setError('');
      return current;
    } catch (loadError) {
      setError(errorMessage(loadError));
      return null;
    } finally {
      setLoading(false);
    }
  }, [meetingLink]);

  useEffect(() => {
    let active = true;
    let client;
    try {
      client = createChatSocket();
      client.on('connect', () => {
        if (active) setSocket(client);
      });
      client.on('connect_error', (socketError) => {
        if (active) setError(socketError.message);
      });
    } catch (socketError) {
      window.setTimeout(() => {
        if (active) setError(socketError.message);
      }, 0);
    }
    const refreshSocketAuth = (event) => {
      if (!client) return;
      client.auth = { token: event?.detail?.accessToken };
      client.disconnect();
      client.connect();
    };
    const handleDecision = () => void refresh();
    const handleClosed = () => void refresh();
    client?.on('meeting:request-decision', handleDecision);
    client?.on('meeting:cancelled', handleClosed);
    client?.on('meeting:ended', handleClosed);
    window.addEventListener('nexora:auth-refreshed', refreshSocketAuth);
    void refresh();
    return () => {
      active = false;
      window.removeEventListener('nexora:auth-refreshed', refreshSocketAuth);
      client?.disconnect();
    };
  }, [meetingLink, refresh]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (meeting?.accessStatus !== 'waiting') return undefined;
    const interval = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(interval);
  }, [meeting?.accessStatus, refresh]);

  const startTime = meeting ? new Date(meeting.startTime).getTime() : 0;
  const earlyJoinAt = meeting
    ? startTime - (meeting.allowEarlyJoin ? meeting.earlyJoinMinutes : 0) * 60_000
    : 0;
  const countdown = useMemo(() => {
    const remaining = Math.max(0, earlyJoinAt - now);
    const hours = Math.floor(remaining / 3_600_000);
    const minutes = Math.floor((remaining % 3_600_000) / 60_000);
    const seconds = Math.floor((remaining % 60_000) / 1000);
    return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
  }, [earlyJoinAt, now]);

  const requestAccess = async () => {
    setRequesting(true);
    setError('');
    try {
      await requestMeetingAccess(meeting.id);
      await refresh();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setRequesting(false);
    }
  };

  const join = async () => {
    setJoining(true);
    setError('');
    try {
      setCredentials(await getMeetingToken(meeting.id));
    } catch (joinError) {
      setError(errorMessage(joinError));
    } finally {
      setJoining(false);
    }
  };

  const leave = useCallback(() => {
    setCredentials(null);
    void refresh();
  }, [refresh]);

  const requestStatus = meeting?.request?.status;
  const isPrivate = meeting?.accessStatus === 'private';
  const isRemoved = meeting?.accessStatus === 'removed';
  const isEnded = meeting?.accessStatus === 'ended';
  const isWaiting = meeting?.accessStatus === 'waiting';
  const canJoin = meeting?.accessStatus === 'allowed';
  const isBlocked = (meeting?.request?.rejectionCount || 0) >= 3;

  if (credentials && meeting && socket) {
    return (
      <section className="mx-auto max-w-6xl">
        <MeetingRoom
          meeting={meeting}
          user={user}
          socket={socket}
          credentials={credentials}
          onExit={leave}
          onError={setError}
        />
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl rounded-3xl border border-border bg-surface/90 p-5 shadow-sm sm:p-8">
      {loading ? (
        <p className="py-16 text-center text-sm text-text-muted">Loading meeting…</p>
      ) : meeting ? (
        <>
          <div className="mb-6 flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-primary-soft text-brand-primary-text">
              {isPrivate ? <LockKeyhole /> : <CalendarClock />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-primary-text">
                Nexora meeting
              </p>
              <h1 className="mt-1 break-words text-2xl font-semibold text-heading">
                {meeting.title}
              </h1>
              <p className="mt-1 text-sm text-text-muted">
                Hosted by {meeting.host?.name || 'Nexora user'}
              </p>
            </div>
          </div>
          {meeting.description && (
            <p className="mb-5 whitespace-pre-wrap text-sm text-text">{meeting.description}</p>
          )}
          <div className="mb-6 rounded-2xl bg-bg p-4 text-sm">
            <p className="font-medium text-heading">
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: 'full',
                timeStyle: 'short',
              }).format(new Date(meeting.startTime))}
            </p>
            <p className="mt-1 text-text-muted">
              {meeting.durationMinutes} minutes · {meeting.timezone}
            </p>
          </div>
          {error && (
            <p role="alert" className="mb-4 rounded-xl bg-error/10 px-4 py-3 text-sm text-error">
              {error}
            </p>
          )}
          {isEnded ? (
            <p role="status" className="rounded-xl bg-surface px-4 py-3 text-sm text-text-muted">
              Meeting ended or was cancelled.
            </p>
          ) : isPrivate || isRemoved ? (
            <p role="status" className="rounded-xl bg-surface px-4 py-3 text-sm text-text-muted">
              {isRemoved
                ? 'The host removed you from this meeting.'
                : 'This meeting is private. Ask the host for an invitation.'}
            </p>
          ) : isWaiting ? (
            <div className="rounded-xl bg-brand-primary-soft px-4 py-3 text-sm text-brand-primary-text">
              Starts in <strong>{countdown}</strong>. You can join when the early-join window opens.
            </div>
          ) : meeting.accessStatus === 'request_required' ? (
            <div className="space-y-3">
              {requestStatus === 'pending' ? (
                <p
                  role="status"
                  className="rounded-xl bg-brand-primary-soft px-4 py-3 text-sm text-brand-primary-text"
                >
                  Waiting for the host to approve your request…
                </p>
              ) : requestStatus === 'rejected' ? (
                <p role="status" className="rounded-xl bg-error/10 px-4 py-3 text-sm text-error">
                  The host declined your request.{' '}
                  {isBlocked ? 'Further requests are blocked.' : 'You may request again.'}
                </p>
              ) : null}
              {!isBlocked && requestStatus !== 'pending' && (
                <button
                  type="button"
                  disabled={requesting}
                  onClick={() => void requestAccess()}
                  className="w-full rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-on-primary disabled:opacity-60"
                >
                  {requesting ? 'Sending request…' : 'Request to join'}
                </button>
              )}
            </div>
          ) : canJoin ? (
            <button
              type="button"
              disabled={joining || !socket}
              onClick={() => void join()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-on-primary disabled:opacity-60"
            >
              <Video size={18} />
              {joining ? 'Joining…' : socket ? 'Join meeting' : 'Connecting…'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => navigate('/meetings')}
            className="mt-4 w-full rounded-xl px-4 py-2 text-sm font-medium text-text-muted hover:bg-bg"
          >
            Back to meetings
          </button>
        </>
      ) : (
        <div className="py-12 text-center">
          <p role="alert" className="text-sm text-error">
            {error || 'Meeting not found.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/meetings')}
            className="mt-4 rounded-xl border border-border px-4 py-2 text-sm font-medium"
          >
            Back to meetings
          </button>
        </div>
      )}
    </section>
  );
}

export default MeetingJoinPage;
