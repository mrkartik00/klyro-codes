import mongoose from 'mongoose';
import { ROLES } from '@klyro/shared/enums';
import { basePlugin } from './plugins/base.js';

const membershipSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ROLES, required: true },
  status: { type: String, enum: ['active', 'invited', 'disabled'], default: 'active' },
});
membershipSchema.plugin(basePlugin);
membershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export const Membership = mongoose.model('Membership', membershipSchema);
