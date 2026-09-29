import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { funnel } from '../services/analytics.service.js';
import { Lead } from '../models/Lead.js';
import { Deal } from '../models/Deal.js';
import { Approval } from '../models/Approval.js';
import { Message } from '../models/Message.js';

export const analyticsRouter = Router();

analyticsRouter.get(
  '/funnel',
  asyncHandler(async (req, res) =>
    ok(res, await funnel({ workspaceId: req.workspaceId, from: req.query.from, to: req.query.to, campaignId: req.query.campaignId, channel: req.query.channel })),
  ),
);

// Home dashboard summary.
analyticsRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const ws = req.workspaceId;
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const [leads, pendingApprovals, wonDeals, sentToday] = await Promise.all([
      Lead.countDocuments({ workspaceId: ws, deletedAt: null }),
      Approval.countDocuments({ workspaceId: ws, status: 'pending' }),
      Deal.countDocuments({ workspaceId: ws, stage: 'won' }),
      Message.countDocuments({ workspaceId: ws, direction: 'outbound', sentAt: { $gte: startOfDay } }),
    ]);
    return ok(res, { leads, pendingApprovals, wonDeals, sentToday });
  }),
);
