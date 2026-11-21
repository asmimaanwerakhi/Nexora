import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { format } from 'date-fns';
import { getStarredMessages } from '../services/chatApi.js';

function StarredMessagesPage() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getStarredMessages()
      .then((result) => {
        if (active) setMessages(result);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.error?.message || requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-primary-text">
          Saved
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-heading">
          Starred messages
        </h1>
      </header>
      <div className="rounded-3xl border border-border bg-bg p-5 shadow-sm">
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        {loading ? (
          <p className="text-sm text-text-muted">Loading saved messages…</p>
        ) : messages.length ? (
          <div className="space-y-3">
            {messages.map((message) => (
              <NavLink
                key={message._id}
                to={`/chat/${message.conversationId}`}
                className="block rounded-2xl border border-border p-4 hover:bg-bg-subtle"
              >
                <div className="flex items-center justify-between gap-3 text-xs text-text-muted">
                  <span>{message.sender?.name || 'Message'}</span>
                  <time>{format(new Date(message.createdAt), 'MMM d, yyyy p')}</time>
                </div>
                <p className="mt-2 break-words text-sm text-text">
                  {message.text || message.media?.originalName || 'Attachment'}
                </p>
              </NavLink>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">You have not starred any messages.</p>
        )}
      </div>
    </section>
  );
}

export default StarredMessagesPage;
