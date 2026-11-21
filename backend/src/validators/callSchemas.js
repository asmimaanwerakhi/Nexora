const { z } = require('zod');
const { objectId } = require('./chatSchemas');

const callIdSchema = z.object({ callId: objectId }).strict();
const inviteCallSchema = z
  .object({
    recipientId: objectId,
    type: z.enum(['voice', 'video']),
  })
  .strict();
const signalSchema = z
  .object({
    callId: objectId,
    description: z
      .object({
        type: z.enum(['offer', 'answer']),
        sdp: z.string().min(1).max(200000),
      })
      .strict(),
  })
  .strict();
const iceSchema = z
  .object({
    callId: objectId,
    candidate: z
      .object({
        candidate: z.string().max(5000),
        sdpMid: z.string().max(256).nullable().optional(),
        sdpMLineIndex: z.number().int().min(0).nullable().optional(),
        usernameFragment: z.string().max(256).nullable().optional(),
      })
      .strict(),
  })
  .strict();

module.exports = { callIdSchema, iceSchema, inviteCallSchema, signalSchema };
