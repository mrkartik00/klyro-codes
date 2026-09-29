import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

const portfolioItemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  url: { type: String },
  imageUrl: { type: String },
  tags: { type: [String], default: [] },
  industries: { type: [String], default: [] }, // for pitch-page matching
  featured: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
});
portfolioItemSchema.plugin(basePlugin, { softDelete: true });

export const PortfolioItem = mongoose.model('PortfolioItem', portfolioItemSchema);
