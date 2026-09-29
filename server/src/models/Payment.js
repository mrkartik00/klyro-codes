import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

const paymentSchema = new mongoose.Schema({
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', index: true },
  currency: { type: String, enum: ['USD', 'GBP', 'INR'], default: 'USD' },
  amountMinor: { type: Number, required: true },
  method: { type: String, enum: ['razorpay', 'bank_transfer', 'manual'], default: 'razorpay' },
  gatewayPaymentId: { type: String, default: null },
  status: { type: String, enum: ['captured', 'pending', 'failed', 'refunded'], default: 'captured' },
  proofUrl: { type: String },
});
paymentSchema.plugin(basePlugin);
paymentSchema.index({ workspaceId: 1, gatewayPaymentId: 1 }, { unique: true, partialFilterExpression: { gatewayPaymentId: { $type: 'string' } } });

export const Payment = mongoose.model('Payment', paymentSchema);
