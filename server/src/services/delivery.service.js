import crypto from 'node:crypto';
import { Project, Milestone } from '../models/Project.js';
import { Invoice } from '../models/Invoice.js';
import { withTransaction } from '../utils/transaction.js';
import { writeAudit } from './audit.service.js';
import { ApiError } from '../utils/ApiError.js';

const invoiceNumber = () => `KLY-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex')}`;

/**
 * C24 — approve a milestone and, if there's a next milestone, raise its invoice.
 * One transaction so a milestone is never approved without its follow-on
 * invoice (and vice versa). Idempotent: re-approving returns the current state.
 */
export async function approveMilestone({ workspaceId, milestoneId, actorId }) {
  return withTransaction(async (session) => {
    const milestone = await Milestone.findOne({ workspaceId, _id: milestoneId }).session(session);
    if (!milestone) throw ApiError.notFound('Milestone not found');
    if (milestone.status === 'approved') return { approved: true, idempotent: true };

    milestone.status = 'approved';
    milestone.approvedAt = new Date();
    await milestone.save({ session });

    const project = await Project.findOne({ workspaceId, _id: milestone.projectId }).session(session);

    // Find the next pending milestone (by order) and invoice it.
    const next = await Milestone.findOne({
      workspaceId,
      projectId: milestone.projectId,
      order: { $gt: milestone.order },
      status: 'pending',
    })
      .sort({ order: 1 })
      .session(session);

    let invoiceId = null;
    if (next) {
      next.status = 'in_progress';
      await next.save({ session });
      const [inv] = await Invoice.create(
        [
          {
            workspaceId,
            createdBy: actorId,
            dealId: project?.dealId,
            projectId: milestone.projectId,
            milestoneId: next._id,
            number: invoiceNumber(),
            currency: next.currency,
            amountMinor: next.amountMinor,
            status: 'draft',
          },
        ],
        { session, ordered: true },
      );
      invoiceId = inv._id;
    } else if (project) {
      // No more milestones → project delivered.
      project.status = 'delivered';
      project.progressPct = 100;
      await project.save({ session });
    }

    await writeAudit(
      {
        workspaceId,
        actorId,
        action: 'milestone.approved',
        entity: 'milestone',
        entityId: milestone._id,
        meta: { nextInvoiceId: invoiceId },
      },
      session,
    );
    return { approved: true, nextInvoiceId: invoiceId };
  });
}
