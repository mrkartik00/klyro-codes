import mongoose from 'mongoose';
import { COMPANY_TYPES } from '@klyro/shared/enums';
import { basePlugin } from './plugins/base.js';

const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  placeId: { type: String, default: null }, // Google Maps place id
  domain: { type: String, default: null, lowercase: true, trim: true },
  phone: { type: String, default: null }, // E.164
  address: { type: String },
  city: { type: String, index: true },
  country: { type: String, index: true }, // ISO-2
  category: { type: String, index: true },
  rating: { type: Number },
  reviewCount: { type: Number },
  lat: { type: Number },
  lng: { type: Number },
  timezone: { type: String },
  companyType: { type: String, enum: COMPANY_TYPES, default: 'unknown' },
});
organizationSchema.plugin(basePlugin, { softDelete: true });
// Unique per workspace only when the key is actually present (a real string),
// so many orgs without a placeId/domain don't collide on null.
organizationSchema.index(
  { workspaceId: 1, placeId: 1 },
  { unique: true, partialFilterExpression: { placeId: { $type: 'string' } } },
);
organizationSchema.index(
  { workspaceId: 1, domain: 1 },
  { unique: true, partialFilterExpression: { domain: { $type: 'string' } } },
);
organizationSchema.index({ workspaceId: 1, phone: 1 }, { sparse: true });

export const Organization = mongoose.model('Organization', organizationSchema);
