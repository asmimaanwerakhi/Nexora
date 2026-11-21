import { useEffect, useState } from 'react';
import { ArrowRight, Camera, Mail, Pencil, Phone, Plus, UserRound, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import StoryCard from '../features/stories/StoryCard.jsx';
import StoryViewer from '../features/stories/StoryViewer.jsx';
import { getRecentFriends } from '../services/chatApi.js';
import { getMyStories } from '../services/storyApi.js';
import { useAuthStore } from '../stores/authStore.js';

function Profile() {
  const user = useAuthStore((state) => state.user);
  const [profileTab, setProfileTab] = useState('about');
  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState('');
  const [stories, setStories] = useState([]);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [storiesError, setStoriesError] = useState('');
  const [activeStory, setActiveStory] = useState(null);

  useEffect(() => {
    let active = true;
    getRecentFriends()
      .then((friendList) => {
        if (active) setFriends(friendList);
      })
      .catch((error) => {
        if (active) {
          setFriendsError(
            error.response?.data?.error?.message || error.message || 'Could not load friends.',
          );
        }
      })
      .finally(() => {
        if (active) setFriendsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (profileTab !== 'stories') return undefined;
    let active = true;
    getMyStories()
      .then((ownStories) => {
        if (active) setStories(ownStories);
      })
      .catch((error) => {
        if (active) {
          setStoriesError(
            error.response?.data?.error?.message || error.message || 'Could not load your stories.',
          );
        }
      })
      .finally(() => {
        if (active) setStoriesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [profileTab]);

  const openStoriesTab = () => {
    if (profileTab !== 'stories') {
      setStoriesLoading(true);
      setStoriesError('');
      setProfileTab('stories');
    }
  };

  const initials =
    user.name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || '?';

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section
        id="overview"
        className="overflow-hidden rounded-3xl border border-border bg-bg shadow-sm"
        aria-label="Your profile"
      >
        <div className="relative h-40 overflow-hidden bg-gradient-to-br from-brand-100 via-brand-50 to-charcoal-100 sm:h-60">
          {user.coverPhoto && (
            <img
              src={user.coverPhoto}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {!user.coverPhoto && (
            <>
              <div
                className="absolute -right-10 -top-20 h-72 w-72 rounded-full bg-brand-primary/25 blur-3xl"
                aria-hidden="true"
              />
              <div
                className="absolute -bottom-36 left-1/3 h-72 w-72 rounded-full bg-white/70 blur-3xl"
                aria-hidden="true"
              />
            </>
          )}
          <div className="absolute bottom-4 right-5 inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-charcoal-700 shadow-sm backdrop-blur">
            <Camera size={14} />
            Your space
          </div>
        </div>

        <div className="relative px-5 pb-0 sm:px-8">
          <div className="absolute left-5 top-0 z-10 grid h-24 w-24 -translate-y-1/2 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-bg bg-brand-primary-soft text-2xl font-semibold text-brand-primary-text shadow-md sm:left-8 sm:h-48 sm:w-48 sm:border-[5px] sm:text-4xl">
            {user.avatar ? (
              <img src={user.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 items-end gap-4">
              <div className="h-0 w-24 shrink-0 sm:w-48" aria-hidden="true" />
              <div className="min-w-0 pb-1">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-heading sm:text-3xl">
                  {user.name}
                </h1>
                <p className="mt-1 truncate text-sm text-text-muted">
                  {user.username ? `@${user.username}` : user.email}
                </p>
                <p
                  className="mt-2 truncate text-sm leading-5 text-text-muted"
                  title={user.bio || undefined}
                >
                  {user.bio || 'Add a short bio to introduce yourself.'}
                </p>
                <Link
                  to="/friends"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-brand-primary-text"
                >
                  <Users size={14} />
                  {friendsLoading
                    ? 'Loading friends…'
                    : `${friends.length} ${friends.length === 1 ? 'friend' : 'friends'}`}
                </Link>
                {!user.bio && (
                  <Link
                    to="/setup"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-primary-text hover:underline"
                  >
                    Add bio <ArrowRight size={13} />
                  </Link>
                )}
              </div>
            </div>
            <div className="flex gap-2 sm:mb-1">
              <Link
                to="/setup"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition hover:bg-brand-primary-hover sm:flex-none"
              >
                <Pencil size={16} />
                Edit profile
              </Link>
              <Link
                to="/stories"
                aria-label="Share a story"
                title="Share a story"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-bg-subtle px-3 py-2.5 text-sm font-semibold text-heading transition hover:bg-surface"
              >
                <Camera size={17} />
                <span className="hidden sm:inline">Add story</span>
              </Link>
            </div>
          </div>

          <nav
            className="mt-5 flex gap-1 overflow-x-auto border-t border-border pt-2"
            aria-label="Profile sections"
          >
            <button
              type="button"
              aria-pressed={profileTab === 'about'}
              onClick={() => setProfileTab('about')}
              className={`rounded-lg px-4 py-3 text-sm font-semibold ${
                profileTab === 'about'
                  ? 'border-b-2 border-brand-primary text-brand-primary-text'
                  : 'text-text-muted transition hover:bg-bg-subtle hover:text-heading'
              }`}
            >
              About
            </button>
            <button
              type="button"
              aria-pressed={profileTab === 'friends'}
              onClick={() => setProfileTab('friends')}
              className={`rounded-lg px-4 py-3 text-sm font-semibold ${
                profileTab === 'friends'
                  ? 'border-b-2 border-brand-primary text-brand-primary-text'
                  : 'text-text-muted transition hover:bg-bg-subtle hover:text-heading'
              }`}
            >
              Friends
            </button>
            <button
              type="button"
              aria-pressed={profileTab === 'stories'}
              onClick={openStoriesTab}
              className={`rounded-lg px-4 py-3 text-sm font-semibold ${
                profileTab === 'stories'
                  ? 'border-b-2 border-brand-primary text-brand-primary-text'
                  : 'text-text-muted transition hover:bg-bg-subtle hover:text-heading'
              }`}
            >
              Stories
            </button>
          </nav>
        </div>
      </section>

      {profileTab === 'about' ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-5">
            <section
              id="about"
              className="rounded-2xl border border-border bg-bg p-5 shadow-sm sm:p-6"
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-primary-text">
                    Profile details
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-heading">About you</h2>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-primary-soft text-brand-primary-text">
                  <UserRound size={19} />
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-text-muted">
                {user.about || 'Add more about yourself for your friends and teammates.'}
              </p>
              {!user.about && (
                <Link
                  to="/setup"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-primary-text hover:underline"
                >
                  Add about you <ArrowRight size={13} />
                </Link>
              )}
              <div className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
                <div className="flex items-start gap-3">
                  <Mail size={16} className="mt-0.5 shrink-0 text-text-muted" />
                  <span className="min-w-0">
                    <span className="block text-xs text-text-muted">Work email</span>
                    <span className="mt-0.5 block break-all font-medium text-heading">
                      {user.email}
                    </span>
                  </span>
                </div>
                {user.phone && (
                  <div className="flex items-start gap-3">
                    <Phone size={16} className="mt-0.5 shrink-0 text-text-muted" />
                    <span className="min-w-0">
                      <span className="block text-xs text-text-muted">Phone</span>
                      <span className="mt-0.5 block font-medium text-heading">{user.phone}</span>
                    </span>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <Users size={16} className="mt-0.5 shrink-0 text-text-muted" />
                  <span className="min-w-0">
                    <span className="block text-xs text-text-muted">Friends</span>
                    <span className="mt-0.5 block font-medium text-heading">
                      {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
                    </span>
                  </span>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-bg p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-primary-text">
                    Share a moment
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-heading">Your stories</h2>
                </div>
                <Camera size={19} className="text-brand-primary-text" />
              </div>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                Share a photo or video with your friends. Stories stay up for 24 hours.
              </p>
              <Link
                to="/stories"
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-bg-subtle px-4 py-2.5 text-sm font-semibold text-heading transition hover:bg-surface"
              >
                Create a story <ArrowRight size={15} />
              </Link>
            </section>
          </div>

          <section className="rounded-2xl border border-border bg-bg p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-primary-text">
                  Your people
                </p>
                <h2 className="mt-1 text-lg font-semibold text-heading">Friends</h2>
              </div>
              <Link
                to="/friends"
                className="text-xs font-semibold text-brand-primary-text hover:underline"
              >
                See all
              </Link>
            </div>
            {friendsError ? (
              <p role="alert" className="mt-4 rounded-xl bg-error/10 px-3 py-2 text-xs text-error">
                {friendsError}
              </p>
            ) : friendsLoading ? (
              <p className="mt-5 py-8 text-center text-sm text-text-muted">Loading friends…</p>
            ) : friends.length ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {friends.slice(0, 5).map((friend) => (
                  <Link
                    key={friend.id}
                    to={friend.profileSlug ? `/${friend.profileSlug}` : '/friends'}
                    className="group min-w-0 overflow-hidden rounded-xl border border-border transition hover:border-brand-primary/40 hover:shadow-sm"
                    title={`View ${friend.name}'s profile`}
                  >
                    <div className="grid aspect-square place-items-center overflow-hidden bg-brand-primary-soft text-2xl font-semibold text-brand-primary-text">
                      {friend.avatar ? (
                        <img src={friend.avatar} alt="" className="h-full w-full object-cover" />
                      ) : (
                        friend.name?.slice(0, 1).toUpperCase() || '?'
                      )}
                    </div>
                    <span className="block truncate px-2.5 py-2 text-xs font-semibold text-heading group-hover:text-brand-primary-text">
                      {friend.name}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-xl bg-bg-subtle px-4 py-8 text-center">
                <Users size={24} className="mx-auto text-text-muted" />
                <p className="mt-2 text-sm font-medium text-heading">
                  Your friends will appear here
                </p>
                <Link
                  to="/friends"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-primary-text hover:underline"
                >
                  Find people <ArrowRight size={13} />
                </Link>
              </div>
            )}
          </section>
        </div>
      ) : profileTab === 'friends' ? (
        <section className="rounded-2xl border border-border bg-bg p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-primary-text">
                Your people
              </p>
              <h2 className="mt-1 text-lg font-semibold text-heading">Recent friends</h2>
            </div>
            <Link
              to="/friends"
              className="text-sm font-semibold text-brand-primary-text hover:underline"
            >
              See all
            </Link>
          </div>
          {friendsError ? (
            <p role="alert" className="mt-4 rounded-xl bg-error/10 px-3 py-2 text-xs text-error">
              {friendsError}
            </p>
          ) : friendsLoading ? (
            <p className="mt-5 py-8 text-center text-sm text-text-muted">Loading friends…</p>
          ) : friends.length ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {friends.slice(0, 5).map((friend) => (
                <Link
                  key={friend.id}
                  to={friend.profileSlug ? `/${friend.profileSlug}` : '/friends'}
                  className="group min-w-0 overflow-hidden rounded-xl border border-border transition hover:border-brand-primary/40 hover:shadow-sm"
                  title={`View ${friend.name}'s profile`}
                >
                  <div className="grid aspect-square place-items-center overflow-hidden bg-brand-primary-soft text-2xl font-semibold text-brand-primary-text">
                    {friend.avatar ? (
                      <img src={friend.avatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      friend.name?.slice(0, 1).toUpperCase() || '?'
                    )}
                  </div>
                  <span className="block truncate px-2.5 py-2 text-xs font-semibold text-heading group-hover:text-brand-primary-text">
                    {friend.name}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-xl bg-bg-subtle px-4 py-8 text-center">
              <Users size={24} className="mx-auto text-text-muted" />
              <p className="mt-2 text-sm font-medium text-heading">Your friends will appear here</p>
              <Link
                to="/friends"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-primary-text hover:underline"
              >
                Find people <ArrowRight size={13} />
              </Link>
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-4 rounded-2xl border border-border bg-bg p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-primary-text">
                Highlights
              </p>
              <h2 className="mt-1 text-xl font-semibold text-heading">Your stories</h2>
              <p className="mt-1 text-sm text-text-muted">Stories stay visible for 24 hours.</p>
            </div>
          </div>
          {storiesError && (
            <p role="alert" className="rounded-xl bg-error/10 px-3 py-2 text-sm text-error">
              {storiesError}
            </p>
          )}
          {storiesLoading ? (
            <p className="py-8 text-center text-sm text-text-muted">Loading stories…</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Link
                to="/stories"
                className="group flex aspect-[3/4] min-h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-bg-subtle p-4 text-center transition hover:border-brand-primary/50 hover:bg-brand-primary-soft/40"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-primary-soft text-brand-primary-text transition group-hover:scale-105">
                  <Plus size={26} />
                </span>
                <span>
                  <span className="block font-semibold text-heading">New story</span>
                  <span className="mt-1 block text-xs text-text-muted">Share a moment</span>
                </span>
              </Link>
              {stories.map((story) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  authorName={user.name}
                  authorAvatar={user.avatar}
                  onClick={() => setActiveStory(story)}
                />
              ))}
            </div>
          )}
          {!storiesLoading && !storiesError && stories.length === 0 && (
            <p className="text-sm text-text-muted">Your active stories will appear here.</p>
          )}
        </section>
      )}
      {activeStory && (
        <StoryViewer
          story={activeStory}
          stories={stories}
          author={{ name: user.name, avatar: user.avatar }}
          error={storiesError}
          onOpenStory={setActiveStory}
          onClose={() => setActiveStory(null)}
        />
      )}
    </div>
  );
}

export default Profile;
