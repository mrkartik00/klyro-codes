import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

const websiteAuditSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
  url: { type: String },
  reachable: { type: Boolean },
  hasSsl: { type: Boolean },
  mobileScore: { type: Number }, // PageSpeed mobile performance 0-100
  lcpMs: { type: Number },
  mobileFriendly: { type: Boolean },
  techStack: { type: [String], default: [] },
  emailsFound: { type: [String], default: [] },
  socials: { type: mongoose.Schema.Types.Mixed },
  issues: { type: [String], default: [] }, // e.g. 'no-ssl', 'slow-mobile', 'no-viewport'
});
websiteAuditSchema.plugin(basePlugin);

export const WebsiteAudit = mongoose.model('WebsiteAudit', websiteAuditSchema);
