const { z } = require('zod');
const { objectId } = require('./chatSchemas');

const reportSchema = z
  .object({
    reportedUserId: objectId,
    messageId: objectId.optional(),
    reason: z.enum(['spam', 'harassment', 'impersonation', 'inappropriate_content', 'other']),
    details: z.string().trim().max(2000).optional(),
  })
  .strict();

const reportStatusSchema = z
  .object({ status: z.enum(['reviewing', 'resolved', 'dismissed']) })
  .strict();

const storySchema = z.object({ caption: z.string().trim().max(500).optional() }).strict();

module.exports = { reportSchema, reportStatusSchema, storySchema };
