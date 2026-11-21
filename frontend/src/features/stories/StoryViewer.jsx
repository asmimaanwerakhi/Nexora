import { useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Eye, Trash2, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

function StoryViewer({ story, stories, author, error, onOpenStory, onClose, onDelete }) {
  const storyIndex = stories.findIndex((entry) => entry.id === story.id);
  const name = story.author?.name || author?.name || 'Story';
  const avatar = story.author?.avatar || author?.avatar;
  const createdAt = story.createdAt ? new Date(story.createdAt) : null;
  const storyTime =
    createdAt && !Number.isNaN(createdAt.getTime())
      ? formatDistanceToNow(createdAt, { addSuffix: true })
      : 'Recently';

  const moveStory = useCallback((offset) => {
    const nextStory = stories[storyIndex + offset];
    if (nextStory) onOpenStory?.(nextStory);
  }, [onOpenStory, stories, storyIndex]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') moveStory(-1);
      if (event.key === 'ArrowRight') moveStory(1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveStory, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${name}'s story`}
      className="fixed inset-0 z-[120] flex flex-col bg-[#101010] text-white"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-3 pb-4 pt-3 sm:px-6 sm:pt-5">
        <div className="flex gap-1.5" aria-hidden="true">
          {stories.map((entry, index) => (
            <span key={entry.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
              <span
                className={`block h-full rounded-full bg-white ${
                  index < storyIndex ? 'w-full' : index === storyIndex ? 'w-2/5' : 'w-0'
                }`}
              />
            </span>
          ))}
        </div>

        <header className="flex items-center gap-3 py-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-white/80 bg-brand-primary-soft font-semibold text-brand-primary-text">
            {avatar ? (
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              name.slice(0, 1).toUpperCase()
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{name}</span>
            <span className="block text-xs text-white/65">{storyTime}</span>
          </span>
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(story)}
              aria-label="Delete story"
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"
            >
              <Trash2 size={19} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close story"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"
          >
            <X size={21} />
          </button>
        </header>

        <main className="relative flex min-h-0 flex-1 items-center justify-center">
          {error && (
            <p
              role="alert"
              className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-xl bg-red-950/85 px-4 py-2 text-sm text-red-100"
            >
              {error}
            </p>
          )}
          {story.mediaType === 'video' ? (
            <video
              key={story.id}
              src={story.mediaUrl}
              controls
              autoPlay
              playsInline
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          ) : (
            <img
              key={story.id}
              src={story.mediaUrl}
              alt={story.caption || `${name}'s story`}
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          )}

          {storyIndex > 0 && (
            <button
              type="button"
              onClick={() => moveStory(-1)}
              aria-label="Previous story"
              className="absolute left-2 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/35 backdrop-blur transition hover:bg-black/60 sm:left-4"
            >
              <ChevronLeft size={25} />
            </button>
          )}
          {storyIndex >= 0 && storyIndex < stories.length - 1 && (
            <button
              type="button"
              onClick={() => moveStory(1)}
              aria-label="Next story"
              className="absolute right-2 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/35 backdrop-blur transition hover:bg-black/60 sm:right-4"
            >
              <ChevronRight size={25} />
            </button>
          )}
        </main>

        <footer className="flex min-h-16 items-end justify-between gap-4 pt-3">
          <div className="min-w-0">
            {story.caption && <p className="truncate text-sm text-white/90">{story.caption}</p>}
            <p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold">
              <Eye size={17} />
              {story.viewerCount || 0} {story.viewerCount === 1 ? 'viewer' : 'viewers'}
            </p>
          </div>
          <span className="shrink-0 text-xs text-white/55">
            {storyIndex >= 0 ? `${storyIndex + 1} / ${stories.length}` : ''}
          </span>
        </footer>
      </div>
    </div>
  );
}

export default StoryViewer;
