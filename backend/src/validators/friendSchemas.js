const { z } = require('zod');
const { objectId } = require('./chatSchemas');

const username = z
  .string()
  .trim()
  .transform((value) => value.replace(/^@/, '').toLowerCase())
  .pipe(
    z.string().regex(/^[a-z0-9_]{3,20}$/, 'Username must be 3-20 letters, numbers, or underscores'),
  );

const friendRequestSchema = z.object({ userId: objectId }).strict();
const friendIdSchema = z.object({ friendId: objectId }).strict();

module.exports = { friendIdSchema, friendRequestSchema, username };
