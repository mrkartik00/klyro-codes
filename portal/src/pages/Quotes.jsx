import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAcceptQuotation, useQuotation, useQuotations } from '../hooks/usePortalData.js';
import {
  Button,
  Card,
  EmptyState,
  FieldError,
  Input,
  Label,
  Spinner,
  StatusBadge,
} from '../components/ui/index.jsx';
import { useToast } from '../components/Toast.jsx';
import { formatDate, formatMoney } from '../lib/utils.js';

const lookupSchema = z.object({
  quoteId: z.string().min(1, 'Enter a quotation ID'),
});

export default function Quotes() {
  const { id } = useParams();
  if (id) return <QuoteDetail id={id} />;
  return <QuoteLookup />;
}

function QuoteLookup() {
  const navigate = useNavigate();
  const { data: quotes = [], isLoading } = useQuotations();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(lookupSchema) });

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Quotes</h1>

      {isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Loading quotes…</p>
      ) : quotes.length > 0 ? (
        <ul className="space-y-3">
          {quotes.map((q) => {
            const qid = q._id || q.id;
            return (
              <li key={qid}>
                <Link
                  to={`/quotes/${qid}`}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition-colors hover:bg-[var(--color-muted)]"
                >
                  <div className="min-w-0">
                    <p className="font-medium">Quotation v{q.version ?? 1}</p>
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      {formatMoney(q.totalMinor, q.currency)} · {formatDate(q.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={q.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          No quotations have been shared with you yet.
        </p>
      )}

      <Card>
        <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
          Have a quotation ID? Open it directly.
        </p>
        <form
          onSubmit={handleSubmit((v) => navigate(`/quotes/${v.quoteId.trim()}`))}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          noValidate
        >
          <div className="min-w-0 flex-1">
            <Label htmlFor="quoteId">Quotation ID</Label>
            <Input id="quoteId" {...register('quoteId')} />
            <FieldError>{errors.quoteId?.message}</FieldError>
          </div>
          <Button type="submit">Open</Button>
        </form>
      </Card>
    </div>
  );
}

function QuoteDetail({ id }) {
  const { data, isLoading, isError } = useQuotation(id);
  const accept = useAcceptQuotation();
  const { toast } = useToast();
  const [error, setError] = useState('');

  if (isLoading) return <Spinner />;
  if (isError || !data) {
    return (
      <EmptyState
        title="Quotation not found"
        description="Check the ID or contact your account manager."
      />
    );
  }

  const currency = data.currency || 'USD';
  // API shape: items[{description, quantity, unitAmountMinor}], totalMinor.
  const items = (Array.isArray(data.items) ? data.items : []).map((it) => {
    const unit = Number(it.unitAmountMinor ?? it.unitPrice ?? 0) || 0;
    const qty = Number(it.quantity ?? 1) || 1;
    return { ...it, unit, qty, amount: unit * qty };
  });
  const subtotal = items.reduce((sum, it) => sum + it.amount, 0);
  const total = Number(data.totalMinor ?? subtotal) || 0;
  const accepted = data.status === 'accepted';
  const expired = data.validUntil && new Date(data.validUntil) < new Date();
  // Only a sent, unexpired quote can be accepted (matches the server rules).
  const canAccept = data.status === 'sent' && !expired;
  const note =
    data.status === 'draft'
      ? 'This quote is still being prepared.'
      : data.status === 'superseded'
        ? 'A newer version of this quote replaced it — check your Quotes list.'
        : data.status === 'rejected'
          ? 'This quote was declined.'
          : expired && !accepted
            ? 'This quote has expired. Message us for an updated one.'
            : '';

  async function onAccept() {
    setError('');
    try {
      await accept.mutateAsync(id);
      toast({
        title: 'Quote accepted',
        description: 'We will follow up with next steps shortly.',
        tone: 'success',
      });
    } catch (err) {
      setError(
        err.response?.data?.error?.message || 'Unable to accept this quote.'
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">
            Quotation v{data.version ?? 1}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {data.validUntil ? `Valid until ${formatDate(data.validUntil)}` : `Ref ${String(id).slice(-8)}`}
          </p>
        </div>
        <StatusBadge status={data.status} />
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm [&_th]:whitespace-nowrap">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-muted-foreground)]">
              <th className="p-3 font-medium">Item</th>
              <th className="p-3 text-right font-medium">Qty</th>
              <th className="p-3 text-right font-medium">Unit</th>
              <th className="p-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="p-4 text-center text-[var(--color-muted-foreground)]"
                >
                  No line items
                </td>
              </tr>
            ) : (
              items.map((it, i) => (
                <tr
                  key={it._id || it.id || i}
                  className="border-b border-[var(--color-border)] last:border-0"
                >
                  <td className="p-3">{it.description || it.name || '—'}</td>
                  <td className="p-3 text-right">{it.qty}</td>
                  <td className="p-3 text-right">{formatMoney(it.unit, currency)}</td>
                  <td className="p-3 text-right">{formatMoney(it.amount, currency)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            {(data.discountPercent > 0 || data.taxPercent > 0) && (
              <tr className="text-[var(--color-muted-foreground)]">
                <td className="p-3" colSpan={3}>
                  Subtotal {formatMoney(subtotal, currency)}
                  {data.discountPercent > 0 ? ` · discount ${data.discountPercent}%` : ''}
                  {data.taxPercent > 0 ? ` · tax ${data.taxPercent}%` : ''}
                </td>
                <td />
              </tr>
            )}
            <tr className="font-semibold">
              <td className="p-3" colSpan={3}>
                Total
              </td>
              <td className="p-3 text-right">
                {formatMoney(total, currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {error}
        </p>
      ) : null}

      {note ? <p className="text-sm text-[var(--color-muted-foreground)]">{note}</p> : null}

      <div>
        <Button
          onClick={onAccept}
          disabled={!canAccept || accept.isPending}
        >
          {accepted
            ? 'Accepted'
            : accept.isPending
              ? 'Accepting…'
              : 'Accept quote'}
        </Button>
      </div>
    </div>
  );
}
