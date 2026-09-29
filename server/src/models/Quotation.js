import mongoose from 'mongoose';
import { QUOTATION_STATUSES } from '@klyro/shared/enums';
import { basePlugin } from './plugins/base.js';

const quotationItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    quantity: { type: Number, default: 1, min: 1 },
    unitAmountMinor: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const quotationSchema = new mongoose.Schema({
  dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', required: true, index: true },
  version: { type: Number, default: 1 },
  status: { type: String, enum: QUOTATION_STATUSES, default: 'draft', index: true },
  currency: { type: String, enum: ['USD', 'GBP', 'INR'], default: 'USD' },
  items: { type: [quotationItemSchema], default: [] },
  discountPercent: { type: Number, default: 0, min: 0, max: 100 },
  taxPercent: { type: Number, default: 0, min: 0, max: 100 },
  totalMinor: { type: Number, default: 0 },
  validUntil: { type: Date },
  supersedesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
});
quotationSchema.plugin(basePlugin, { softDelete: true });

export const Quotation = mongoose.model('Quotation', quotationSchema);
