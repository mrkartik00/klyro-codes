import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import { Agreement } from '../models/Notification.js';
import { Project } from '../models/Project.js';
import { getSpaces, bucket, keyFor } from '../config/spaces.js';
import { withTransaction } from '../utils/transaction.js';
import { writeAudit } from './audit.service.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';

/** Create a draft agreement for a project. */
export async function createAgreement({ workspaceId, projectId, dealId, actorId }) {
  const [doc] = await Agreement.create(
    [{ workspaceId, createdBy: actorId, projectId, dealId }],
    { ordered: true },
  );
  return doc;
}

async function renderSignedPdf({ agreement, project, signedBy }) {
  const doc = new PDFDocument({ margin: 50 });
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.fontSize(18).text('Work Agreement', { align: 'center' }).moveDown();
  doc.fontSize(11).text(`Project: ${project?.title ?? ''}`);
  doc.text(`Signed by: ${signedBy}`);
  doc.text(`Signed at: ${new Date().toISOString()}`);
  doc.text(`Signature hash: ${agreement.signatureHash}`);
  doc.moveDown().fontSize(9).fillColor('#666').text('This document was signed electronically and is legally binding.');
  doc.end();
  const buffer = await done;

  const s3 = getSpaces();
  if (!s3) {
    logger.warn('Storage not configured; signed agreement PDF not uploaded');
    return null;
  }
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const key = keyFor(`private/agreements/${agreement._id}.pdf`);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: 'application/pdf' }));
  return key;
}

/**
 * C25 — e-sign an agreement: capture typed signature, IP, user agent and a
 * content hash, generate the signed PDF, store it. Immutable once signed
 * (enforced by the model). Transactional on the signature write + audit.
 */
export async function signAgreement({ workspaceId, agreementId, signedBy, ip, userAgent, actorId }) {
  const project = await (async () => {
    const a = await Agreement.findOne({ workspaceId, _id: agreementId }).lean();
    return a?.projectId ? Project.findById(a.projectId).lean() : null;
  })();

  const signed = await withTransaction(async (session) => {
    const agreement = await Agreement.findOne({ workspaceId, _id: agreementId }).session(session);
    if (!agreement) throw ApiError.notFound('Agreement not found');
    if (agreement.signedAt) return agreement; // idempotent

    const hash = crypto
      .createHash('sha256')
      .update(`${agreementId}:${signedBy}:${ip}:${userAgent}:${Date.now()}`)
      .digest('hex');
    agreement.signedBy = signedBy;
    agreement.signatureHash = hash;
    agreement.signedIp = ip;
    agreement.signedUserAgent = userAgent;
    agreement.signedAt = new Date();
    await agreement.save({ session });

    await writeAudit(
      { workspaceId, actorId, action: 'agreement.signed', entity: 'agreement', entityId: agreement._id, meta: { signedBy, ip } },
      session,
    );
    return agreement;
  });

  // Render + store the PDF outside the txn (storage isn't transactional).
  if (!signed.pdfKey) {
    const pdfKey = await renderSignedPdf({ agreement: signed, project, signedBy }).catch(() => null);
    if (pdfKey) await Agreement.updateOne({ workspaceId, _id: agreementId }, { $set: { pdfKey } });
  }
  return { signed: true, agreementId: signed._id };
}
