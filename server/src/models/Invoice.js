import mongoose from 'mongoose';
import { INVOICE_STATUSES } from '@klyro/shared/enums';
import { basePlugin } from './plugins/base.js';

const invoiceSchema = new mongoose.Schema({
  dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', index: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },
  milestoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Milestone' },
  number: { type: String, required: true },
  status: { type: String, enum: INVOICE_STATUSES, default: 'draft', index: true },
  currency: { type: String, enum: ['USD', 'GBP', 'INR'], default: 'USD' },
  amountMinor: { type: Number, required: true },
  paidMinor: { type: Number, default: 0 },
  dueDate: { type: Date },
  gatewayOrderId: { type: String, default: null },
});
invoiceSchema.plugin(basePlugin, { softDelete: true });
invoiceSchema.index({ workspaceId: 1, number: 1 }, { unique: true });

export const Invoice = mongoose.model('Invoice', invoiceSchema);
