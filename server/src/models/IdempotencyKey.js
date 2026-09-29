import mongoose from 'mongoose';
import { IDEMPOTENCY_TTL_SECONDS } from '../config/constants.js';

const idempotencyKeySchema = new mongoose.Schema(
  {
    scope: { type: String, required: true }, // e.g. 'internal:leads/batch'
    key: { type: String, required: true },
    statusCode: { type: Number },
    response: { type: mongoose.Schema.Types.Mixed },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
idempotencyKeySchema.index({ scope: 1, key: 1 }, { unique: true });
idempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

idempotencyKeySchema.statics.ttlDate = () => new Date(Date.now() + IDEMPOTENCY_TTL_SECONDS * 1000);

export const IdempotencyKey = mongoose.model('IdempotencyKey', idempotencyKeySchema);
