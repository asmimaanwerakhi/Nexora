const { messageSchema, objectId } = require('../validators/chatSchemas');
const chatService = require('../services/chatService');
const { sendMessagePush } = require('../services/pushService');

const emitToParticipants = (io, conversation, event, payload) => {
  let target = io.to(`conversation:${conversation._id}`);
  if (conversation.type === 'group') target = target.to(`group:${conversation._id}`);
  for (const participant of conversation.participants) {
    target = target.to(`user:${participant.userId}`);
  }
  target.emit(event, payload);
};

const reportSocketError = (socket, acknowledge, error) => {
  if (!(error && error.statusCode)) {
    console.error('Chat socket event failed', error);
  }
  if (typeof acknowledge === 'function') {
    acknowledge({
      error: {
        code: error.code || 'CHAT_EVENT_FAILED',
        message: error.statusCode ? error.message : 'Could not complete the chat action',
      },
    });
  }
};

const checkMessageRate = (socket) => {
  const now = Date.now();
  if (!socket.data.messageWindowStart || now - socket.data.messageWindowStart >= 60_000) {
    socket.data.messageWindowStart = now;
    socket.data.messageCount = 0;
  }
  socket.data.messageCount += 1;
  return socket.data.messageCount <= 60;
};

const attachChatSocket = (io, socket) => {
  const userId = socket.data.user._id;
  const typingTimers = new Map();
  const userName = socket.data.user.name;
  const emitTyping = (conversation, event) => {
    emitToParticipants(io, conversation, event, {
      conversationId: conversation._id.toString(),
      userId: userId.toString(),
      name: userName,
    });
  };
  const stopTyping = (conversation) => {
    const timer = typingTimers.get(conversation._id.toString());
    if (timer) clearTimeout(timer);
    typingTimers.delete(conversation._id.toString());
    emitTyping(conversation, 'typing:stop');
  };

  socket.on('chat:leave', (payload, acknowledge) => {
    const parsed = objectId.safeParse(payload?.conversationId);
    if (!parsed.success) {
      if (typeof acknowledge === 'function') {
        acknowledge({
          error: {
            code: 'INVALID_CONVERSATION_ID',
            message: 'A valid conversation ID is required',
          },
        });
      }
      return;
    }
    socket.leave(`conversation:${parsed.data}`);
    socket.leave(`group:${parsed.data}`);
    if (typeof acknowledge === 'function') acknowledge({ data: { left: true } });
  });

  socket.on('chat:join', async (payload, acknowledge) => {
    try {
      const parsed = objectId.safeParse(payload?.conversationId);
      if (!parsed.success) {
        throw Object.assign(new Error('A valid conversation ID is required'), {
          statusCode: 400,
          code: 'INVALID_CONVERSATION_ID',
        });
      }
      const { conversation } = await chatService.getConversationForUser(parsed.data, userId);
      socket.join(`conversation:${conversation._id}`);
      if (conversation.type === 'group') socket.join(`group:${conversation._id}`);
      const delivery = await chatService.markDelivered(userId, conversation._id);
      if (delivery.count) {
        emitToParticipants(io, conversation, 'message:delivered', {
          conversationId: conversation._id.toString(),
          userId: userId.toString(),
          count: delivery.count,
          at: delivery.at,
        });
      }
      if (typeof acknowledge === 'function') acknowledge({ data: { joined: true } });
    } catch (error) {
      reportSocketError(socket, acknowledge, error);
    }
  });

  socket.on('message:send', async (payload, acknowledge) => {
    try {
      if (!checkMessageRate(socket)) {
        throw Object.assign(new Error('Too many messages. Try again shortly'), {
          statusCode: 429,
          code: 'MESSAGE_RATE_LIMITED',
        });
      }
      const parsed = messageSchema.safeParse(payload);
      if (!parsed.success) {
        throw Object.assign(
          new Error(parsed.error.issues.map((issue) => issue.message).join('; ')),
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
          },
        );
      }
      const result = await chatService.sendTextMessage({
        userId,
        ...parsed.data,
      });
      const { conversation } = await chatService.getConversationForUser(
        parsed.data.conversationId,
        userId,
      );
      if (!result.reused) {
        emitToParticipants(io, conversation, 'message:new', result.message);
        emitToParticipants(io, conversation, 'conversation:updated', {
          id: conversation._id.toString(),
          lastMessage: result.message,
        });
        const recipients = conversation.participants.filter((participant) => {
          const participantId = participant.userId.toString();
          return (
            participantId !== userId.toString() &&
            (conversation.type !== 'group' || !participant.notificationsMuted)
          );
        });
        for (const participant of recipients) {
          void sendMessagePush({
            recipientId: participant.userId,
            conversationId: conversation._id,
            message: result.message,
          }).catch((error) => console.error('Could not send message push notification', error));
        }
      }
      if (typeof acknowledge === 'function') {
        acknowledge({ data: { message: result.message, reused: result.reused } });
      }
    } catch (error) {
      reportSocketError(socket, acknowledge, error);
    }
  });

  socket.on('message:seen', async (payload, acknowledge) => {
    try {
      const parsed = objectId.safeParse(payload?.conversationId);
      if (!parsed.success) {
        throw Object.assign(new Error('A valid conversation ID is required'), {
          statusCode: 400,
          code: 'INVALID_CONVERSATION_ID',
        });
      }
      const { conversation } = await chatService.getConversationForUser(parsed.data, userId);
      const result = await chatService.markSeen(userId, conversation._id);
      if (result.count) {
        emitToParticipants(io, conversation, 'message:seen', {
          conversationId: conversation._id.toString(),
          userId: userId.toString(),
          count: result.count,
          at: result.at,
        });
      }
      if (typeof acknowledge === 'function') acknowledge({ data: result });
    } catch (error) {
      reportSocketError(socket, acknowledge, error);
    }
  });

  socket.on('typing:start', async (payload, acknowledge) => {
    try {
      const parsed = objectId.safeParse(payload?.conversationId);
      if (!parsed.success) {
        throw Object.assign(new Error('A valid conversation ID is required'), {
          statusCode: 400,
          code: 'INVALID_CONVERSATION_ID',
        });
      }
      const { conversation } = await chatService.getConversationForUser(parsed.data, userId);
      await chatService.authorizeDirectMessage(userId, conversation._id);
      const key = conversation._id.toString();
      const timer = typingTimers.get(key);
      if (timer) clearTimeout(timer);
      emitTyping(conversation, 'typing:start');
      const stopTimer = setTimeout(() => stopTyping(conversation), 4000);
      stopTimer.unref?.();
      typingTimers.set(key, stopTimer);
      if (typeof acknowledge === 'function') acknowledge({ data: { typing: true } });
    } catch (error) {
      reportSocketError(socket, acknowledge, error);
    }
  });

  socket.on('typing:stop', async (payload, acknowledge) => {
    try {
      const parsed = objectId.safeParse(payload?.conversationId);
      if (!parsed.success) {
        throw Object.assign(new Error('A valid conversation ID is required'), {
          statusCode: 400,
          code: 'INVALID_CONVERSATION_ID',
        });
      }
      const { conversation } = await chatService.getConversationForUser(parsed.data, userId);
      stopTyping(conversation);
      if (typeof acknowledge === 'function') acknowledge({ data: { typing: false } });
    } catch (error) {
      reportSocketError(socket, acknowledge, error);
    }
  });

  socket.on('disconnect', () => {
    for (const conversationId of typingTimers.keys()) {
      const roomConversation = { _id: conversationId, type: 'group', participants: [] };
      stopTyping(roomConversation);
    }
  });
};

module.exports = attachChatSocket;
