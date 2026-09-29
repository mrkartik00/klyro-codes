import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

// Key/value settings per workspace. Secret values are AES-256-GCM encrypted
// (encrypted:true) and never returned raw by the API.
const settingSchema = new mongoose.Schema({
  key: { type: String, required: true },
  value: { type: mongoose.Schema.Types.Mixed },
  encrypted: { type: Boolean, default: false },
});
settingSchema.plugin(basePlugin);
settingSchema.index({ workspaceId: 1, key: 1 }, { unique: true });

export const Setting = mongoose.model('Setting', settingSchema);
