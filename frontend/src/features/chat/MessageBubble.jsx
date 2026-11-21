import { useEffect, useRef, useState } from 'react';
import { Check, CheckCheck, Clock3, Copy, Reply, Trash2 } from 'lucide-react';
import { Flag, Forward, Pencil, Pin, Smile, Star } from 'lucide-react';
import { format, isSameDay } from 'date-fns';

const getStatusIcon = (status) => {
  if (status === 'seen') return <CheckCheck size={14} className="text-brand-primary-text" />;
  if (status === 'delivered') return <CheckCheck size={14} />;
  if (status === 'sent') return <Check size={14} />;
  return <Clock3 size={14} />;
};

function MessageBubble({
  message,
  previousMessage,
  own,
  group = false,
  onCopy,
  onDelete,
  onEdit,
  onForward,
  onPin,
  onReact,
  onReport,
  onReply,
  onRetry,
  onStar,
}) {
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const contextMenuRef = useRef(null);
  const sentAt = new Date(message.createdAt);
  const showDate = !previousMessage || !isSameDay(sentAt, new Date(previousMessage.createdAt));
  const deletedForMe = message.deletedFor?.some((id) => id.toString() === message.currentUserId);
  const seenByCount = message.receipts?.filter((receipt) => receipt.readAt).length || 0;
  const isDeleted = message.deletedForAll || deletedForMe;

  useEffect(() => {
    if (!contextMenu) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!contextMenuRef.current?.contains(event.target)) setContextMenu(null);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [contextMenu]);

  const openContextMenu = (event) => {
    if (isDeleted) return;
    event.preventDefault();
    const menuWidth = Math.min(344, window.innerWidth - 16);
    setContextMenu({
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - 80)),
    });
  };

  const runMenuAction = (action) => {
    setContextMenu(null);
    action();
  };

  return (
    <div>
      {showDate && (
        <div className="my-5 flex justify-center">
          <span className="rounded-full border border-border bg-bg/90 px-4 py-1.5 text-xs font-medium text-text-muted shadow-sm">
            {format(
              sentAt,
              isSameDay(sentAt, new Date())
                ? "'Today,' MMMM d, yyyy"
                : 'EEEE, MMMM d, yyyy',
            )}
          </span>
        </div>
      )}
      {message.type === 'system' ? (
        <p className="my-3 text-center text-xs text-text-muted">{message.text}</p>
      ) : (
        <div className={`group flex items-end gap-2 ${own ? 'justify-end' : 'justify-start'}`}>
          {group && !own && (
            <span className="mb-1 grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-primary-soft text-[10px] font-semibold text-brand-primary-text">
              {message.sender?.avatar ? (
                <img src={message.sender.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                message.sender?.name?.slice(0, 1).toUpperCase() || '?'
              )}
            </span>
          )}
          <article
            onContextMenu={openContextMenu}
            className={`relative w-fit min-w-[7.5rem] max-w-[85%] rounded-2xl border px-4 py-2.5 shadow-sm sm:max-w-[75%] ${
              own
                ? 'rounded-br-md border-brand-primary/15 bg-brand-primary-soft text-heading'
                : 'rounded-bl-md border-border bg-bg text-text'
            }`}
          >
            {group && !own && (
              <p className="mb-1 text-[11px] font-semibold text-brand-primary-text">
                {message.sender?.name || 'Group member'}
              </p>
            )}
            {message.replyTo && (
              <div className="mb-2 border-l-2 border-brand-primary pl-2 text-xs text-text-muted">
                <span className="font-semibold">{message.replyTo.senderName}</span>
                <p className="truncate">{message.replyTo.text || 'Attachment'}</p>
              </div>
            )}
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                {isDeleted ? (
                  <p className="text-sm italic text-text-muted">Message deleted</p>
                ) : (
                  <>
                    {message.text && (
                      <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
                    )}
                    {message.media?.url && (
                      <div className={message.text ? 'mt-2' : ''}>
                        {message.type === 'image' ? (
                          <a href={message.media.url} target="_blank" rel="noreferrer">
                            <img
                              src={message.media.url}
                              alt={message.media.originalName || 'Shared image'}
                              className="max-h-80 max-w-full rounded-xl object-contain"
                            />
                          </a>
                        ) : message.type === 'video' ? (
                          <video
                            controls
                            preload="metadata"
                            className="max-h-80 max-w-full rounded-xl"
                          >
                            <source
                              src={message.media.url}
                              type={message.media.mimeType || undefined}
                            />
                          </video>
                        ) : message.type === 'voice' ? (
                          <audio controls preload="metadata" className="max-w-full">
                            <source
                              src={message.media.url}
                              type={message.media.mimeType || undefined}
                            />
                          </audio>
                        ) : (
                          <a
                            href={message.media.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-xl border border-border bg-bg-subtle px-3 py-2 text-sm font-medium underline"
                          >
                            {message.media.originalName || 'Download file'}
                          </a>
                        )}
                      </div>
                    )}
                  </>
                )}
                {message.reactions?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[...new Set(message.reactions.map((reaction) => reaction.emoji))].map(
                      (emoji) => {
                        const matching = message.reactions.filter(
                          (reaction) => reaction.emoji === emoji,
                        );
                        return (
                          <button
                            type="button"
                            key={emoji}
                            onClick={() => onReact(message, emoji)}
                            aria-label={`React ${emoji}, ${matching.length} reactions`}
                            className={`rounded-full border px-2 py-0.5 text-xs ${
                              matching.some(
                                (reaction) =>
                                  reaction.userId?.toString() === message.currentUserId,
                              )
                                ? 'border-brand-primary bg-brand-primary-soft'
                                : 'border-border bg-bg'
                            }`}
                          >
                            {emoji} {matching.length}
                          </button>
                        );
                      },
                    )}
                  </div>
                )}
                {reactionsOpen && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '👏'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        aria-label={`React ${emoji}`}
                        onClick={() => {
                          setReactionsOpen(false);
                          onReact(message, emoji);
                        }}
                        className="rounded-lg p-1.5 hover:bg-surface"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center justify-end gap-1 text-[10px] text-text-muted">
                {message.failed ? (
                  <button
                    type="button"
                    className="text-error underline"
                    onClick={() => onRetry(message)}
                  >
                    Retry
                  </button>
                ) : (
                  <>
                    <span>{format(sentAt, 'p')}</span>
                    {message.editedAt && <span>Edited</span>}
                    {message.forwarded && <span>Forwarded</span>}
                    {own &&
                      (group ? (
                        <span>{seenByCount > 0 ? `Seen by ${seenByCount}` : 'Sent'}</span>
                      ) : (
                        getStatusIcon(message.status)
                      ))}
                  </>
                )}
              </div>
            </div>
            {contextMenu && (
              <div
                ref={contextMenuRef}
                role="menu"
                aria-label="Message actions"
                onContextMenu={(event) => event.preventDefault()}
                style={{ left: contextMenu.left, top: contextMenu.top }}
                className="fixed z-[120] flex max-w-[calc(100vw-1rem)] flex-wrap items-center gap-0.5 rounded-xl border border-border bg-bg p-1 shadow-xl"
              >
                {message.text && (
                  <ContextAction
                    label="Copy message"
                    onClick={() => runMenuAction(() => onCopy(message.text))}
                  >
                    <Copy size={16} />
                  </ContextAction>
                )}
                <ContextAction
                  label="Reply to message"
                  onClick={() => runMenuAction(() => onReply(message))}
                >
                  <Reply size={16} />
                </ContextAction>
                {own && message.type === 'text' && (
                  <ContextAction
                    label="Edit message"
                    onClick={() => runMenuAction(() => onEdit(message))}
                  >
                    <Pencil size={16} />
                  </ContextAction>
                )}
                <ContextAction
                  label="React to message"
                  onClick={() => runMenuAction(() => setReactionsOpen(true))}
                >
                  <Smile size={16} />
                </ContextAction>
                <ContextAction
                  label="Forward message"
                  onClick={() => runMenuAction(() => onForward(message))}
                >
                  <Forward size={16} />
                </ContextAction>
                <ContextAction
                  label={message.isPinned ? 'Unpin message' : 'Pin message'}
                  active={message.isPinned}
                  onClick={() => runMenuAction(() => onPin(message))}
                >
                  <Pin size={16} />
                </ContextAction>
                <ContextAction
                  label={message.isStarred ? 'Unstar message' : 'Star message'}
                  active={message.isStarred}
                  onClick={() => runMenuAction(() => onStar(message))}
                >
                  <Star size={16} />
                </ContextAction>
                {!own && (
                  <ContextAction
                    label="Report message"
                    danger
                    onClick={() => runMenuAction(() => onReport(message))}
                  >
                    <Flag size={16} />
                  </ContextAction>
                )}
                <ContextAction
                  label={own ? 'Delete for me or everyone' : 'Delete for me'}
                  danger
                  onClick={() => runMenuAction(() => onDelete(message, own))}
                >
                  <Trash2 size={16} />
                </ContextAction>
              </div>
            )}
          </article>
        </div>
      )}
    </div>
  );
}

function ContextAction({ label, onClick, children, active = false, danger = false }) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-lg transition ${
        danger
          ? 'text-text-muted hover:bg-error/10 hover:text-error'
          : active
            ? 'bg-brand-primary-soft text-brand-primary-text'
            : 'text-text-muted hover:bg-surface hover:text-heading'
      }`}
    >
      {children}
    </button>
  );
}

export default MessageBubble;
