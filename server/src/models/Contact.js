import mongoose from 'mongoose';
import { EMAIL_STATUSES } from '@klyro/shared/enums';
import { basePlugin } from './plugins/base.js';

const contactSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
  name: { type: String, trim: true },
  email: { type: String, lowercase: true, trim: true, default: null },
  emailStatus: { type: String, enum: EMAIL_STATUSES, default: 'unknown' },
  phone: { type: String, default: null },
  title: { type: String },
  linkedinUrl: { type: String },
});
contactSchema.plugin(basePlugin, { softDelete: true });
contactSchema.index({ workspaceId: 1, email: 1 }, { unique: true, sparse: true });

export const Contact = mongoose.model('Contact', contactSchema);
