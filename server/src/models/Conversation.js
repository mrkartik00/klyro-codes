import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

// A conversation thread. Two kinds:
//  - 'email'  : outbound campaign thread with a lead (linked by threadId)
//  - 'portal' : client chat inside the portal (linked by clientUserId/projectId)
const conversationSchema = new mongoose.Schema({
  kind: { type: String, enum: ['email', 'portal'], default: 'portal', index: true },
  subject: { type: String },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  clientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },
  mailboxId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mailbox' },
  threadId: { type: String, index: true }, // Gmail thread for email kind
  lastMessageAt: { type: Date, default: Date.now, index: true },
  lastPreview: { type: String },
});
conversationSchema.plugin(basePlugin, { softDelete: true });

// A single chat message inside a portal conversation. (Email messages use the
// existing Message collection.)
const chatMessageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  senderRole: { type: String, enum: ['admin', 'client', 'system'], default: 'client' },
  body: { type: String, required: true },
  attachments: { type: [{ fileId: mongoose.Schema.Types.ObjectId, name: String }], default: [] },
});
chatMessageSchema.plugin(basePlugin);
chatMessageSchema.index({ workspaceId: 1, conversationId: 1, createdAt: 1 });

export const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);
export const ChatMessage = mongoose.models.ChatMessage || mongoose.model('ChatMessage', chatMessageSchema);
