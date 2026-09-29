import { Approval } from '../models/Approval.js';
import { Enrollment } from '../models/Enrollment.js';
import { withTransaction } from '../utils/transaction.js';
import { writeAudit } from './audit.service.js';
import { emitToWorkspace } from '../socket/index.js';
import { ApiError } from '../utils/ApiError.js';

export async function createApproval({ workspaceId, enrollmentId, leadId, stepOrder, channel, draft, createdBy }) {
  const [doc] = await Approval.create(
    [{ workspaceId, createdBy, enrollmentId, leadId, stepOrder, channel, draft, status: 'pending' }],
    { ordered: true },
  );
  return doc;
}

/** Approve or reject a draft. Idempotent: re-deciding returns the current state. */
export async function decideApproval({ workspaceId, approvalId, decision, editedDraft, actorId }) {
  const result = await withTransaction(async (session) => {
    const approval = await Approval.findOne({ workspaceId, _id: approvalId }).session(session);
    if (!approval) throw ApiError.notFound('Approval not found');
    if (approval.status !== 'pending') {
      return { status: approval.status, idempotent: true };
    }
    if (editedDraft) approval.draft = { ...approval.draft, ...editedDraft };
    approval.status = decision === 'approve' ? 'approved' : 'rejected';
    approval.decidedBy = actorId;
    approval.decidedAt = new Date();
    await approval.save({ session });

    // A rejected draft leaves the enrollment where it is (n8n will re-draft or
    // skip); an approved draft becomes eligible for the send claim.
    await writeAudit(
      {
        workspaceId,
        actorId,
        action: `approval.${approval.status}`,
        entity: 'approval',
        entityId: approval._id,
        meta: { enrollmentId: approval.enrollmentId, stepOrder: approval.stepOrder },
      },
      session,
    );
    return { status: approval.status, approvalId: approval._id };
  });
  // D31 — live update to the admin UI (after commit, never on rollback).
  emitToWorkspace(workspaceId, 'approval:decided', { approvalId, status: result.status });
  return result;
}

export async function pendingCount({ workspaceId }) {
  return Approval.countDocuments({ workspaceId, status: 'pending' });
}

export { Enrollment };
