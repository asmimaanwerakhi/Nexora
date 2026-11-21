import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Pin,
  Plus,
  Search,
  SlidersHorizontal,
  UserRound,
  Users,
  Video,
  X,
} from 'lucide-react';
import { format, formatDistanceToNow, isSameDay } from 'date-fns';
import ChatComposer from '../features/chat/ChatComposer.jsx';
import MessageBubble from '../features/chat/MessageBubble.jsx';
import CreateGroupDialog from '../components/CreateGroupDialog.jsx';
import GroupInfoDialog from '../components/GroupInfoDialog.jsx';
import {
  deleteMessage,
  getConversations,
  getFriends,
  getMessages,
  getPinnedMessages,
  getStarredMessages,
  sendMessageFile,
  editMessage,
  forwardMessage,
  pinMessage,
  unpinMessage,
  reactToMessage,
  reportUser,
  searchMessages,
  toggleStarMessage,
} from '../services/chatApi.js';
import { emitChatEvent, createChatSocket } from '../services/chatSocket.js';
import { apiClient, getAccessToken } from '../services/apiClient.js';
import { useAuthStore } from '../stores/authStore.js';

const makeClientMessageId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `message_${Date.now()}_${Math.random().toString(36).slice(2)}`;

const sortMessages = (messages) =>
  [...messages].sort((first, second) => new Date(first.createdAt) - new Date(second.createdAt));

function ChatPage() {
  const { conversationId: routeConversationId } = useParams();
  const user = useAuthStore((state) => state.user);
  const [conversations, setConversations] = useState([]);
  const [friends, setFriends] = useState([]);
  const [search, setSearch] = useState('');
  const [conversationFilter, setConversationFilter] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(routeConversationId || '');
  const [messages, setMessages] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(Boolean(routeConversationId));
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [error, setError] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [starredIds, setStarredIds] = useState(new Set());
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [messageSearchResults, setMessageSearchResults] = useState([]);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [actionNotice, setActionNotice] = useState('');
  const scrollRef = useRef(null);
  const socketRef = useRef(null);
  const selectedIdRef = useRef(selectedId);
  const retryActionsRef = useRef(new Map());
  const previewUrlsRef = useRef(new Map());
  const loadingOlderRef = useRef(false);
  const stickToBottomRef = useRef(true);
  const typingTimersRef = useRef(new Map());

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId),
    [conversations, selectedId],
  );
  const activeConversationRef = useRef(activeConversation);

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);
  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (conversationFilter === 'direct' && conversation.type !== 'direct') return false;
      if (conversationFilter === 'groups' && conversation.type !== 'group') return false;
      if (unreadOnly && !conversation.unreadCount) return false;
      if (!query) return true;
      return (
        conversation.participant.name.toLowerCase().includes(query) ||
        conversation.participant.username?.toLowerCase().includes(query) ||
        conversation.lastMessage?.preview?.toLowerCase().includes(query)
      );
    });
  }, [conversationFilter, conversations, search, unreadOnly]);
  const directConversationCount = conversations.filter(
    (conversation) => conversation.type === 'direct',
  ).length;
  const groupConversationCount = conversations.filter(
    (conversation) => conversation.type === 'group',
  ).length;
  const refreshLists = useCallback(async () => {
    setConversations(await getConversations());
  }, []);

  useEffect(() => {
    if (!createGroupOpen && !groupInfoOpen) return undefined;
    let active = true;
    getFriends()
      .then((friendList) => {
        if (active) setFriends(friendList);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.error?.message || requestError.message);
      });
    return () => {
      active = false;
    };
  }, [createGroupOpen, groupInfoOpen]);

  const handlePresence = ({ userId, online, lastSeen }) => {
    const updatePresence = (person) =>
      person.id === userId ? { ...person, isOnline: online, lastSeen } : person;
    setConversations((current) =>
      current.map((conversation) => ({
        ...conversation,
        participant: updatePresence(conversation.participant),
      })),
    );
  };

  const startTyping = useCallback(() => {
    const socket = socketRef.current;
    const conversationId = selectedIdRef.current;
    if (socket?.connected && conversationId) {
      socket.emit('typing:start', { conversationId });
    }
  }, []);

  const stopTyping = useCallback(() => {
    const socket = socketRef.current;
    const conversationId = selectedIdRef.current;
    if (socket?.connected && conversationId) {
      socket.emit('typing:stop', { conversationId });
    }
  }, []);

  useEffect(() => {
    let active = true;
    getConversations()
      .then((conversationList) => {
        if (!active) return;
        setConversations(conversationList);
        if (routeConversationId) {
          setMessages([]);
          setLoadingMessages(true);
          stickToBottomRef.current = true;
          setSelectedId(routeConversationId);
        } else {
          if (selectedIdRef.current && socketRef.current?.connected) {
            socketRef.current.emit('chat:leave', {
              conversationId: selectedIdRef.current,
            });
          }
          selectedIdRef.current = '';
          setSelectedId('');
          setMessages([]);
          setPinnedMessages([]);
          setHasMore(false);
          setNextCursor(null);
          setTypingUsers([]);
          setLoadingMessages(false);
          setSidebarVisible(true);
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.error?.message || requestError.message);
      })
      .finally(() => {
        if (active) setLoadingList(false);
      });
    return () => {
      active = false;
    };
  }, [refreshLists, routeConversationId]);

  useEffect(() => {
    const typingTimers = typingTimersRef.current;
    let socket;
    try {
      socket = createChatSocket();
      socketRef.current = socket;
    } catch (socketError) {
      setTimeout(() => setError(socketError.message), 0);
      return undefined;
    }

    const refresh = () => {
      void refreshLists().catch((requestError) => setError(requestError.message));
    };

    const handleConnect = () => {
      setSocketConnected(true);
      const activeId = selectedIdRef.current;
      if (activeId) {
        void emitChatEvent(socket, 'chat:join', { conversationId: activeId })
          .then(() => emitChatEvent(socket, 'message:seen', { conversationId: activeId }))
          .catch((socketError) => setError(socketError.message));
      }
    };
    const handleDisconnect = () => setSocketConnected(false);
    const handleNewMessage = (message) => {
      if (message.conversationId === selectedIdRef.current) {
        setMessages((current) => upsertMessage(current, message));
      }
      refresh();
    };
    const updateReceiptForGroupMessages = (conversationId, userId, at, readAt) => {
      if (conversationId !== selectedIdRef.current) return;
      const readTime = at || new Date().toISOString();
      setMessages((current) =>
        current.map((message) => {
          if (
            !isOwnMessage(message, user.id) ||
            new Date(message.createdAt).getTime() > new Date(readTime).getTime()
          ) {
            return message;
          }
          const receipts = [...(message.receipts || [])];
          const receiptIndex = receipts.findIndex((item) => item.userId?.toString() === userId);
          if (receiptIndex >= 0) {
            const receipt = receipts[receiptIndex];
            receipts[receiptIndex] = {
              ...receipt,
              deliveredAt: receipt.deliveredAt || readTime,
              readAt: readAt ? readTime : receipt.readAt,
            };
          } else {
            receipts.push({ userId, deliveredAt: readTime, readAt: readAt ? readTime : null });
          }
          return {
            ...message,
            receipts,
            status: readAt ? 'seen' : message.status === 'seen' ? 'seen' : 'delivered',
          };
        }),
      );
    };
    const handleDelivery = ({ conversationId, userId, count, at }) => {
      if (!count || userId === user.id || conversationId !== selectedIdRef.current) return;
      if (activeConversationRef.current?.type === 'group') {
        updateReceiptForGroupMessages(conversationId, userId, at, false);
        return;
      }
      setMessages((current) =>
        current.map((message) =>
          isOwnMessage(message, user.id) && message.status !== 'seen'
            ? { ...message, status: 'delivered' }
            : message,
        ),
      );
    };
    const handleSeen = ({ conversationId, userId, count, at }) => {
      if (!count || userId === user.id || conversationId !== selectedIdRef.current) return;
      if (activeConversationRef.current?.type === 'group') {
        updateReceiptForGroupMessages(conversationId, userId, at, true);
        return;
      }
      setMessages((current) =>
        current.map((message) =>
          isOwnMessage(message, user.id) ? { ...message, status: 'seen' } : message,
        ),
      );
    };
    const handleDeleted = (message) => {
      if (message.conversationId !== selectedIdRef.current) return;
      if (message.scope === 'me' && message.deletedBy !== user.id) return;
      setMessages((current) => {
        if (message.scope === 'me') {
          return current.filter((item) => item._id !== message._id);
        }
        return upsertMessage(current, message);
      });
    };
    const handleMessageChanged = (message) => {
      if (message.conversationId !== selectedIdRef.current) return;
      setMessages((current) => upsertMessage(current, { ...message, currentUserId: user.id }));
    };
    const handlePinsUpdated = ({ conversationId, messages: pins }) => {
      if (conversationId === selectedIdRef.current) setPinnedMessages(pins);
    };
    const handleTypingStart = ({ conversationId, userId, name }) => {
      if (conversationId !== selectedIdRef.current || userId === user.id) return;
      const previousTimer = typingTimersRef.current.get(userId);
      if (previousTimer) clearTimeout(previousTimer);
      setTypingUsers((current) => [
        ...current.filter((item) => item.userId !== userId),
        { userId, name },
      ]);
      typingTimersRef.current.set(
        userId,
        window.setTimeout(() => {
          setTypingUsers((current) => current.filter((item) => item.userId !== userId));
          typingTimersRef.current.delete(userId);
        }, 5000),
      );
    };
    const handleTypingStop = ({ conversationId, userId }) => {
      if (conversationId !== selectedIdRef.current) return;
      const timer = typingTimersRef.current.get(userId);
      if (timer) clearTimeout(timer);
      typingTimersRef.current.delete(userId);
      setTypingUsers((current) => current.filter((item) => item.userId !== userId));
    };
    const handleGroupRemoved = ({ conversationId }) => {
      if (conversationId !== selectedIdRef.current) return;
      selectedIdRef.current = '';
      setSelectedId('');
      setMessages([]);
      setGroupInfoOpen(false);
      setSidebarVisible(true);
      setError('You are no longer a member of this group.');
      refresh();
    };
    const refreshSocketAuth = () => {
      socket.auth = { token: getAccessToken() };
      socket.disconnect();
      socket.connect();
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('message:new', handleNewMessage);
    socket.on('conversation:updated', refresh);
    socket.on('message:delivered', handleDelivery);
    socket.on('message:seen', handleSeen);
    socket.on('message:deleted', handleDeleted);
    socket.on('message:edited', handleMessageChanged);
    socket.on('message:reaction', handleMessageChanged);
    socket.on('conversation:pins-updated', handlePinsUpdated);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('group:removed', handleGroupRemoved);
    socket.on('presence:update', handlePresence);
    socket.on('friend:accepted', refresh);
    socket.on('friend:removed', refresh);
    window.addEventListener('nexora:auth-refreshed', refreshSocketAuth);

    return () => {
      window.removeEventListener('nexora:auth-refreshed', refreshSocketAuth);
      for (const timer of typingTimers.values()) clearTimeout(timer);
      typingTimers.clear();
      if (selectedIdRef.current) {
        socket.emit('chat:leave', { conversationId: selectedIdRef.current });
      }
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [refreshLists, user.id]);

  useEffect(() => {
    if (!selectedId) return undefined;
    let active = true;
    Promise.all([getMessages(selectedId), getPinnedMessages(selectedId), getStarredMessages()])
      .then(([result, pins, starred]) => {
        if (!active) return;
        setMessages(result.messages.map((message) => ({ ...message, currentUserId: user.id })));
        setPinnedMessages(pins);
        setStarredIds(new Set(starred.map((message) => message._id)));
        setHasMore(result.hasMore);
        setNextCursor(result.nextCursor);
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        });
        const socket = socketRef.current;
        if (socket?.connected) {
          void emitChatEvent(socket, 'chat:join', { conversationId: selectedId })
            .then(() => emitChatEvent(socket, 'message:seen', { conversationId: selectedId }))
            .then(() => {
              setConversations((current) =>
                current.map((item) =>
                  item.id === selectedId ? { ...item, unreadCount: 0 } : item,
                ),
              );
            })
            .catch((socketError) => setError(socketError.message));
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.error?.message || requestError.message);
      })
      .finally(() => {
        if (active) setLoadingMessages(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId, user.id]);

  useEffect(
    () => () => {
      for (const url of previewUrlsRef.current.values()) URL.revokeObjectURL(url);
    },
    [],
  );

  useEffect(() => {
    if (!stickToBottomRef.current) return undefined;
    const frame = requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages]);

  const selectConversation = (conversationId) => {
    stopTyping();
    if (selectedIdRef.current && socketRef.current?.connected) {
      socketRef.current.emit('chat:leave', { conversationId: selectedIdRef.current });
    }
    setMessages([]);
    setLoadingMessages(true);
    stickToBottomRef.current = true;
    setTypingUsers([]);
    setSelectedId(conversationId);
    setSidebarVisible(false);
  };

  const handleLeftGroup = async () => {
    setGroupInfoOpen(false);
    selectedIdRef.current = '';
    setSelectedId('');
    setMessages([]);
    setSidebarVisible(true);
    await refreshLists();
  };

  const addMessage = (message) => {
    if (message.conversationId !== selectedIdRef.current) return;
    setMessages((current) => upsertMessage(current, { ...message, currentUserId: user.id }));
  };

  const sendText = async (
    text,
    clientMessageId = makeClientMessageId(),
    isRetry = false,
    targetConversationId = selectedId,
    replyMessageId = replyTo?.id || replyTo?._id,
  ) => {
    if (!targetConversationId) return;
    if (!isRetry) {
      addMessage({
        _id: clientMessageId,
        clientMessageId,
        conversationId: targetConversationId,
        sender: { id: user.id, name: user.name, avatar: user.avatar },
        text,
        type: 'text',
        status: 'sent',
        createdAt: new Date().toISOString(),
      });
    } else {
      setMessages((current) =>
        current.map((message) =>
          message.clientMessageId === clientMessageId ? { ...message, failed: false } : message,
        ),
      );
    }
    retryActionsRef.current.set(clientMessageId, () =>
      sendText(text, clientMessageId, true, targetConversationId, replyMessageId),
    );
    setError('');
    try {
      let message;
      if (socketRef.current?.connected) {
        const result = await emitChatEvent(socketRef.current, 'message:send', {
          conversationId: targetConversationId,
          text,
          replyTo: replyMessageId,
          clientMessageId,
        });
        message = result.message;
      } else {
        const response = await apiClient.post('/messages', {
          conversationId: targetConversationId,
          text,
          replyTo: replyMessageId,
          clientMessageId,
        });
        message = response.data.data.message;
      }
      addMessage(message);
      retryActionsRef.current.delete(clientMessageId);
      await refreshLists();
    } catch (requestError) {
      if (selectedIdRef.current === targetConversationId) {
        setMessages((current) =>
          current.map((message) =>
            message.clientMessageId === clientMessageId ? { ...message, failed: true } : message,
          ),
        );
        setError(requestError.response?.data?.error?.message || requestError.message);
      }
    }
  };

  const sendFile = async (
    file,
    caption = '',
    clientMessageId = makeClientMessageId(),
    isRetry = false,
    targetConversationId = selectedId,
    replyMessageId = replyTo?.id || replyTo?._id,
  ) => {
    if (!targetConversationId) return;
    if (!isRetry) {
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.set(clientMessageId, previewUrl);
      addMessage({
        _id: clientMessageId,
        clientMessageId,
        conversationId: targetConversationId,
        sender: { id: user.id, name: user.name, avatar: user.avatar },
        text: caption,
        type: file.type.startsWith('image/')
          ? 'image'
          : file.type.startsWith('video/')
            ? 'video'
            : file.type.startsWith('audio/')
              ? 'voice'
              : 'file',
        media: {
          url: previewUrl,
          mimeType: file.type,
          originalName: file.name,
          sizeBytes: file.size,
        },
        status: 'sent',
        createdAt: new Date().toISOString(),
      });
    } else {
      setMessages((current) =>
        current.map((message) =>
          message.clientMessageId === clientMessageId ? { ...message, failed: false } : message,
        ),
      );
    }
    retryActionsRef.current.set(clientMessageId, () =>
      sendFile(file, caption, clientMessageId, true, targetConversationId, replyMessageId),
    );
    setError('');
    try {
      const message = await sendMessageFile(targetConversationId, file, {
        text: caption,
        replyTo: replyMessageId,
        clientMessageId,
      });
      const previewUrl = previewUrlsRef.current.get(clientMessageId);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrlsRef.current.delete(clientMessageId);
      addMessage(message);
      retryActionsRef.current.delete(clientMessageId);
      await refreshLists();
    } catch (requestError) {
      if (selectedIdRef.current === targetConversationId) {
        setMessages((current) =>
          current.map((message) =>
            message.clientMessageId === clientMessageId ? { ...message, failed: true } : message,
          ),
        );
        setError(requestError.response?.data?.error?.message || requestError.message);
      }
    }
  };

  const handleEdit = async (message) => {
    const text = window.prompt('Edit message', message.text);
    if (text === null || !text.trim() || text.trim() === message.text) return;
    try {
      const updated = await editMessage(message._id, text.trim());
      addMessage({ ...updated, currentUserId: user.id });
      await refreshLists();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    }
  };

  const handleReaction = async (message, emoji) => {
    try {
      const updated = await reactToMessage(message._id, emoji);
      addMessage({ ...updated, currentUserId: user.id });
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    }
  };

  const handlePin = async (message) => {
    try {
      const isPinned = pinnedMessages.some((pin) => pin._id === message._id);
      const pins = isPinned
        ? await unpinMessage(selectedId, message._id)
        : await pinMessage(selectedId, message._id);
      setPinnedMessages(pins);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    }
  };

  const handleStar = async (message) => {
    try {
      const starred = await toggleStarMessage(message._id);
      setStarredIds((current) => {
        const next = new Set(current);
        if (starred) next.add(message._id);
        else next.delete(message._id);
        return next;
      });
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    }
  };

  const handleReport = async (message) => {
    const details = window.prompt('Tell us why you are reporting this message (optional).');
    if (details === null) return;
    try {
      await reportUser({
        reportedUserId: message.sender.id || message.sender._id,
        messageId: message._id,
        reason: 'other',
        details,
      });
      setActionNotice('Report submitted for review.');
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    }
  };

  const handleForward = async (conversationId) => {
    if (!forwardingMessage) return;
    try {
      const forwarded = await forwardMessage(forwardingMessage._id, conversationId);
      if (conversationId === selectedId) addMessage({ ...forwarded, currentUserId: user.id });
      setForwardingMessage(null);
      setActionNotice('Message forwarded.');
      await refreshLists();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    }
  };

  const runMessageSearch = async (event) => {
    event.preventDefault();
    if (!selectedId || messageSearchQuery.trim().length < 2) return;
    try {
      setMessageSearchResults(await searchMessages(selectedId, messageSearchQuery.trim()));
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    }
  };

  const openSearchResult = (message) => {
    setMessages((current) =>
      sortMessages([
        ...current.filter((item) => item._id !== message._id),
        { ...message, currentUserId: user.id },
      ]),
    );
    requestAnimationFrame(() =>
      document.getElementById(`message-${message._id}`)?.scrollIntoView({ behavior: 'smooth' }),
    );
  };

  const loadOlderMessages = async () => {
    if (!selectedId || !hasMore || !nextCursor || loadingOlderRef.current) return;
    const scroller = scrollRef.current;
    const oldHeight = scroller?.scrollHeight || 0;
    loadingOlderRef.current = true;
    try {
      const result = await getMessages(selectedId, nextCursor);
      setMessages((current) => {
        const combined = [...result.messages, ...current];
        return sortMessages(
          combined.filter(
            (message, index) =>
              combined.findIndex((candidate) => candidate._id === message._id) === index,
          ),
        ).map((message) => ({ ...message, currentUserId: user.id }));
      });
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          if (scroller) scroller.scrollTop = scroller.scrollHeight - oldHeight;
          resolve();
        });
      });
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    } finally {
      loadingOlderRef.current = false;
    }
  };

  const handleDelete = async (message, own) => {
    const scope =
      own &&
      window.confirm('Delete this message for everyone? Choose Cancel to delete it only for you.')
        ? 'all'
        : 'me';
    try {
      const deleted = await deleteMessage(message._id, scope);
      if (scope === 'me') {
        setMessages((current) => current.filter((item) => item._id !== message._id));
      } else {
        addMessage(deleted);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message);
    }
  };

  const handleEnableNotifications = async () => {
    setError('');
    try {
      const { enablePushNotifications: enable } = await import('../services/pushNotifications.js');
      await enable();
      setNotificationsEnabled(true);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <section className="flex h-[calc(100dvh-7.5rem)] min-h-[30rem] w-full overflow-hidden rounded-2xl border border-border bg-bg shadow-sm">
      <aside
        className={`flex w-full min-h-0 shrink-0 flex-col border-r border-border bg-bg sm:w-[18.25rem] ${
          sidebarVisible || !selectedId ? 'flex' : 'hidden sm:flex'
        }`}
      >
        <div className="border-b border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-heading">Chats</h1>
            <div className="flex shrink-0 items-center gap-1">
              <Link
                to="/friends"
                title="Start a new chat"
                aria-label="Start a new chat"
                className="inline-flex items-center gap-1 rounded-xl bg-brand-primary px-2.5 py-2 text-xs font-semibold text-on-primary transition hover:bg-brand-primary-hover"
              >
                <Plus size={15} />
                New Chat
              </Link>
              <button
                type="button"
                onClick={() => setCreateGroupOpen(true)}
                title="Create a group"
                aria-label="Create a group"
                className="grid h-9 w-9 place-items-center rounded-xl bg-bg-subtle text-text-muted transition hover:bg-brand-primary-soft hover:text-brand-primary-text"
              >
                <Users size={17} />
              </button>
              <button
                type="button"
                onClick={handleEnableNotifications}
                title="Enable offline notifications"
                aria-label="Enable offline notifications"
                className="grid h-9 w-9 place-items-center rounded-xl bg-bg-subtle text-text-muted transition hover:bg-brand-primary-soft hover:text-brand-primary-text"
              >
                <Bell size={17} className={notificationsEnabled ? 'text-brand-primary-text' : ''} />
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-bg-subtle px-3 py-2.5 transition focus-within:border-brand-primary focus-within:ring-4 focus-within:ring-brand-primary/10">
              <Search size={17} className="shrink-0 text-text-muted" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none"
                placeholder="Search chats..."
                aria-label="Search chats"
              />
            </label>
            <button
              type="button"
              onClick={() => setUnreadOnly((current) => !current)}
              aria-label={unreadOnly ? 'Show all chats' : 'Show unread chats only'}
              aria-pressed={unreadOnly}
              title={unreadOnly ? 'Show all chats' : 'Filter unread chats'}
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition ${
                unreadOnly
                  ? 'border-brand-primary bg-brand-primary-soft text-brand-primary-text'
                  : 'border-border bg-bg-subtle text-text-muted hover:bg-surface hover:text-heading'
              }`}
            >
              <SlidersHorizontal size={17} />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-1.5" role="tablist" aria-label="Chat filters">
            {[
              { id: 'all', label: 'All', count: conversations.length },
              { id: 'direct', label: 'Direct', count: directConversationCount },
              { id: 'groups', label: 'Groups', count: groupConversationCount },
            ].map((filter) => (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={conversationFilter === filter.id}
                onClick={() => setConversationFilter(filter.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  conversationFilter === filter.id
                    ? 'bg-brand-primary text-on-primary shadow-sm'
                    : 'bg-bg-subtle text-text-muted hover:bg-surface hover:text-heading'
                }`}
              >
                {filter.label} <span className="opacity-75">{filter.count}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-text-muted">
            <span
              className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-success' : 'bg-warning'}`}
            />
            {socketConnected ? 'Live connection' : 'Connecting…'}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loadingList ? (
            <p className="px-3 py-4 text-sm text-text-muted">Loading chats…</p>
          ) : filteredConversations.length ? (
            filteredConversations.map((conversation) => {
              const sentAt = conversation.lastMessage?.sentAt
                ? new Date(conversation.lastMessage.sentAt)
                : null;
              const timestamp = sentAt
                ? isSameDay(sentAt, new Date())
                  ? format(sentAt, 'p')
                  : formatDistanceToNow(sentAt, { addSuffix: false })
                : '';

              return (
                <button
                  type="button"
                  key={conversation.id}
                  onClick={() => selectConversation(conversation.id)}
                  className={`mb-1.5 flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                    selectedId === conversation.id
                      ? 'border-brand-primary/20 bg-brand-primary-soft'
                      : 'border-transparent hover:bg-bg-subtle'
                  }`}
                >
                  <Avatar user={conversation.participant} large />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-heading">
                        {conversation.participant.name}
                      </span>
                      <span className="shrink-0 text-[10px] text-text-muted">{timestamp}</span>
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-text-muted">
                        {conversation.lastMessage?.preview || 'Start a conversation'}
                      </span>
                      {conversation.unreadCount > 0 && (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand-primary px-1.5 text-[10px] font-bold text-on-primary">
                          {conversation.unreadCount}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-8 text-center">
              <MessageCircle size={24} className="mx-auto text-text-muted" />
              <p className="mt-2 text-sm font-medium text-heading">
                {unreadOnly ? 'No unread chats' : 'No conversations found'}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {search ? 'Try another search.' : 'Start a chat with one of your friends.'}
              </p>
            </div>
          )}
        </div>
      </aside>

      <div className={`min-w-0 flex-1 flex-col ${sidebarVisible ? 'hidden sm:flex' : 'flex'}`}>
        {activeConversation ? (
          <>
            <header className="flex items-center gap-3 border-b border-border bg-bg px-3 py-3 sm:px-5">
              <button
                type="button"
                className="rounded-full p-2 text-text-muted hover:bg-surface sm:hidden"
                aria-label="Back to chat list"
                onClick={() => setSidebarVisible(true)}
              >
                <ArrowLeft size={19} />
              </button>
              <Avatar user={activeConversation.participant} large />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-semibold text-heading">
                  {activeConversation.participant.name}
                </h2>
                <p className="text-xs text-text-muted">
                  {typingUsers.length
                    ? `${typingUsers.map((item) => item.name).join(', ')} typing…`
                    : activeConversation.type === 'group'
                      ? `${activeConversation.members.length} members`
                      : activeConversation.participant.isOnline
                        ? 'Online'
                        : activeConversation.participant.lastSeen
                          ? `Last seen ${formatDistanceToNow(new Date(activeConversation.participant.lastSeen), { addSuffix: true })}`
                          : 'Offline'}
                </p>
              </div>
              {activeConversation.type === 'group' ? (
                <button
                  type="button"
                  className="rounded-xl p-2 text-text-muted transition hover:bg-brand-primary-soft hover:text-brand-primary-text"
                  aria-label="Group information and settings"
                  onClick={() => setGroupInfoOpen(true)}
                >
                  <Users size={19} />
                </button>
              ) : (
                activeConversation.canSend && (
                  <>
                    <button
                      type="button"
                      className="rounded-xl p-2 text-text-muted transition hover:bg-brand-primary-soft hover:text-brand-primary-text"
                      aria-label="Start voice call"
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent('nexora:call-invite', {
                            detail: {
                              recipientId: activeConversation.participant.id,
                              recipient: activeConversation.participant,
                              type: 'voice',
                            },
                          }),
                        )
                      }
                    >
                      <Phone size={19} />
                    </button>
                    <button
                      type="button"
                      className="rounded-xl p-2 text-text-muted transition hover:bg-brand-primary-soft hover:text-brand-primary-text"
                      aria-label="Start video call"
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent('nexora:call-invite', {
                            detail: {
                              recipientId: activeConversation.participant.id,
                              recipient: activeConversation.participant,
                              type: 'video',
                            },
                          }),
                        )
                      }
                    >
                      <Video size={19} />
                    </button>
                  </>
                )
              )}
              <button
                type="button"
                className={`rounded-xl p-2 transition ${
                  messageSearchOpen
                    ? 'bg-brand-primary-soft text-brand-primary-text'
                    : 'text-text-muted hover:bg-brand-primary-soft hover:text-brand-primary-text'
                }`}
                aria-label="Search messages in this chat"
                title="Search messages"
                onClick={() => {
                  setMessageSearchOpen((current) => !current);
                  setMessageSearchResults([]);
                }}
              >
                <Search size={19} />
              </button>
              {activeConversation.type !== 'group' && (
                <button
                  type="button"
                  className="rounded-xl p-2 text-text-muted transition hover:bg-brand-primary-soft hover:text-brand-primary-text"
                  aria-label="Conversation options"
                  onClick={() => setError('Conversation details are not available yet.')}
                >
                  <MoreHorizontal size={20} />
                </button>
              )}
            </header>

            {pinnedMessages.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById(`message-${pinnedMessages[0]._id}`)
                    ?.scrollIntoView({ behavior: 'smooth' })
                }
                className="flex items-center gap-2 border-b border-border bg-bg-subtle px-4 py-2 text-left text-sm text-text"
              >
                <Pin size={15} className="shrink-0 text-brand-primary-text" />
                <span className="truncate">
                  Pinned:{' '}
                  {pinnedMessages[0].text || pinnedMessages[0].media?.originalName || 'Attachment'}
                </span>
                {pinnedMessages.length > 1 && (
                  <span className="shrink-0 text-xs text-text-muted">
                    +{pinnedMessages.length - 1}
                  </span>
                )}
              </button>
            )}
            {messageSearchOpen && (
              <form onSubmit={runMessageSearch} className="border-b border-border bg-bg-subtle p-3">
                <div className="flex gap-2">
                  <input
                    value={messageSearchQuery}
                    onChange={(event) => setMessageSearchQuery(event.target.value)}
                    minLength={2}
                    maxLength={100}
                    placeholder="Search in this conversation"
                    className="min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-brand-primary px-3 py-2 text-sm font-semibold text-on-primary"
                  >
                    Search
                  </button>
                </div>
                {messageSearchQuery.trim().length >= 2 && (
                  <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                    {messageSearchResults.length ? (
                      messageSearchResults.map((result) => (
                        <button
                          key={result._id}
                          type="button"
                          onClick={() => openSearchResult(result)}
                          className="block w-full truncate rounded-lg px-3 py-2 text-left text-sm text-text hover:bg-surface"
                        >
                          {result.sender?.name}:{' '}
                          {result.text || result.media?.originalName || 'Attachment'}
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-2 text-xs text-text-muted">
                        Run a search to see matches.
                      </p>
                    )}
                  </div>
                )}
              </form>
            )}
            {actionNotice && (
              <div
                role="status"
                className="border-b border-border bg-success/10 px-4 py-2 text-sm text-success"
              >
                {actionNotice}
                <button
                  type="button"
                  className="ml-3 underline"
                  onClick={() => setActionNotice('')}
                >
                  Dismiss
                </button>
              </div>
            )}
            {error && (
              <div
                role="alert"
                className="border-b border-error/20 bg-error/5 px-4 py-2 text-sm text-error"
              >
                {error}
              </div>
            )}
            {!activeConversation.canSend && (
              <div
                role="status"
                className="border-b border-border bg-bg-subtle px-4 py-2 text-sm text-text-muted"
              >
                {activeConversation.type === 'group'
                  ? 'Only group admins can send messages.'
                  : 'You can view this chat history, but messaging is unavailable because you are no longer friends.'}
              </div>
            )}

            <div
              ref={scrollRef}
              onScroll={(event) => {
                const element = event.currentTarget;
                stickToBottomRef.current =
                  element.scrollHeight - element.scrollTop - element.clientHeight < 100;
                if (event.currentTarget.scrollTop < 50) void loadOlderMessages();
              }}
              className="chat-message-canvas min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
            >
              {hasMore && (
                <button
                  type="button"
                  className="mx-auto mb-4 block text-xs font-medium text-brand-primary-text underline"
                  onClick={() => void loadOlderMessages()}
                >
                  {loadingMessages ? 'Loading…' : 'Load earlier messages'}
                </button>
              )}
              {loadingMessages ? (
                <p className="py-10 text-center text-sm text-text-muted">Loading messages…</p>
              ) : messages.length ? (
                messages.map((message, index) => (
                  <div key={message._id} id={`message-${message._id}`}>
                    <MessageBubble
                      message={{
                        ...message,
                        currentUserId: user.id,
                        isPinned: pinnedMessages.some((pin) => pin._id === message._id),
                        isStarred: starredIds.has(message._id),
                      }}
                      previousMessage={messages[index - 1]}
                      own={isOwnMessage(message, user.id)}
                      group={activeConversation.type === 'group'}
                      onReply={(selectedMessage) =>
                        setReplyTo({
                          ...selectedMessage,
                          id: selectedMessage._id,
                          senderName: isOwnMessage(selectedMessage, user.id)
                            ? 'yourself'
                            : activeConversation.participant.name,
                        })
                      }
                      onCopy={(text) => {
                        if (!navigator.clipboard?.writeText) {
                          setError('Clipboard access is not available in this browser.');
                        } else {
                          void navigator.clipboard.writeText(text).catch((copyError) => {
                            setError(copyError.message || 'Could not copy message text');
                          });
                        }
                      }}
                      onDelete={handleDelete}
                      onEdit={handleEdit}
                      onForward={setForwardingMessage}
                      onPin={handlePin}
                      onReact={handleReaction}
                      onReport={handleReport}
                      onStar={handleStar}
                      onRetry={(retryMessage) => {
                        const retry = retryActionsRef.current.get(retryMessage.clientMessageId);
                        if (retry) void retry();
                      }}
                    />
                  </div>
                ))
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <MessageCircle size={34} className="text-brand-primary" />
                  <p className="mt-3 font-medium text-heading">Start the conversation</p>
                  <p className="mt-1 text-sm text-text-muted">
                    Send a message, photo, file, or voice note.
                  </p>
                </div>
              )}
            </div>

            <ChatComposer
              disabled={!activeConversation.canSend}
              onSendText={(text) => void sendText(text)}
              onSendFile={(file, caption) => void sendFile(file, caption)}
              onTypingStart={startTyping}
              onTypingStop={stopTyping}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="rounded-3xl bg-brand-primary-soft p-5 text-brand-primary">
              <UserRound size={32} />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-heading">Your messages</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-text-muted">
              Choose a conversation, or visit{' '}
              <Link to="/friends" className="font-semibold text-brand-primary-text hover:underline">
                Friends
              </Link>{' '}
              to open a friend’s profile and start a chat.
            </p>
          </div>
        )}
      </div>
      {createGroupOpen && (
        <CreateGroupDialog
          friends={friends}
          onClose={() => setCreateGroupOpen(false)}
          onCreated={async (conversation, avatarError) => {
            setCreateGroupOpen(false);
            await refreshLists();
            selectConversation(conversation.id);
            if (avatarError) setError(avatarError);
          }}
        />
      )}
      {groupInfoOpen && activeConversation?.type === 'group' && (
        <GroupInfoDialog
          key={activeConversation.updatedAt}
          conversation={activeConversation}
          friends={friends}
          currentUserId={user.id}
          onClose={() => setGroupInfoOpen(false)}
          onUpdated={refreshLists}
          onLeft={handleLeftGroup}
        />
      )}
      {forwardingMessage && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/60 p-4">
          <section className="w-full max-w-md rounded-2xl border border-border bg-bg p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-heading">Forward message</h2>
              <button
                type="button"
                aria-label="Close forward dialog"
                onClick={() => setForwardingMessage(null)}
                className="rounded-lg p-2 text-text-muted hover:bg-surface"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 max-h-72 space-y-1 overflow-y-auto">
              {conversations.map((conversation) => (
                <button
                  type="button"
                  key={conversation.id}
                  onClick={() => void handleForward(conversation.id)}
                  className="block w-full rounded-xl px-3 py-3 text-left text-sm text-text hover:bg-bg-subtle"
                >
                  {conversation.participant.name}
                </button>
              ))}
              {!conversations.length && (
                <p className="py-4 text-sm text-text-muted">No conversations available.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function Avatar({ user, large = false }) {
  const sizeClass = large ? 'h-11 w-11' : 'h-10 w-10';
  return (
    <span className="relative inline-flex shrink-0">
      {user.avatar ? (
        <img src={user.avatar} alt="" className={`${sizeClass} rounded-full object-cover`} />
      ) : (
        <span
          className={`flex ${sizeClass} items-center justify-center rounded-full bg-brand-primary-soft font-semibold text-brand-primary-text ${
            large ? 'text-sm' : 'text-xs'
          }`}
        >
          {user.name?.slice(0, 1).toUpperCase() || '?'}
        </span>
      )}
      {user.isOnline && (
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-bg bg-success" />
      )}
    </span>
  );
}

function isOwnMessage(message, userId) {
  const senderId = typeof message.sender === 'object' ? message.sender?.id : message.sender;
  return senderId?.toString() === userId.toString();
}

function upsertMessage(messages, message) {
  const index = messages.findIndex(
    (candidate) =>
      candidate._id === message._id ||
      (message.clientMessageId && candidate.clientMessageId === message.clientMessageId),
  );
  const updated =
    index < 0
      ? [...messages, message]
      : messages.map((candidate, itemIndex) => (itemIndex === index ? message : candidate));
  return sortMessages(updated);
}

export default ChatPage;
