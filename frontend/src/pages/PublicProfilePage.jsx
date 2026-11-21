import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, MessageCircle, UserRound, Users } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createDirectConversation, getPublicProfile } from '../services/chatApi.js';
import { notifyApp } from '../services/notificationService.js';
import { useAuthStore } from '../stores/authStore.js';

function PublicProfilePage() {
  const { profileSlug } = useParams();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const navigate = useNavigate();
  const [resource, setResource] = useState({ slug: '', profile: null, error: '' });
  const [messaging, setMessaging] = useState(false);

  useEffect(() => {
    let active = true;
    getPublicProfile(profileSlug)
      .then((profile) => {
        if (!active) return;
        if (profile.id === currentUserId) {
          navigate('/profile', { replace: true });
          return;
        }
        setResource({ slug: profileSlug, profile, error: '' });
      })
      .catch((loadError) => {
        if (active) {
          setResource({
            slug: profileSlug,
            profile: null,
            error:
              loadError.response?.data?.error?.message ||
              loadError.message ||
              'Could not load this profile.',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [currentUserId, navigate, profileSlug]);

  const loading = resource.slug !== profileSlug;
  const profile = loading ? null : resource.profile;
  const error = loading ? '' : resource.error;
  const initials =
    profile?.name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || '?';

  const openConversation = async () => {
    setMessaging(true);
    try {
      const conversation = await createDirectConversation(profile.id);
      navigate(`/chat/${conversation.id}`);
    } catch (requestError) {
      notifyApp(
        requestError.response?.data?.error?.message ||
          requestError.message ||
          'Could not open this conversation.',
        'error',
      );
    } finally {
      setMessaging(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        to="/friends"
        className="inline-flex items-center gap-2 text-sm font-medium text-text-muted transition hover:text-brand-primary-text"
      >
        <ArrowLeft size={16} />
        Back to friends
      </Link>

      {loading ? (
        <p className="py-16 text-center text-sm text-text-muted">Loading profile…</p>
      ) : error ? (
        <div className="mt-5 rounded-2xl border border-border bg-bg px-5 py-12 text-center shadow-sm">
          <UserRound size={28} className="mx-auto text-text-muted" />
          <h1 className="mt-3 text-xl font-semibold text-heading">Profile unavailable</h1>
          <p role="alert" className="mt-2 text-sm text-text-muted">
            {error}
          </p>
          <Link
            to="/friends"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition hover:bg-brand-primary-hover"
          >
            View friends <ArrowRight size={15} />
          </Link>
        </div>
      ) : (
        <>
          <section className="mt-5 overflow-hidden rounded-3xl border border-border bg-bg shadow-sm">
            <div className="relative h-40 overflow-hidden bg-gradient-to-br from-brand-100 via-brand-50 to-charcoal-100 sm:h-60">
              {profile.coverPhoto && (
                <img
                  src={profile.coverPhoto}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              <div className="absolute bottom-4 right-5 inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-charcoal-700 shadow-sm backdrop-blur">
                <Camera size={14} />
                Profile
              </div>
            </div>

            <div className="relative px-5 pb-0 sm:px-8">
              <div className="absolute left-5 top-0 z-10 grid h-24 w-24 -translate-y-1/2 place-items-center overflow-hidden rounded-full border-4 border-bg bg-brand-primary-soft text-2xl font-semibold text-brand-primary-text shadow-md sm:left-8 sm:h-48 sm:w-48 sm:border-[5px] sm:text-4xl">
                {profile.avatar ? (
                  <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex min-w-0 items-end gap-4">
                  <div className="h-0 w-24 shrink-0 sm:w-48" aria-hidden="true" />
                  <div className="min-w-0 pb-1">
                    <h1 className="truncate text-2xl font-semibold tracking-tight text-heading sm:text-3xl">
                      {profile.name}
                    </h1>
                    <p className="mt-1 truncate text-sm text-text-muted">
                      @{profile.username || profile.profileSlug}
                    </p>
                    <p className="mt-2 truncate text-sm leading-5 text-text-muted">
                      {profile.bio || 'No bio added yet.'}
                    </p>
                    {profile.isFriend && (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-text-muted">
                        <Users size={14} />
                        Friend
                      </p>
                    )}
                  </div>
                </div>
                {profile.isFriend && (
                  <button
                    type="button"
                    disabled={messaging}
                    onClick={() => void openConversation()}
                    className="mb-1 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition hover:bg-brand-primary-hover disabled:cursor-wait disabled:opacity-60"
                  >
                    <MessageCircle size={16} />
                    {messaging ? 'Opening…' : 'Message'}
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-border bg-bg p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-primary-text">
                  Profile details
                </p>
                <h2 className="mt-1 text-lg font-semibold text-heading">About</h2>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-primary-soft text-brand-primary-text">
                <UserRound size={19} />
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-6 text-text-muted">
              {profile.about || 'No additional information shared.'}
            </p>
          </section>
        </>
      )}
    </div>
  );
}

export default PublicProfilePage;
