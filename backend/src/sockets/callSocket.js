const {
  iceSchema,
  inviteCallSchema,
  signalSchema,
  callIdSchema,
} = require('../validators/callSchemas');
const callService = require('../services/callService');

const acknowledge = (callback, response) => {
  if (typeof callback === 'function') callback(response);
};

const attachCallSocket = (io, socket) => {
  const user = socket.data.user;
  const handle = (event, schema, action) => {
    socket.on(event, async (payload, callback) => {
      try {
        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
          acknowledge(callback, {
            error: { code: 'INVALID_PAYLOAD', message: 'The call request is invalid' },
          });
          return;
        }
        const data = await action(parsed.data);
        acknowledge(callback, { data });
      } catch (error) {
        acknowledge(callback, {
          error: {
            code: error.code || 'CALL_FAILED',
            message: error.message || 'The call could not be completed',
          },
        });
      }
    });
  };

  handle('call:invite', inviteCallSchema, ({ recipientId, type }) =>
    callService.inviteCall(io, user, recipientId, type),
  );
  handle('call:accept', callIdSchema, ({ callId }) => callService.acceptCall(io, user._id, callId));
  handle('call:reject', callIdSchema, ({ callId }) =>
    callService.finishCall(io, user._id, callId, 'rejected'),
  );
  handle('call:end', callIdSchema, ({ callId }) =>
    callService.finishCall(io, user._id, callId, 'ended'),
  );
  handle('webrtc:offer', signalSchema, ({ callId, description }) =>
    callService.relaySignal(io, user._id, callId, 'webrtc:offer', description),
  );
  handle('webrtc:answer', signalSchema, ({ callId, description }) =>
    callService.relaySignal(io, user._id, callId, 'webrtc:answer', description),
  );
  handle('webrtc:ice', iceSchema, ({ callId, candidate }) =>
    callService.relaySignal(io, user._id, callId, 'webrtc:ice', candidate),
  );
};

module.exports = attachCallSocket;
