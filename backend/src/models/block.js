const mongoose = require('mongoose');

const { Schema } = mongoose;

const blockSchema = new Schema(
  {
    blocker: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    blocked: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      validate: {
        validator(value) {
          return this.blocker && !value.equals(this.blocker);
        },
        message: 'A user cannot block themselves',
      },
    },
  },
  { timestamps: true, strict: 'throw' },
);

blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true, name: 'block_pair_unique' });
blockSchema.index({ blocked: 1, createdAt: -1 }, { name: 'blocks_received' });

module.exports = mongoose.models.Block || mongoose.model('Block', blockSchema);
