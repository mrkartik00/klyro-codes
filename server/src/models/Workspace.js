import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

const workspaceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  plan: { type: String, enum: ['owner', 'team', 'marketplace'], default: 'owner' },
  timezone: { type: String, default: 'Asia/Kolkata' },
});
workspaceSchema.plugin(basePlugin, { tenant: false });

export const Workspace = mongoose.model('Workspace', workspaceSchema);
