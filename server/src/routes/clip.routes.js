// Klyro Clipper: save any post you find (X, LinkedIn, Facebook groups, Threads,
// Instagram, Nextdoor, forums…) as a lead. The AI qualifies it and drafts a
// reply; you contact them yourself. Plus: which automated sources are ready.
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { validateBody } from '../middleware/validate.js';
import { Lead } from '../models/Lead.js';
import { qualify, saveIntentLead, PLATFORM_LABEL } from '../services/social.service.js';
import { authorFromUrl, sourceStatus, usage, braveUsage } from '../services/intent.service.js';
import { cfgNum } from '../config/secrets.js';
import { writeAudit } from '../services/audit.service.js';

export const clipRouter = Router();

clipRouter.get(
  '/sources',
  asyncHandler(async (req, res) =>
    ok(res, {
      sources: sourceStatus(),
      usage: { x: { used: await usage(req.workspaceId, 'x'), cap: cfgNum('X_MONTHLY_READ_CAP', 3000) }, brave: await braveUsage(req.workspaceId) },
    }),
  ),
);

clipRouter.post(
  '/',
  validateBody(
    z.object({
      url: z.string().url().max(2000),
      title: z.string().max(500).optional().default(''),
      text: z.string().max(8000).optional().default(''),
      author: z.string().max(120).optional(),
      platform: z.string().max(30).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { url, title, text } = req.body;
    const id = `clip_${crypto.createHash('sha1').update(url.split('?')[0]).digest('hex').slice(0, 16)}`;
    const existing = await Lead.findOne({ workspaceId: req.workspaceId, 'intent.externalId': id }).select('_id').lean();
    if (existing) return ok(res, { leadId: existing._id, created: false });
    const a = authorFromUrl(url);
    const platform = req.body.platform || a.platform;
    const author = req.body.author || a.name || 'unknown';
    const post = {
      id,
      platform,
      title: (title || text.split('\n')[0] || url).slice(0, 300),
      text: text || title,
      author,
      handle: a.handle || author,
      authorUrl: a.url || null,
      url,
      postedAt: new Date().toISOString(),
      community: platform,
      communityLabel: `${PLATFORM_LABEL[platform] || platform} (clipped)`,
      replyStyle: ['x', 'linkedin', 'bluesky', 'instagram', 'threads'].includes(platform) ? 'dm' : 'reply',
    };
    const q = await qualify(post, { background: false });
    // You chose this post, so it's saved whatever the AI thinks; its view is kept as a note.
    const saved = await saveIntentLead({
      workspaceId: req.workspaceId,
      post,
      q: { ...q, intent: Math.max(q.intent || 0, 0.5), need: q.need || post.title, reply: q.reply || '' },
      targetId: 'clip',
    });
    await writeAudit({ workspaceId: req.workspaceId, actorId: req.auth.userId, action: 'lead.clip', entity: 'lead', entityId: saved.leadId, meta: { url, role: q.role } });
    return ok(res, { leadId: saved.leadId, created: saved.created, role: q.role, intent: q.intent, need: q.need, reply: q.reply, ai: q.ai });
  }),
);
