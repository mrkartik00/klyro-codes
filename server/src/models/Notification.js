import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  type: { type: String, required: true },
  title: { type: String },
  body: { type: String },
  data: { type: mongoose.Schema.Types.Mixed },
  readAt: { type: Date, default: null },
});
notificationSchema.plugin(basePlugin);

const fileSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
  key: { type: String, required: true }, // Spaces object key
  name: { type: String },
  mime: { type: String },
  size: { type: Number },
  checksum: { type: String },
  visibility: { type: String, enum: ['private', 'public'], default: 'private' },
});
fileSchema.plugin(basePlugin, { softDelete: true });

const agreementSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },
  dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' },
  pdfKey: { type: String },
  signedBy: { type: String },
  signatureHash: { type: String },
  signedIp: { type: String },
  signedUserAgent: { type: String },
  signedAt: { type: Date },
});
agreementSchema.plugin(basePlugin);
// Signed agreements are immutable once signed.
agreementSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate() ?? {};
  if (this.getQuery().signedAt) throw new Error('signed agreements are immutable');
  void update;
});

export const Notification = mongoose.model('Notification', notificationSchema);
export const File = mongoose.model('File', fileSchema);
export const Agreement = mongoose.model('Agreement', agreementSchema);
