import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useAcceptQuotation, useQuotation } from '../hooks/usePortalData.js';
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
import { formatMoney } from '../lib/utils.js';

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
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(lookupSchema) });

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Quotes</h1>
      <Card>
        <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
          Enter the quotation ID shared with you to view and accept it.
        </p>
        <form
          onSubmit={handleSubmit((v) => navigate(`/quotes/${v.quoteId.trim()}`))}
          className="flex items-end gap-3"
          noValidate
        >
          <div className="flex-1">
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
  const items = Array.isArray(data.lineItems)
    ? data.lineItems
    : Array.isArray(data.items)
      ? data.items
      : [];
  const computedTotal = items.reduce(
    (sum, it) =>
      sum + (Number(it.amount ?? (it.unitPrice || 0) * (it.quantity || 1)) || 0),
    0
  );
  const total = Number(data.total ?? computedTotal) || 0;
  const accepted = data.status === 'accepted';

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
            {data.title || 'Quotation'}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {data.number || id}
          </p>
        </div>
        <StatusBadge status={data.status} />
      </div>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
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
                  <td className="p-3 text-right">{it.quantity ?? 1}</td>
                  <td className="p-3 text-right">
                    {formatMoney(it.unitPrice ?? 0, currency)}
                  </td>
                  <td className="p-3 text-right">
                    {formatMoney(
                      it.amount ??
                        (it.unitPrice || 0) * (it.quantity || 1),
                      currency
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
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

      <div>
        <Button
          onClick={onAccept}
          disabled={accepted || accept.isPending}
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
