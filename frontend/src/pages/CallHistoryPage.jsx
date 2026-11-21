import { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Phone, Video } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { getCallHistory } from '../services/chatApi.js';

function CallHistoryPage() {
  const [calls, setCalls] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (cursor, append = false) => {
    try {
      setError('');
      const result = await getCallHistory(cursor);
      setCalls((current) => (append ? [...current, ...result.calls] : result.calls));
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (loadError) {
      setError(
        loadError.response?.data?.error?.message || loadError.message || 'Could not load calls.',
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadInitial = async () => {
      try {
        const result = await getCallHistory();
        if (!active) return;
        setCalls(result.calls);
        setNextCursor(result.nextCursor);
        setHasMore(result.hasMore);
      } catch (loadError) {
        if (active) {
          setError(
            loadError.response?.data?.error?.message ||
              loadError.message ||
              'Could not load calls.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadInitial();
    return () => {
      active = false;
    };
  }, []);

  const inviteAgain = (call) => {
    window.dispatchEvent(
      new CustomEvent('nexora:call-invite', {
        detail: { recipientId: call.peer.id, recipient: call.peer, type: call.type },
      }),
    );
  };

  return (
    <section className="mx-auto max-w-3xl rounded-3xl border border-border bg-surface/90 p-5 shadow-sm sm:p-8">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-primary-text">
          Calls
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-heading">Call history</h1>
      </div>
      {error && (
        <div role="alert" className="mb-4 rounded-xl bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      {loading ? (
        <p className="py-12 text-center text-sm text-text-muted">Loading call history…</p>
      ) : calls.length ? (
        <div className="divide-y divide-border">
          {calls.map((call) => {
            const missed = call.direction === 'missed' || call.status === 'missed';
            const CallIcon = call.type === 'video' ? Video : Phone;
            return (
              <article key={call.id} className="flex items-center gap-3 py-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-primary-soft text-sm font-semibold text-brand-primary-text">
                  {call.peer.avatar ? (
                    <img src={call.peer.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    call.peer.name?.slice(0, 1).toUpperCase() || '?'
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-medium ${missed ? 'text-error' : 'text-heading'}`}>
                    {call.peer.name}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
                    {call.direction === 'dialed' ? (
                      <ArrowUpRight size={14} />
                    ) : (
                      <ArrowDownLeft size={14} />
                    )}
                    <CallIcon size={14} />
                    <span>
                      {missed ? 'Missed' : call.direction === 'dialed' ? 'Outgoing' : 'Incoming'}{' '}
                      {call.type} call
                    </span>
                    {call.status === 'ended' && call.durationSeconds > 0 && (
                      <span>
                        · {Math.floor(call.durationSeconds / 60)}:
                        {String(call.durationSeconds % 60).padStart(2, '0')}
                      </span>
                    )}
                  </p>
                  <time
                    className="mt-1 block text-xs text-text-muted"
                    dateTime={call.createdAt}
                    title={format(new Date(call.createdAt), 'PPpp')}
                  >
                    {formatDistanceToNow(new Date(call.createdAt), { addSuffix: true })}
                  </time>
                </div>
                <button
                  type="button"
                  aria-label={`Call ${call.peer.name} back`}
                  className="rounded-full p-2 text-text-muted hover:bg-brand-primary-soft hover:text-brand-primary-text"
                  onClick={() => inviteAgain(call)}
                >
                  <CallIcon size={18} />
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="rounded-2xl bg-bg px-4 py-10 text-center text-sm text-text-muted">
          Your call history will appear here.
        </p>
      )}
      {hasMore && (
        <button
          type="button"
          disabled={loadingMore}
          className="mt-5 w-full rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-muted hover:bg-bg disabled:opacity-60"
          onClick={() => {
            setLoadingMore(true);
            void load(nextCursor, true);
          }}
        >
          {loadingMore ? 'Loading…' : 'Load older calls'}
        </button>
      )}
    </section>
  );
}

export default CallHistoryPage;
