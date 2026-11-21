import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Copy, Pencil, Plus, Video, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import MeetingFormDialog from '../components/MeetingFormDialog.jsx';
import { cancelMeeting, getMeetings } from '../services/meetingApi.js';
import { createChatSocket } from '../services/chatSocket.js';
import { notifyApp } from '../services/notificationService.js';

const formatDate = (value, timezone) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: timezone || undefined,
  }).format(new Date(value));

function MeetingsPage() {
  const [meetings, setMeetings] = useState([]);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setError('');
      setMeetings(await getMeetings());
    } catch (loadError) {
      setError(
        loadError.response?.data?.error?.message || loadError.message || 'Could not load meetings.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refresh);
    const socket = createChatSocket();
    socket.on('meeting:invited', refresh);
    socket.on('meeting:updated', refresh);
    socket.on('meeting:cancelled', refresh);
    socket.on('meeting:ended', refresh);
    return () => {
      socket.disconnect();
    };
  }, [refresh]);

  const handleSaved = async () => {
    setCreating(false);
    setEditing(null);
    notifyApp('Meeting saved. Invitees have been notified.', 'success');
    await refresh();
  };

  const handleCancel = async (meeting) => {
    if (!window.confirm(`Cancel “${meeting.title}”?`)) return;
    try {
      await cancelMeeting(meeting.id);
      notifyApp('Meeting cancelled.', 'success');
      await refresh();
    } catch (cancelError) {
      notifyApp(cancelError.response?.data?.error?.message || 'Could not cancel meeting.', 'error');
    }
  };

  const copyLink = async (meeting) => {
    try {
      await navigator.clipboard.writeText(meeting.url);
      notifyApp('Meeting link copied.', 'success');
    } catch (copyError) {
      notifyApp(copyError.message || 'Could not copy the meeting link.', 'error');
    }
  };

  return (
    <section className="mx-auto max-w-4xl rounded-3xl border border-border bg-surface/90 p-5 shadow-sm sm:p-8">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-primary-text">
            Group video
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-heading">Meetings</h1>
          <p className="mt-2 max-w-xl text-sm text-text-muted">
            Schedule a secure room, invite people, or let link visitors request access.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-on-primary"
        >
          <Plus size={17} /> Schedule
        </button>
      </header>
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </p>
      )}
      {loading ? (
        <p className="py-12 text-center text-sm text-text-muted">Loading meetings…</p>
      ) : meetings.length ? (
        <div className="space-y-3">
          {meetings.map((meeting) => (
            <article key={meeting.id} className="rounded-2xl border border-border bg-bg p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-semibold text-heading">{meeting.title}</h2>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        meeting.status === 'live'
                          ? 'bg-success/10 text-success'
                          : meeting.status === 'scheduled'
                            ? 'bg-brand-primary-soft text-brand-primary-text'
                            : 'bg-surface text-text-muted'
                      }`}
                    >
                      {meeting.status}
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-2 text-sm text-text-muted">
                    <CalendarClock size={15} />
                    {formatDate(meeting.startTime)}
                    <span>· {meeting.durationMinutes} min</span>
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {meeting.isHost
                      ? 'Hosted by you'
                      : `Hosted by ${meeting.host?.name || 'Nexora user'}`}
                    {' · '}
                    {meeting.accessType === 'link' ? 'Link access' : 'Restricted'}
                    {meeting.accessType === 'link' && meeting.allowLinkRequests
                      ? ' · join requests open'
                      : ''}
                  </p>
                  {meeting.description && (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-text">
                      {meeting.description}
                    </p>
                  )}
                  {meeting.invitedUsers?.length > 0 && (
                    <p className="mt-2 text-xs text-text-muted">
                      {meeting.invitedUsers.length} invitee
                      {meeting.invitedUsers.length === 1 ? '' : 's'}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(meeting.status === 'scheduled' || meeting.status === 'live') && (
                    <Link
                      to={`/meet/${meeting.meetingLink}`}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-3 py-2 text-sm font-semibold text-on-primary"
                    >
                      <Video size={16} />
                      {meeting.status === 'live' ? 'Join' : 'Open'}
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => void copyLink(meeting)}
                    aria-label="Copy meeting link"
                    className="rounded-xl border border-border p-2 text-text-muted hover:bg-surface"
                  >
                    <Copy size={17} />
                  </button>
                  {meeting.isHost && meeting.status === 'scheduled' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditing(meeting)}
                        aria-label="Edit meeting"
                        className="rounded-xl border border-border p-2 text-text-muted hover:bg-surface"
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCancel(meeting)}
                        aria-label="Cancel meeting"
                        className="rounded-xl border border-border p-2 text-error hover:bg-error/10"
                      >
                        <XCircle size={17} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center">
          <CalendarClock size={28} className="mx-auto text-brand-primary-text" />
          <h2 className="mt-3 font-semibold text-heading">No meetings yet</h2>
          <p className="mt-1 text-sm text-text-muted">Schedule a meeting and invite your team.</p>
        </div>
      )}
      {(creating || editing) && (
        <MeetingFormDialog
          meeting={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={handleSaved}
        />
      )}
    </section>
  );
}

export default MeetingsPage;
