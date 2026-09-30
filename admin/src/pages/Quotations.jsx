import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Send, Copy } from 'lucide-react';
import { CURRENCIES } from '@klyro/shared/enums';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { formatMoney, toMinor, formatDate } from '../lib/format.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { Card, CardContent, Button, Input, Label, Select, Badge, Spinner, EmptyState } from '../components/ui/index.jsx';

const emptyLine = () => ({ description: '', quantity: 1, unitPrice: '' });
const idOf = (x) => String(x?._id || x?.id || '');
const STATUS_TONE = { draft: 'default', sent: 'primary', accepted: 'success', rejected: 'destructive', expired: 'warning', superseded: 'default' };
const PORTAL = import.meta.env.VITE_PORTAL_URL || 'https://app.klyro.codes';

/** Quote totals exactly like the server: subtotal → discount → tax, in minor units. */
export function quoteTotals(lines, discountPercent = 0, taxPercent = 0) {
  const items = lines
    .filter((l) => l.description.trim() && toMinor(l.unitPrice) > 0)
    .map((l) => ({
      description: l.description.trim(),
      quantity: Math.max(1, Math.round(Number(l.quantity) || 1)),
      unitAmountMinor: toMinor(l.unitPrice),
    }));
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitAmountMinor, 0);
  const discounted = Math.round(subtotal * (1 - (Number(discountPercent) || 0) / 100));
  const total = Math.round(discounted * (1 + (Number(taxPercent) || 0) / 100));
  return { items, subtotal, total };
}

export default function Quotations() {
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const dealId = params.get('deal') || '';
  const setDealId = (v) => setParams(v ? { deal: v } : {}, { replace: true });
  const [currency, setCurrency] = useState('USD');
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [validDays, setValidDays] = useState(14);
  const [lines, setLines] = useState([emptyLine()]);

  const { data: dealsData, isLoading: dealsLoading } = useQuery({
    queryKey: ['deals', 'all'],
    queryFn: () => unwrap(api.get('/admin/deals', { params: { limit: 100 } })),
  });
  const deals = (Array.isArray(dealsData) ? dealsData : dealsData?.items || []).filter((d) => !['won', 'lost'].includes(d.stage));
  const deal = deals.find((d) => idOf(d) === dealId);

  const { data: quotesData, isLoading } = useQuery({
    queryKey: ['deal-quotations', dealId],
    queryFn: () => unwrap(api.get(`/admin/deals/${dealId}/quotations`)),
    enabled: !!dealId,
  });
  const quotes = Array.isArray(quotesData) ? quotesData : quotesData?.items || [];

  const { items, subtotal, total } = quoteTotals(lines, discount, tax);
  const refresh = () => qc.invalidateQueries({ queryKey: ['deal-quotations', dealId] });

  const create = useMutation({
    // validUntil is computed at submit time (inside the mutation), not render.
    mutationFn: (days) =>
      unwrap(
        api.post(`/admin/deals/${dealId}/quotations`, {
          currency,
          items,
          discountPercent: Number(discount) || 0,
          taxPercent: Number(tax) || 0,
          validUntil: new Date(Date.now() + days * 864e5).toISOString(),
        }),
      ),
    onSuccess: () => {
      refresh();
      toast.success('Draft quotation saved — review it below, then Send');
      setLines([emptyLine()]);
    },
    onError: (e) => toast.error(e.message || 'Could not create quotation'),
  });
  const send = useMutation({
    mutationFn: (id) => unwrap(api.post(`/admin/quotations/${id}/send`)),
    onSuccess: (d) => {
      refresh();
      toast.success(d?.emailed ? 'Quotation emailed to the client' : 'Marked as sent — no client email on file, copy the link');
    },
    onError: (e) => toast.error(e.message || 'Send failed'),
  });

  const updateLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const copyLink = async (id) => {
    const url = `${PORTAL}/quotes/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Client link copied');
    } catch {
      toast.error(url);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Quotations" description="Build a quote for a deal, send it, and the client accepts it in their portal." />

      <Card>
        <CardContent className="space-y-5 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="deal">Deal</Label>
              <Select id="deal" value={dealId} onChange={(e) => setDealId(e.target.value)} disabled={dealsLoading}>
                <option value="">{dealsLoading ? 'Loading…' : deals.length ? 'Choose a deal…' : 'No open deals yet'}</option>
                {deals.map((d) => (
                  <option key={idOf(d)} value={idOf(d)}>
                    {d.title || 'Untitled deal'} · {d.stage}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="currency">Currency</Label>
              <Select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {deal && !deal.clientUserId && (
            <p className="rounded-lg border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-200">
              This deal has no client portal account yet. You can still send the quote — the client can register at
              the portal with the same email and it will appear for them once linked on the Deals board.
            </p>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="mb-0">Line items</Label>
              <Button size="sm" variant="secondary" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
                <Plus size={14} aria-hidden="true" /> Add line
              </Button>
            </div>
            <div className="space-y-3">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 items-end gap-2">
                  <div className="col-span-12 sm:col-span-6">
                    <Label htmlFor={`d${i}`} className="sr-only">
                      Description
                    </Label>
                    <Input id={`d${i}`} placeholder="e.g. Website redesign" value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <Label htmlFor={`q${i}`} className="text-xs">
                      Qty
                    </Label>
                    <Input id={`q${i}`} type="number" min="1" inputMode="numeric" value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
                  </div>
                  <div className="col-span-7 sm:col-span-3">
                    <Label htmlFor={`p${i}`} className="text-xs">
                      Unit price ({currency})
                    </Label>
                    <Input id={`p${i}`} type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: e.target.value })} />
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove line ${i + 1}`}
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : [emptyLine()]))}
                    className="col-span-2 grid h-11 place-items-center rounded-lg text-muted-foreground hover:text-destructive sm:col-span-1"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:max-w-md">
            <div>
              <Label htmlFor="disc" className="text-xs">
                Discount %
              </Label>
              <Input id="disc" type="number" min="0" max="100" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="tax" className="text-xs">
                Tax %
              </Label>
              <Input id="tax" type="number" min="0" max="100" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="valid" className="text-xs">
                Valid (days)
              </Label>
              <Input id="valid" type="number" min="1" inputMode="numeric" value={validDays} onChange={(e) => setValidDays(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <span className="text-muted-foreground">Subtotal {formatMoney(subtotal, currency)} · </span>
              <span className="font-semibold">Total {formatMoney(total, currency)}</span>
            </div>
            <Button disabled={!dealId || !items.length || create.isPending} onClick={() => create.mutate(Number(validDays) || 14)}>
              {create.isPending ? 'Saving…' : 'Save draft quote'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {dealId && (
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-4 text-lg font-semibold">Quotes for {deal?.title || 'this deal'}</h3>
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : quotes.length === 0 ? (
              <EmptyState title="No quotations yet" hint="Add line items above and save a draft." />
            ) : (
              <ul className="space-y-2">
                {quotes.map((q) => {
                  const qid = idOf(q);
                  return (
                    <li key={qid} className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium">
                          v{q.version ?? 1} · {formatMoney(q.totalMinor ?? 0, q.currency || 'USD')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(q.items || []).length} item{(q.items || []).length === 1 ? '' : 's'}
                          {q.validUntil ? ` · valid until ${formatDate(q.validUntil)}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={STATUS_TONE[q.status] || 'default'}>{q.status || 'draft'}</Badge>
                        {['draft', 'sent'].includes(q.status) && (
                          <Button size="sm" onClick={() => send.mutate(qid)} disabled={send.isPending && send.variables === qid}>
                            <Send size={14} aria-hidden="true" /> {q.status === 'draft' ? 'Send' : 'Resend'}
                          </Button>
                        )}
                        <Button size="sm" variant="secondary" onClick={() => copyLink(qid)} aria-label="Copy client link">
                          <Copy size={14} aria-hidden="true" /> Link
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
