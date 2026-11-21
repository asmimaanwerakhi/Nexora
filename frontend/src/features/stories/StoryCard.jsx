import { Camera, Eye, Play } from 'lucide-react';

function StoryCard({ story, authorName, authorAvatar, onClick }) {
  const name = story.author?.name || authorName || 'Story';
  const avatar = story.author?.avatar || authorAvatar;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View ${name}'s story`}
      className="group relative aspect-[3/4] min-h-56 overflow-hidden rounded-2xl bg-charcoal-800 text-left text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      {story.mediaType === 'image' ? (
        <img
          src={story.mediaUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
      ) : (
        <>
          <video
            src={story.mediaUrl}
            muted
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-black/45 backdrop-blur">
              <Play size={22} fill="currentColor" />
            </span>
          </span>
        </>
      )}
      <span className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/75" />
      <span className="absolute left-3 top-3 grid h-10 w-10 place-items-center overflow-hidden rounded-full border-2 border-brand-primary bg-brand-primary-soft text-sm font-bold text-brand-primary-text shadow">
        {avatar ? (
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          name.slice(0, 1).toUpperCase()
        )}
      </span>
      <span className="absolute bottom-3 left-3 right-3">
        <span className="block truncate text-sm font-semibold">{name}</span>
        {story.caption && (
          <span className="mt-1 block truncate text-xs text-white/80">{story.caption}</span>
        )}
        {typeof story.viewerCount === 'number' && (
          <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-white/80">
            <Eye size={13} />
            {story.viewerCount}
          </span>
        )}
      </span>
      {story.mediaType === 'video' && (
        <span className="absolute right-3 top-3 rounded-full bg-black/45 p-2" aria-hidden="true">
          <Camera size={15} />
        </span>
      )}
      {story.viewedByMe && (
        <span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/50" />
      )}
    </button>
  );
}

export default StoryCard;
