import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { CURRENCIES } from '@klyro/shared/enums';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { formatMoney, toMinor } from '../lib/format.js';
import { PageHeader } from '../components/PageHeader.jsx';
import {
  Card,
  CardContent,
  Button,
  Input,
  Label,
  Select,
  Badge,
  Spinner,
  EmptyState,
} from '../components/ui/index.jsx';

const emptyLine = () => ({ description: '', qty: 1, unitPrice: '' });

export default function Quotations() {
  const qc = useQueryClient();
  const toast = useToast();
  const [dealId, setDealId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [lines, setLines] = useState([emptyLine()]);

  // Deals list to pick from.
  const { data: dealsData } = useQuery({
    queryKey: ['deals'],
    queryFn: () => unwrap(api.get('/admin/deals')),
  });
  const deals = Array.isArray(dealsData) ? dealsData : dealsData?.items || [];

  const { data: quotesData, isLoading } = useQuery({
    queryKey: ['deal-quotations', dealId],
    queryFn: () => unwrap(api.get(`/admin/deals/${dealId}/quotations`)),
    enabled: !!dealId,
  });
  const quotes = Array.isArray(quotesData) ? quotesData : quotesData?.items || [];

  // Client-side totals in minor units.
  const lineItems = lines.map((l) => ({
    description: l.description,
    qty: Number(l.qty) || 0,
    unitPrice: toMinor(l.unitPrice),
  }));
  const subtotal = lineItems.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);

  const create = useMutation({
    mutationFn: () =>
      unwrap(
        api.post(`/admin/deals/${dealId}/quotations`, {
          currency,
          lineItems,
          subtotal,
          total: subtotal,
        })
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deal-quotations', dealId] });
      toast.success('Quotation created');
      setLines([emptyLine()]);
    },
    onError: (e) => toast.error(e.message || 'Create failed'),
  });

  const updateLine = (i, patch) => {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };

  return (
    <div>
      <PageHeader
        title="Quotations"
        description="Build quotes under a deal. Totals computed in minor units."
      />

      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="deal">Deal</Label>
              <Select
                id="deal"
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
              >
                <option value="">Select a deal…</option>
                {deals.map((d) => (
                  <option key={d._id || d.id} value={d._id || d.id}>
                    {d.title || d.companyName || d.name || d._id || d.id}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="cur">Currency</Label>
              <Select
                id="cur"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <Label className="mb-0">Line items</Label>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setLines([...lines, emptyLine()])}
              >
                <Plus size={14} /> Add line
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 items-center gap-2">
                  <Input
                    className="col-span-6"
                    placeholder="Description"
                    value={l.description}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                  />
                  <Input
                    className="col-span-2"
                    type="number"
                    min="0"
                    placeholder="Qty"
                    value={l.qty}
                    onChange={(e) => updateLine(i, { qty: e.target.value })}
                  />
                  <Input
                    className="col-span-3"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Unit price"
                    value={l.unitPrice}
                    onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label="Remove line"
                    onClick={() =>
                      setLines(lines.length > 1 ? lines.filter((_, j) => j !== i) : lines)
                    }
                    className="col-span-1 grid h-10 place-items-center cursor-pointer text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-heading text-xl font-semibold">
                {formatMoney(subtotal, currency)}
              </span>
            </div>

            <Button
              className="mt-4"
              disabled={!dealId || create.isPending || subtotal <= 0}
              onClick={() => create.mutate()}
            >
              {create.isPending ? 'Creating…' : 'Create quotation'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {dealId && (
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-4 font-heading text-lg font-semibold">
              Existing quotations
            </h3>
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : quotes.length === 0 ? (
              <EmptyState title="No quotations for this deal" />
            ) : (
              <ul className="space-y-2">
                {quotes.map((q) => (
                  <li
                    key={q._id || q.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {formatMoney(q.total ?? q.subtotal ?? 0, q.currency || 'USD')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(q.lineItems || []).length} line items
                      </p>
                    </div>
                    <Badge>{q.status || 'draft'}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
