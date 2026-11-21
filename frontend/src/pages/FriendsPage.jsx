import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MessageCircle,
  Search,
  Shield,
  UserRoundPlus,
  Users,
  X,
} from 'lucide-react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  acceptFriendRequest,
  blockFriend,
  cancelFriendRequest,
  createDirectConversation,
  getBlockedUsers,
  getFriendRequests,
  getRecentFriends,
  rejectFriendRequest,
  removeFriend,
  searchUsers,
  sendFriendRequest,
  unblockFriend,
} from '../services/chatApi.js';
import { notifyApp } from '../services/notificationService.js';

const FRIENDS_PER_PAGE = 4;
const profilePath = (person) => (person.profileSlug ? `/${person.profileSlug}` : '/friends');

function FriendsPage() {
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] });
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [actingOnUserId, setActingOnUserId] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeTab = ['requests', 'blocked'].includes(searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'friends';

  const updateSearch = (value) => {
    setSearch(value);
    if (/^[a-z0-9_]{3,20}$/i.test(value.trim().replace(/^@/, ''))) {
      setSearching(true);
      setSearchError('');
      setSearchResults([]);
    } else {
      setSearching(false);
      setSearchError('');
      setSearchResults([]);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([getRecentFriends(), getFriendRequests(), getBlockedUsers()])
      .then(([friendList, friendRequests, blocked]) => {
        if (!active) return;
        setFriends(friendList);
        setRequests(friendRequests);
        setBlockedUsers(blocked);
      })
      .catch((loadError) => {
        if (active) {
          setError(
            loadError.response?.data?.error?.message ||
              loadError.message ||
              'Could not load friends.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const username = search.trim().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,20}$/i.test(username)) return undefined;

    let active = true;
    const timeout = window.setTimeout(() => {
      setSearching(true);
      searchUsers(username)
        .then((users) => {
          if (active) setSearchResults(users);
        })
        .catch((searchFailure) => {
          if (active) {
            setSearchError(
              searchFailure.response?.data?.error?.message ||
                searchFailure.message ||
                'Could not search for people.',
            );
          }
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [search]);

  const handleFriendAction = async (person) => {
    const relationship = person.relationship;
    setActingOnUserId(person.id);
    try {
      if (relationship?.status === 'pending' && relationship.direction === 'incoming') {
        await acceptFriendRequest(relationship.requestId);
        setRequests((current) => ({
          ...current,
          incoming: current.incoming.filter((request) => request.id !== relationship.requestId),
        }));
        setSearchResults((current) =>
          current.map((result) =>
            result.id === person.id
              ? { ...result, relationship: { ...relationship, status: 'accepted' } }
              : result,
          ),
        );
        setFriends((current) => [person, ...current.filter((friend) => friend.id !== person.id)]);
        setPage(1);
        window.dispatchEvent(new Event('nexora:friend-requests-updated'));
        notifyApp(`You are now friends with ${person.name}.`, 'success');
      } else {
        await sendFriendRequest(person.id);
        setSearchResults((current) =>
          current.map((result) =>
            result.id === person.id
              ? {
                  ...result,
                  relationship: { status: 'pending', direction: 'outgoing' },
                }
              : result,
          ),
        );
        notifyApp(`Friend request sent to ${person.name}.`, 'success');
      }
    } catch (actionError) {
      notifyApp(
        actionError.response?.data?.error?.message ||
          actionError.message ||
          'Could not update friend request.',
        'error',
      );
    } finally {
      setActingOnUserId('');
    }
  };

  const handleIncomingRequest = async (request, accept) => {
    setActingOnUserId(request.user.id);
    try {
      if (accept) {
        await acceptFriendRequest(request.id);
        setFriends((current) => [request.user, ...current.filter((friend) => friend.id !== request.user.id)]);
        setPage(1);
      } else {
        await rejectFriendRequest(request.id);
      }
      setRequests((current) => ({
        ...current,
        incoming: current.incoming.filter((entry) => entry.id !== request.id),
      }));
      window.dispatchEvent(new Event('nexora:friend-requests-updated'));
      notifyApp(
        accept ? `You are now friends with ${request.user.name}.` : 'Friend request declined.',
        'success',
      );
    } catch (actionError) {
      notifyApp(
        actionError.response?.data?.error?.message ||
          actionError.message ||
          'Could not update friend request.',
        'error',
      );
    } finally {
      setActingOnUserId('');
    }
  };

  const handleCancelRequest = async (request) => {
    setActingOnUserId(request.user.id);
    try {
      await cancelFriendRequest(request.id);
      setRequests((current) => ({
        ...current,
        outgoing: current.outgoing.filter((entry) => entry.id !== request.id),
      }));
      window.dispatchEvent(new Event('nexora:friend-requests-updated'));
      notifyApp(`Friend request to ${request.user.name} cancelled.`, 'success');
    } catch (actionError) {
      notifyApp(
        actionError.response?.data?.error?.message ||
          actionError.message ||
          'Could not cancel friend request.',
        'error',
      );
    } finally {
      setActingOnUserId('');
    }
  };

  const handleFriendRemoval = async (friend, block) => {
    const action = block ? 'block' : 'remove';
    const prompt = block
      ? `Block ${friend.name}? They will be removed from your friends.`
      : `Remove ${friend.name} from your friends?`;
    if (!window.confirm(prompt)) return;
    setActingOnUserId(friend.id);
    try {
      if (block) {
        await blockFriend(friend.id);
        setBlockedUsers((current) => [
          { id: friend.id, name: friend.name, username: friend.username, avatar: friend.avatar },
          ...current.filter((user) => user.id !== friend.id),
        ]);
      } else {
        await removeFriend(friend.id);
      }
      setFriends((current) => current.filter((entry) => entry.id !== friend.id));
      window.dispatchEvent(new Event('nexora:friend-requests-updated'));
      notifyApp(
        block ? `${friend.name} has been blocked.` : `${friend.name} was removed from your friends.`,
        'success',
      );
    } catch (actionError) {
      notifyApp(
        actionError.response?.data?.error?.message ||
          actionError.message ||
          `Could not ${action} this friend.`,
        'error',
      );
    } finally {
      setActingOnUserId('');
    }
  };

  const handleUnblock = async (person) => {
    setActingOnUserId(person.id);
    try {
      await unblockFriend(person.id);
      setBlockedUsers((current) => current.filter((user) => user.id !== person.id));
      notifyApp(`${person.name} has been unblocked.`, 'success');
    } catch (actionError) {
      notifyApp(
        actionError.response?.data?.error?.message ||
          actionError.message ||
          'Could not unblock this person.',
        'error',
      );
    } finally {
      setActingOnUserId('');
    }
  };

  const handleMessage = async (friend) => {
    setActingOnUserId(friend.id);
    try {
      const conversation = await createDirectConversation(friend.id);
      navigate(`/chat/${conversation.id}`);
    } catch (actionError) {
      notifyApp(
        actionError.response?.data?.error?.message ||
          actionError.message ||
          'Could not open this conversation.',
        'error',
      );
    } finally {
      setActingOnUserId('');
    }
  };

  const pageCount = Math.ceil(friends.length / FRIENDS_PER_PAGE);
  const currentPage = Math.min(page, Math.max(pageCount, 1));
  const visibleFriends = friends.slice(
    (currentPage - 1) * FRIENDS_PER_PAGE,
    currentPage * FRIENDS_PER_PAGE,
  );
  const firstVisibleFriend = friends.length ? (currentPage - 1) * FRIENDS_PER_PAGE + 1 : 0;
  const lastVisibleFriend = Math.min(currentPage * FRIENDS_PER_PAGE, friends.length);
  const normalizedSearch = search.trim().replace(/^@/, '');
  const validSearch = /^[a-z0-9_]{3,20}$/i.test(normalizedSearch);

  return (
    <section className="mx-auto max-w-6xl">
      <Link
        to="/profile"
        className="inline-flex items-center gap-2 text-sm font-medium text-text-muted transition hover:text-brand-primary-text"
      >
        <ArrowLeft size={16} />
        Back to profile
      </Link>

      <div className="mt-5 rounded-3xl border border-border bg-bg p-5 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-primary-text">
              Your people
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-heading">Friends</h1>
            {!loading && !error && (
              <p className="mt-2 text-sm text-text-muted">
                {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
              </p>
            )}
          </div>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-primary-soft text-brand-primary-text">
            <Users size={22} />
          </span>
        </div>

        <section className="mt-6 rounded-2xl border border-border bg-bg-subtle p-4 sm:p-5">
          <div className="mb-3">
            <h2 className="font-semibold text-heading">Find people</h2>
            <p className="mt-1 text-sm text-text-muted">
              Search by username to send or accept a friend request.
            </p>
          </div>
          <label htmlFor="friend-search" className="sr-only">
            Search by username
          </label>
          <div className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              id="friend-search"
              type="text"
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
              placeholder="Enter a username"
              autoComplete="off"
              className="w-full rounded-xl border border-border bg-bg py-3 pl-10 pr-11 text-sm text-text outline-none transition placeholder:text-text-muted focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10"
            />
            {search && (
              <button
                type="button"
                onClick={() => updateSearch('')}
                aria-label="Clear username search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-text-muted hover:bg-bg-subtle hover:text-heading"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-text-muted">
            Search with at least 3 characters. Enter the exact username; you can include @.
          </p>

          {validSearch && (
            <div className="mt-4 border-t border-border pt-4">
              <h3 className="mb-2 text-sm font-semibold text-heading">Search results</h3>
              {searchError ? (
                <p role="alert" className="rounded-xl bg-error/10 px-3 py-2 text-sm text-error">
                  {searchError}
                </p>
              ) : searching ? (
                <p className="py-4 text-sm text-text-muted">Searching…</p>
              ) : searchResults.length ? (
                <div className="divide-y divide-border">
                  {searchResults.map((person) => {
                    const relationship = person.relationship;
                    const cooldownActive =
                      relationship?.cooldownUntil &&
                      new Date(relationship.cooldownUntil) > new Date();
                    const isActing = actingOnUserId === person.id;

                    return (
                      <div
                        key={person.id}
                        className="flex items-center gap-3 py-3 first:pt-1 last:pb-1"
                      >
                        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-primary-soft text-sm font-semibold text-brand-primary-text">
                          {person.avatar ? (
                            <img
                              src={person.avatar}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            person.name?.slice(0, 1).toUpperCase() || '?'
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-heading">
                          {person.name}
                          <span className="block truncate text-xs font-normal text-text-muted">
                            @{person.username}
                          </span>
                        </span>
                        {relationship?.status === 'accepted' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                            <Check size={15} />
                            Friends
                          </span>
                        ) : relationship?.status === 'pending' &&
                          relationship.direction === 'outgoing' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                            <Clock3 size={15} />
                            Request sent
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isActing || Boolean(cooldownActive)}
                            onClick={() => void handleFriendAction(person)}
                            title={
                              cooldownActive
                                ? 'Friend requests are temporarily limited'
                                : relationship?.status === 'pending'
                                  ? `Accept ${person.name}'s request`
                                  : `Add ${person.name} as a friend`
                            }
                            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-3 py-2 text-xs font-semibold text-on-primary transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {relationship?.status === 'pending' ? (
                              <Check size={15} />
                            ) : (
                              <UserRoundPlus size={15} />
                            )}
                            {isActing
                              ? 'Saving…'
                              : relationship?.status === 'pending'
                                ? 'Accept'
                                : 'Add friend'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-3 text-sm text-text-muted">
                  No available person found with that username.
                </p>
              )}
            </div>
          )}
        </section>

        {error && (
          <p role="alert" className="mt-6 rounded-xl bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </p>
        )}

        <nav
          className="mt-6 flex gap-2 overflow-x-auto border-b border-border"
          role="tablist"
          aria-label="Friends sections"
        >
          {[
            { id: 'friends', label: `Friends (${friends.length})` },
            { id: 'requests', label: `Requests (${requests.incoming.length + requests.outgoing.length})` },
            { id: 'blocked', label: `Blocked (${blockedUsers.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() =>
                setSearchParams(tab.id === 'friends' ? {} : { tab: tab.id }, { replace: true })
              }
              className={`shrink-0 border-b-2 px-3 py-3 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? 'border-brand-primary text-brand-primary-text'
                  : 'border-transparent text-text-muted hover:text-heading'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {loading ? (
          <p className="py-16 text-center text-sm text-text-muted">Loading friends…</p>
        ) : error ? null : activeTab === 'friends' ? (
          friends.length ? (
            <>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {visibleFriends.map((friend) => {
                  const isActing = actingOnUserId === friend.id;
                  return (
                    <article
                      key={friend.id}
                      className="overflow-hidden rounded-2xl border border-border bg-bg-subtle transition hover:-translate-y-0.5 hover:border-brand-primary/40 hover:shadow-md"
                    >
                      <Link
                        to={profilePath(friend)}
                        className="group block"
                        title={`View ${friend.name}'s profile`}
                      >
                        <div className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-brand-primary-soft text-4xl font-semibold text-brand-primary-text">
                          {friend.avatar ? (
                            <img src={friend.avatar} alt="" className="h-full w-full object-cover" />
                          ) : (
                            friend.name?.slice(0, 1).toUpperCase() || '?'
                          )}
                          {friend.isOnline && (
                            <span className="absolute bottom-3 right-3 h-3.5 w-3.5 rounded-full border-2 border-bg bg-success" />
                          )}
                        </div>
                        <div className="p-4 pb-2">
                          <h2 className="truncate font-semibold text-heading group-hover:text-brand-primary-text">
                            {friend.name}
                          </h2>
                          <p className="mt-1 truncate text-sm text-text-muted">
                            {friend.username ? `@${friend.username}` : `@${friend.profileSlug}`}
                          </p>
                        </div>
                      </Link>
                      <div className="flex flex-wrap gap-2 px-4 pb-4">
                        <button
                          type="button"
                          disabled={isActing}
                          onClick={() => void handleMessage(friend)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-2 text-xs font-semibold text-on-primary transition hover:bg-brand-primary-hover disabled:opacity-50"
                        >
                          <MessageCircle size={14} />
                          Message
                        </button>
                        <button
                          type="button"
                          disabled={isActing}
                          onClick={() => void handleFriendRemoval(friend, false)}
                          className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-muted transition hover:bg-bg hover:text-heading disabled:opacity-50"
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          disabled={isActing}
                          onClick={() => void handleFriendRemoval(friend, true)}
                          aria-label={`Block ${friend.name}`}
                          title={`Block ${friend.name}`}
                          className="grid place-items-center rounded-lg border border-border px-2.5 py-2 text-text-muted transition hover:bg-bg hover:text-error disabled:opacity-50"
                        >
                          <Shield size={15} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {pageCount > 1 && (
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                  <p className="text-sm text-text-muted">
                    Showing {firstVisibleFriend}–{lastVisibleFriend} of {friends.length}
                  </p>
                  <nav className="flex items-center gap-2" aria-label="Friends pagination">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => setPage((current) => current - 1)}
                      className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm font-medium text-heading transition hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ChevronLeft size={16} />
                      Previous
                    </button>
                    <span className="px-2 text-sm text-text-muted">
                      Page {currentPage} of {pageCount}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage === pageCount}
                      onClick={() => setPage((current) => current + 1)}
                      className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm font-medium text-heading transition hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                      <ChevronRight size={16} />
                    </button>
                  </nav>
                </div>
              )}
            </>
          ) : (
            <div className="mt-6 rounded-2xl bg-bg-subtle px-4 py-12 text-center">
              <Users size={28} className="mx-auto text-text-muted" />
              <p className="mt-3 font-medium text-heading">You haven’t added any friends yet.</p>
              <p className="mt-1 text-sm text-text-muted">
                Search for someone by username above to send a friend request.
              </p>
            </div>
          )
        ) : activeTab === 'requests' ? (
          <div className="mt-6 space-y-6">
            <section>
              <h2 className="mb-3 text-lg font-semibold text-heading">
                Incoming ({requests.incoming.length})
              </h2>
              {requests.incoming.length ? (
                <div className="divide-y divide-border rounded-2xl border border-border bg-bg-subtle px-4">
                  {requests.incoming.map((request) => {
                    const isActing = actingOnUserId === request.user.id;
                    return (
                      <div key={request.id} className="flex flex-wrap items-center gap-3 py-4">
                        <Link to={profilePath(request.user)} className="flex min-w-0 flex-1 items-center gap-3">
                          <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-primary-soft text-sm font-semibold text-brand-primary-text">
                            {request.user.avatar ? (
                              <img src={request.user.avatar} alt="" className="h-full w-full object-cover" />
                            ) : (
                              request.user.name?.slice(0, 1).toUpperCase() || '?'
                            )}
                          </span>
                          <span className="min-w-0 truncate text-sm font-semibold text-heading">
                            {request.user.name}
                            <span className="block truncate text-xs font-normal text-text-muted">
                              @{request.user.username || request.user.profileSlug}
                            </span>
                          </span>
                        </Link>
                        <button
                          type="button"
                          disabled={isActing}
                          onClick={() => void handleIncomingRequest(request, true)}
                          className="rounded-lg bg-brand-primary px-3 py-2 text-xs font-semibold text-on-primary transition hover:bg-brand-primary-hover disabled:opacity-50"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={isActing}
                          onClick={() => void handleIncomingRequest(request, false)}
                          className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-muted transition hover:bg-bg hover:text-heading disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl bg-bg-subtle px-4 py-5 text-sm text-text-muted">
                  No incoming friend requests.
                </p>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-heading">
                Sent ({requests.outgoing.length})
              </h2>
              {requests.outgoing.length ? (
                <div className="divide-y divide-border rounded-2xl border border-border bg-bg-subtle px-4">
                  {requests.outgoing.map((request) => (
                    <div key={request.id} className="flex items-center gap-3 py-4">
                      <Link to={profilePath(request.user)} className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-primary-soft text-sm font-semibold text-brand-primary-text">
                          {request.user.avatar ? (
                            <img src={request.user.avatar} alt="" className="h-full w-full object-cover" />
                          ) : (
                            request.user.name?.slice(0, 1).toUpperCase() || '?'
                          )}
                        </span>
                        <span className="min-w-0 truncate text-sm font-semibold text-heading">
                          {request.user.name}
                          <span className="block truncate text-xs font-normal text-text-muted">
                            @{request.user.username || request.user.profileSlug}
                          </span>
                        </span>
                      </Link>
                      <button
                        type="button"
                        disabled={actingOnUserId === request.user.id}
                        onClick={() => void handleCancelRequest(request)}
                        className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-muted transition hover:bg-bg hover:text-heading disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl bg-bg-subtle px-4 py-5 text-sm text-text-muted">
                  No outgoing friend requests.
                </p>
              )}
            </section>
          </div>
        ) : blockedUsers.length ? (
          <div className="mt-6 divide-y divide-border rounded-2xl border border-border bg-bg-subtle px-4">
            {blockedUsers.map((person) => (
              <div key={person.id} className="flex items-center gap-3 py-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-primary-soft text-sm font-semibold text-brand-primary-text">
                  {person.avatar ? (
                    <img src={person.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    person.name?.slice(0, 1).toUpperCase() || '?'
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-heading">
                  {person.name}
                  <span className="block truncate text-xs font-normal text-text-muted">
                    {person.username ? `@${person.username}` : 'Blocked user'}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={actingOnUserId === person.id}
                  onClick={() => void handleUnblock(person)}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-muted transition hover:bg-bg hover:text-heading disabled:opacity-50"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-6 rounded-xl bg-bg-subtle px-4 py-8 text-center text-sm text-text-muted">
            You haven’t blocked anyone.
          </p>
        )}
      </div>
    </section>
  );
}

export default FriendsPage;
