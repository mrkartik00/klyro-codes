import crypto from 'node:crypto';
import { PitchPage, PitchEvent } from '../models/PitchPage.js';
import { Lead } from '../models/Lead.js';
import { withTransaction } from '../utils/transaction.js';
import { ApiError } from '../utils/ApiError.js';

export async function createPitchPage({ workspaceId, leadId, businessName, logoUrl, sections, createdBy }) {
  const slug = `${(businessName ?? 'pitch').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${crypto.randomBytes(3).toString('hex')}`;
  const token = crypto.randomBytes(16).toString('hex');
  const [page] = await PitchPage.create(
    [{ workspaceId, createdBy, leadId, slug, token, businessName, logoUrl, sections }],
    { ordered: true },
  );
  return page;
}

export async function getPublicPitch({ slug, token }) {
  const page = await PitchPage.findOne({ slug, deletedAt: null });
  if (!page || page.token !== token) throw ApiError.notFound('Pitch not found');
  return page;
}

/**
 * Record a pitch event. On the first view, bump the lead score and flag it so
 * the caller can alert. Deduped per session for view events.
 */
export async function recordPitchEvent({ slug, token, type, section, scrollDepth, sessionId }) {
  const page = await PitchPage.findOne({ slug, deletedAt: null });
  if (!page || page.token !== token) throw ApiError.notFound('Pitch not found');

  let firstView = false;
  await withTransaction(async (session) => {
    // Reload inside the txn so a retry of this body doesn't double-count the
    // in-memory view increment; all mutations use DB-atomic operators.
    const fresh = await PitchPage.findById(page._id).session(session);
    await PitchEvent.create(
      [{ workspaceId: fresh.workspaceId, pitchPageId: fresh._id, type, section, scrollDepth, sessionId }],
      { session, ordered: true },
    );
    if (type === 'view') {
      firstView = !fresh.firstViewedAt;
      await PitchPage.updateOne(
        { _id: fresh._id },
        {
          $inc: { viewCount: 1 },
          ...(firstView ? { $set: { firstViewedAt: new Date() } } : {}),
        },
        { session },
      );
      if (firstView && fresh.leadId) {
        await Lead.updateOne({ _id: fresh.leadId }, { $inc: { score: 5 } }, { session });
      }
    }
  });
  return { recorded: true, firstView, leadId: page.leadId, businessName: page.businessName };
}
