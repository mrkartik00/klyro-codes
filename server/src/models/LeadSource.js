import mongoose from 'mongoose';
import { basePlugin } from './plugins/base.js';

// Provenance record: where each lead's data came from (DPDP/GDPR requests).
const leadSourceSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', index: true },
  channel: { type: String, required: true }, // maps | reddit | linkedin | inbound | import | manual
  reference: { type: String }, // scrapeJobId, form id, subreddit, etc.
  raw: { type: mongoose.Schema.Types.Mixed },
});
leadSourceSchema.plugin(basePlugin);

export const LeadSource = mongoose.model('LeadSource', leadSourceSchema);
