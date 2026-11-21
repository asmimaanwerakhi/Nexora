import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { searchUsers } from '../services/chatApi.js';
import { createMeeting, updateMeeting } from '../services/meetingApi.js';

const localInputTime = (value) => {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const initialForm = (meeting) => ({
  title: meeting?.title || '',
  description: meeting?.description || '',
  startTime: localInputTime(meeting?.startTime),
  durationMinutes: meeting?.durationMinutes || 30,
  timezone: meeting?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  accessType: meeting?.accessType || 'restricted',
  allowLinkRequests: meeting?.allowLinkRequests || false,
  allowEarlyJoin: meeting?.allowEarlyJoin ?? true,
  earlyJoinMinutes: meeting?.earlyJoinMinutes ?? 10,
});

function MeetingFormDialog({ meeting, onClose, onSaved }) {
  const [form, setForm] = useState(() => initialForm(meeting));
  const [invitees, setInvitees] = useState(meeting?.invitedUsers || []);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const trimmed = query.trim().replace(/^@/, '');
    if (trimmed.length < 3) {
      return () => {
        active = false;
      };
    }
    const timeout = setTimeout(() => {
      setSearching(true);
      searchUsers(trimmed)
        .then((users) => {
          if (active) setResults(users);
        })
        .catch((searchError) => {
          if (active) setError(searchError.response?.data?.error?.message || 'User search failed.');
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const addInvitee = (user) => {
    if (!invitees.some((invitee) => invitee.id === user.id)) {
      setInvitees((current) => [...current, user]);
    }
    setQuery('');
    setResults([]);
  };
  const removeInvitee = (userId) =>
    setInvitees((current) => current.filter((invitee) => invitee.id !== userId));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      startTime: new Date(form.startTime).toISOString(),
      durationMinutes: Number(form.durationMinutes),
      earlyJoinMinutes: Number(form.earlyJoinMinutes),
      allowLinkRequests: form.accessType === 'link' && form.allowLinkRequests,
      invitedUsers: invitees.map((invitee) => invitee.id),
    };
    try {
      const saved = meeting
        ? await updateMeeting(meeting.id, payload)
        : await createMeeting(payload);
      await onSaved(saved);
    } catch (saveError) {
      setError(
        saveError.response?.data?.error?.message || saveError.message || 'Could not save meeting.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="my-auto max-h-[92vh] w-full max-w-2xl space-y-5 overflow-y-auto rounded-3xl border border-border bg-bg p-5 shadow-2xl sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-primary-text">
              Meetings
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-heading">
              {meeting ? 'Edit meeting' : 'Schedule a meeting'}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </p>
        )}
        <label className="block space-y-1.5 text-sm font-medium text-heading">
          Title
          <input
            required
            maxLength={160}
            value={form.title}
            onChange={(event) => update('title', event.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 font-normal"
          />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-heading">
          Description
          <textarea
            maxLength={5000}
            rows={3}
            value={form.description}
            onChange={(event) => update('description', event.target.value)}
            className="w-full resize-y rounded-xl border border-border bg-surface px-3 py-2.5 font-normal"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm font-medium text-heading">
            Date and time ({form.timezone})
            <input
              required
              type="datetime-local"
              value={form.startTime}
              onChange={(event) => update('startTime', event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 font-normal"
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-heading">
            Duration
            <span className="flex items-center gap-2">
              <input
                required
                type="number"
                min="1"
                max="1440"
                value={form.durationMinutes}
                onChange={(event) => update('durationMinutes', event.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 font-normal"
              />
              <span className="text-xs text-text-muted">minutes</span>
            </span>
          </label>
        </div>
        <label className="block space-y-1.5 text-sm font-medium text-heading">
          Access type
          <select
            value={form.accessType}
            onChange={(event) => update('accessType', event.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 font-normal"
          >
            <option value="restricted">Restricted — invitees only</option>
            <option value="link">Link access</option>
          </select>
        </label>
        {form.accessType === 'link' && (
          <label className="flex items-center gap-3 text-sm text-text">
            <input
              type="checkbox"
              checked={form.allowLinkRequests}
              onChange={(event) => update('allowLinkRequests', event.target.checked)}
            />
            Anyone with the link can request to join
          </label>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-3 text-sm text-text">
            <input
              type="checkbox"
              checked={form.allowEarlyJoin}
              onChange={(event) => update('allowEarlyJoin', event.target.checked)}
            />
            Allow early join
          </label>
          {form.allowEarlyJoin && (
            <label className="flex items-center gap-2 text-sm text-text">
              Join up to
              <input
                type="number"
                min="0"
                max="1440"
                value={form.earlyJoinMinutes}
                onChange={(event) => update('earlyJoinMinutes', event.target.value)}
                className="w-20 rounded-lg border border-border bg-surface px-2 py-1.5"
              />
              minutes early
            </label>
          )}
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-heading">Invite registered users</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-text-muted" />
            <input
              value={query}
              onChange={(event) => {
                const value = event.target.value;
                setQuery(value);
                if (value.trim().replace(/^@/, '').length < 3) {
                  setResults([]);
                  setSearching(false);
                }
              }}
              placeholder="Search by exact username"
              className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-3 text-sm"
            />
          </div>
          {searching && <p className="text-xs text-text-muted">Searching…</p>}
          {query.trim().replace(/^@/, '').length >= 3 && results.length > 0 && (
            <div className="max-h-36 overflow-y-auto rounded-xl border border-border bg-bg">
              {results.map((user) => (
                <button
                  type="button"
                  key={user.id}
                  onClick={() => addInvitee(user)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface"
                >
                  <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-brand-primary-soft text-xs font-semibold text-brand-primary-text">
                    {user.avatar ? (
                      <img src={user.avatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      user.name.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span>
                    {user.name} <span className="text-text-muted">@{user.username}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {invitees.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {invitees.map((invitee) => (
                <span
                  key={invitee.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary-soft px-3 py-1 text-xs text-brand-primary-text"
                >
                  {invitee.name}
                  <button
                    type="button"
                    aria-label={`Remove ${invitee.name}`}
                    onClick={() => removeInvitee(invitee.id)}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-text-muted hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-brand-primary px-5 py-2 text-sm font-semibold text-on-primary disabled:opacity-60"
          >
            {saving ? 'Saving…' : meeting ? 'Save changes' : 'Schedule meeting'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default MeetingFormDialog;
