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
// Partial, not sparse: sparse still indexes explicit nulls, so contacts without
// an email would collide.
contactSchema.index(
  { workspaceId: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
);

export const Contact = mongoose.model('Contact', contactSchema);
