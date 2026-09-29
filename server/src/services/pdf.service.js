import PDFDocument from 'pdfkit';
import { getSpaces, bucket, keyFor } from '../config/spaces.js';
import { logger } from '../config/logger.js';

const money = (minor, currency) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format((minor ?? 0) / 100);

// Render a PDFDocument to a Buffer.
function toBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

async function upload(key, buf) {
  const s3 = getSpaces();
  if (!s3) {
    logger.warn('Storage not configured; PDF not uploaded');
    return null;
  }
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: keyFor(key), Body: buf, ContentType: 'application/pdf' }),
  );
  return keyFor(key);
}

function header(doc, business, title) {
  doc.fontSize(20).fillColor('#111').text(business?.name || 'Klyro', { continued: false });
  doc.moveDown(0.2);
  doc.fontSize(10).fillColor('#666');
  if (business?.address) doc.text(business.address);
  if (business?.email) doc.text(business.email);
  doc.moveDown();
  doc.fontSize(16).fillColor('#111').text(title);
  doc.moveDown();
}

/** C19 — render a quotation PDF and upload it. Returns { key, buffer }. */
export async function renderQuotationPdf({ quotation, business }) {
  const doc = new PDFDocument({ margin: 50 });
  header(doc, business, `Quotation #${quotation.version ?? 1}`);
  doc.fontSize(10).fillColor('#333');
  doc.text(`Date: ${new Date(quotation.createdAt ?? Date.now()).toLocaleDateString()}`);
  if (quotation.validUntil) doc.text(`Valid until: ${new Date(quotation.validUntil).toLocaleDateString()}`);
  doc.moveDown();

  for (const item of quotation.items ?? []) {
    const line = money(item.unitAmountMinor * (item.quantity ?? 1), quotation.currency);
    doc.text(`${item.quantity ?? 1} × ${item.description}`, { continued: true }).text(line, { align: 'right' });
  }
  doc.moveDown();
  if (quotation.discountPercent) doc.text(`Discount: ${quotation.discountPercent}%`, { align: 'right' });
  if (quotation.taxPercent) doc.text(`Tax: ${quotation.taxPercent}%`, { align: 'right' });
  doc.fontSize(12).fillColor('#111').text(`Total: ${money(quotation.totalMinor, quotation.currency)}`, { align: 'right' });

  const buffer = await toBuffer(doc);
  const key = await upload(`private/quotations/${quotation._id}.pdf`, buffer);
  return { key, buffer };
}

/** C19 — render an invoice PDF (incl. bank details footer) and upload it. */
export async function renderInvoicePdf({ invoice, business, bankDetails }) {
  const doc = new PDFDocument({ margin: 50 });
  header(doc, business, `Invoice ${invoice.number}`);
  doc.fontSize(10).fillColor('#333');
  doc.text(`Date: ${new Date(invoice.createdAt ?? Date.now()).toLocaleDateString()}`);
  if (invoice.dueDate) doc.text(`Due: ${new Date(invoice.dueDate).toLocaleDateString()}`);
  doc.moveDown();
  doc.fontSize(14).fillColor('#111').text(`Amount due: ${money(invoice.amountMinor, invoice.currency)}`);
  if (invoice.paidMinor) doc.fontSize(10).fillColor('#333').text(`Paid so far: ${money(invoice.paidMinor, invoice.currency)}`);
  doc.moveDown(2);

  if (bankDetails) {
    doc.fontSize(9).fillColor('#666').text('Bank transfer details:');
    doc.text(bankDetails);
  }
  doc.moveDown();
  doc.fontSize(8).fillColor('#999').text('Thank you for your business.', { align: 'center' });

  const buffer = await toBuffer(doc);
  const key = await upload(`private/invoices/${invoice._id}.pdf`, buffer);
  return { key, buffer };
}
