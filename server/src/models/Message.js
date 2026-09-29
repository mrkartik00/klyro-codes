import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

const messageSchema = new mongoose.Schema({
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', index: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  mailboxId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mailbox' },
  stepOrder: { type: Number },
  direction: { type: String, enum: ['outbound', 'inbound'], default: 'outbound' },
  channel: { type: String, default: 'email' },
  subject: { type: String },
  body: { type: String },
  status: {
    type: String,
    enum: ['queued', 'sending', 'sent', 'failed', 'bounced', 'received'],
    default: 'queued',
    index: true,
  },
  providerMessageId: { type: String, default: null },
  threadId: { type: String, default: null },
  headerToken: { type: String, default: null }, // X-Klyro-Msg value
  sentAt: { type: Date },
  error: { type: String },
});
messageSchema.plugin(basePlugin);
messageSchema.index(
  { workspaceId: 1, providerMessageId: 1 },
  { unique: true, partialFilterExpression: { providerMessageId: { $type: 'string' } } },
);
messageSchema.index({ workspaceId: 1, headerToken: 1 }, { sparse: true });

export const Message = mongoose.model('Message', messageSchema);
