const { z } = require('zod');
const { objectId } = require('./chatSchemas');

const timezone = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'A valid IANA timezone is required');

const startTime = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));
const invitedUsers = z
  .array(objectId)
  .max(100)
  .refine((userIds) => new Set(userIds).size === userIds.length, 'Invitees must be unique');

const createMeetingSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(5000).optional(),
    startTime,
    durationMinutes: z.number().int().min(1).max(1440),
    timezone: timezone.default('UTC'),
    accessType: z.enum(['restricted', 'link']),
    allowLinkRequests: z.boolean().default(false),
    allowEarlyJoin: z.boolean().default(true),
    earlyJoinMinutes: z.number().int().min(0).max(1440).default(10),
    invitedUsers: invitedUsers.default([]),
  })
  .strict()
  .refine((value) => value.accessType === 'link' || !value.allowLinkRequests, {
    message: 'Link join requests are only available for link-access meetings',
    path: ['allowLinkRequests'],
  });

const updateMeetingSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(5000).optional(),
    startTime: startTime.optional(),
    durationMinutes: z.number().int().min(1).max(1440).optional(),
    timezone: timezone.optional(),
    accessType: z.enum(['restricted', 'link']).optional(),
    allowLinkRequests: z.boolean().optional(),
    allowEarlyJoin: z.boolean().optional(),
    earlyJoinMinutes: z.number().int().min(0).max(1440).optional(),
    invitedUsers: invitedUsers.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one meeting field is required')
  .refine(
    (value) => value.accessType !== 'restricted' || value.allowLinkRequests !== true,
    'Link join requests are only available for link-access meetings',
    { path: ['allowLinkRequests'] },
  );

const decisionSchema = z.object({ decision: z.enum(['accepted', 'rejected']) }).strict();
const muteParticipantSchema = z.object({ muted: z.boolean() }).strict();
const extendMeetingSchema = z.object({ minutes: z.number().int().min(1).max(240) }).strict();
const joinRequestSchema = z.object({}).strict();

module.exports = {
  createMeetingSchema,
  decisionSchema,
  extendMeetingSchema,
  joinRequestSchema,
  muteParticipantSchema,
  updateMeetingSchema,
};
