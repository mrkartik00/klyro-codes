import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

// Append-only. Written inside the same transaction as the change it records.
const auditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorType: { type: String, enum: ['user', 'system', 'n8n'], default: 'user' },
  action: { type: String, required: true }, // e.g. 'deal.transition'
  entity: { type: String, required: true }, // e.g. 'deal'
  entityId: { type: mongoose.Schema.Types.ObjectId },
  before: { type: mongoose.Schema.Types.Mixed },
  after: { type: mongoose.Schema.Types.Mixed },
  meta: { type: mongoose.Schema.Types.Mixed },
});
auditLogSchema.plugin(basePlugin);
auditLogSchema.index({ workspaceId: 1, entity: 1, entityId: 1, createdAt: -1 });

// Guard against mutation of history.
auditLogSchema.pre('findOneAndUpdate', function () {
  throw new Error('audit_logs are append-only');
});

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
