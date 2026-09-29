import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { verifyWebhook } from '../integrations/razorpay/index.js';
import { recordPayment } from '../services/payment.service.js';
import { Invoice } from '../models/Invoice.js';
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
