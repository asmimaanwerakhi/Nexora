const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'A valid ID is required');
const clientMessageId = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, 'A valid message ID is required');

const createConversationSchema = z.union([
  z.object({ participantId: objectId }).strict(),
  z
    .object({
      type: z.literal('group'),
      name: z.string().trim().min(1).max(100),
      description: z.string().trim().max(500).optional(),
      participantIds: z.array(objectId).min(1).max(99),
    })
    .strict(),
]);
const groupInfoSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one group field is required');
const groupMemberSchema = z.object({ userId: objectId }).strict();
const groupAdminSchema = z.object({ role: z.enum(['admin', 'member']) }).strict();
const groupPermissionsSchema = z
  .object({
    adminsOnlyMessages: z.boolean().optional(),
    adminsOnlyAddMembers: z.boolean().optional(),
    adminsOnlyEditInfo: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one permission is required');
const groupNotificationsSchema = z.object({ muted: z.boolean() }).strict();
const messageSchema = z
  .object({
    conversationId: objectId,
    text: z.string().trim().min(1).max(10000),
    replyTo: objectId.optional(),
    clientMessageId: clientMessageId.optional(),
  })
  .strict();
const editMessageSchema = z.object({ text: z.string().trim().min(1).max(10000) }).strict();
const forwardMessageSchema = z.object({ conversationId: objectId }).strict();
const reactionSchema = z
  .object({ emoji: z.enum(['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '👏']) })
  .strict();
const messageSearchSchema = z.object({ q: z.string().trim().min(2).max(100) }).strict();
const uploadMessageSchema = z
  .object({
    conversationId: objectId,
    text: z.string().trim().max(10000).optional(),
    replyTo: objectId.optional(),
    clientMessageId: clientMessageId.optional(),
  })
  .strict();
const pushTokenSchema = z.object({ token: z.string().trim().min(1).max(4096) }).strict();

module.exports = {
  createConversationSchema,
  editMessageSchema,
  forwardMessageSchema,
  groupAdminSchema,
  groupInfoSchema,
  groupMemberSchema,
  groupNotificationsSchema,
  groupPermissionsSchema,
  messageSchema,
  messageSearchSchema,
  objectId,
  pushTokenSchema,
  reactionSchema,
  uploadMessageSchema,
};
