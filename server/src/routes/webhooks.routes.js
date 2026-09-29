import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { verifyWebhook } from '../integrations/razorpay/index.js';
import { recordPayment } from '../services/payment.service.js';
import { decideApproval } from '../services/approval.service.js';
import { answerCallback } from '../integrations/telegram/index.js';
import { Invoice } from '../models/Invoice.js';
import { Approval } from '../models/Approval.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export const webhooksRouter = Router();

// Razorpay payment webhook. Signature verified over the raw body.
webhooksRouter.post(
  '/razorpay',
  asyncHandler(async (req, res) => {
    const signature = req.get('X-Razorpay-Signature');
    if (!verifyWebhook(req.rawBody ?? JSON.stringify(req.body), signature)) {
      return res.status(400).json({ success: false, error: { code: 'BAD_SIGNATURE' } });
    }
    const event = req.body?.event;
    const entity = req.body?.payload?.payment?.entity;
    if (event === 'payment.captured' && entity) {
      const invoice = await Invoice.findOne({ gatewayOrderId: entity.order_id });
      if (invoice) {
        await recordPayment({
          workspaceId: invoice.workspaceId,
          invoiceId: invoice._id,
          amountMinor: entity.amount,
          currency: entity.currency,
          method: 'razorpay',
          gatewayPaymentId: entity.id,
        });
      } else {
        logger.warn({ orderId: entity.order_id }, 'Razorpay webhook: invoice not found');
      }
    }
    return ok(res, { received: true });
  }),
);

// D34 — Telegram webhook: handle inline Approve/Reject buttons. Secured by a
// path secret token (Telegram supports X-Telegram-Bot-Api-Secret-Token).
webhooksRouter.post(
  '/telegram',
  asyncHandler(async (req, res) => {
    if (env.TELEGRAM_WEBHOOK_SECRET) {
      const got = req.get('x-telegram-bot-api-secret-token');
      if (got !== env.TELEGRAM_WEBHOOK_SECRET) return res.status(401).json({ ok: false });
    }
    const cb = req.body?.callback_query;
    if (cb?.data) {
      // data format: "approve:<approvalId>" / "reject:<approvalId>"
      const [action, approvalId] = String(cb.data).split(':');
      if (['approve', 'reject'].includes(action) && approvalId) {
        const appr = await Approval.findById(approvalId).lean();
        if (appr) {
          await decideApproval({
            workspaceId: appr.workspaceId,
            approvalId,
            decision: action,
            actorId: appr.createdBy,
          }).catch((err) => logger.warn({ err }, 'telegram decide failed'));
        }
        await answerCallback(cb.id, `Draft ${action}d`).catch(() => {});
      }
    }
    return ok(res, { received: true });
  }),
);
