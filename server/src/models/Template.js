import mongoose from 'mongoose';
import { CHANNELS } from '@klyro/shared/enums';
import { basePlugin } from './plugins/base.js';

// A template may hold A/B variants; each has a weight.
const variantSchema = new mongoose.Schema(
  { label: String, subject: String, body: String, weight: { type: Number, default: 1 } },
  { _id: false },
);

const templateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  channel: { type: String, enum: CHANNELS, default: 'email' },
  variants: { type: [variantSchema], default: [] },
  variables: { type: [String], default: [] }, // e.g. ['firstName','company','pitchUrl']
});
templateSchema.plugin(basePlugin, { softDelete: true });

export const Template = mongoose.model('Template', templateSchema);
