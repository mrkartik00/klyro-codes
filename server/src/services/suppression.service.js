import { Suppression } from '../models/Suppression.js';
import { registrableDomain } from '../utils/normalize.js';

export async function isSuppressed({ workspaceId, email, phone, linkedin }, session) {
  const or = [];
  if (email) {
    or.push({ type: 'email', value: email.toLowerCase() });
    const d = email.split('@')[1];
    if (d) or.push({ type: 'domain', value: d.toLowerCase() });
  }
  if (phone) or.push({ type: 'phone', value: phone });
  if (linkedin) or.push({ type: 'linkedin', value: String(linkedin).toLowerCase() });
  if (or.length === 0) return false;
  const hit = await Suppression.findOne({ workspaceId, $or: or }).session(session ?? null);
  return Boolean(hit);
}

export async function suppress({ workspaceId, type, value, reason, createdBy }, session) {
  const norm = type === 'domain' ? registrableDomain(value) : String(value).toLowerCase();
  return Suppression.findOneAndUpdate(
    { workspaceId, type, value: norm },
    { $setOnInsert: { workspaceId, type, value: norm, reason, createdBy } },
    { upsert: true, new: true, session: session ?? null },
  );
}
