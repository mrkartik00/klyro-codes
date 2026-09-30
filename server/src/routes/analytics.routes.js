import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { funnel } from '../services/analytics.service.js';
import { Lead } from '../models/Lead.js';
import { Deal } from '../models/Deal.js';
import { Approval } from '../models/Approval.js';
import { Message } from '../models/Message.js';
import { Campaign } from '../models/Campaign.js';
import { Invoice } from '../models/Invoice.js';
import mongoose from 'mongoose';

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
    // aggregate() needs a real ObjectId (countDocuments casts, aggregate does not).
    const ws = new mongoose.Types.ObjectId(String(req.workspaceId));
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 864e5);
    const [leads, newLeads7d, pendingApprovals, openDeals, wonDeals, activeCampaigns, sentToday, replies7d, unpaid] = await Promise.all([
      Lead.countDocuments({ workspaceId: ws, deletedAt: null }),
      Lead.countDocuments({ workspaceId: ws, deletedAt: null, createdAt: { $gte: weekAgo } }),
      Approval.countDocuments({ workspaceId: ws, status: 'pending' }),
      Deal.countDocuments({ workspaceId: ws, stage: { $nin: ['won', 'lost'] } }),
      Deal.countDocuments({ workspaceId: ws, stage: 'won' }),
      Campaign.countDocuments({ workspaceId: ws, status: 'active' }),
      Message.countDocuments({ workspaceId: ws, direction: 'outbound', sentAt: { $gte: startOfDay } }),
      Message.countDocuments({ workspaceId: ws, direction: 'inbound', createdAt: { $gte: weekAgo } }),
      Invoice.aggregate([
        { $match: { workspaceId: ws, status: { $in: ['sent', 'partially_paid'] } } },
        { $group: { _id: '$currency', due: { $sum: { $subtract: ['$amountMinor', { $ifNull: ['$paidMinor', 0] }] } }, count: { $sum: 1 } } },
      ]),
    ]);
    return ok(res, {
      leads,
      newLeads7d,
      pendingApprovals,
      openDeals,
      wonDeals,
      activeCampaigns,
      sentToday,
      replies7d,
      unpaidInvoices: unpaid.reduce((n, r) => n + r.count, 0),
      unpaidByCurrency: Object.fromEntries(unpaid.map((r) => [r._id || 'USD', r.due])),
    });
  }),
);
