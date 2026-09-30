import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { DEAL_STAGES } from '@klyro/shared/enums';
import api, { unwrap } from '../lib/api.js';
import { useToast } from '../hooks/useToast.jsx';
import { formatMoney, classNames as cn } from '../lib/format.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { Button, Spinner, EmptyState, Input, Label, Select, Textarea, Badge } from '../components/ui/index.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { formatDate } from '../lib/format.js';

import { dealValueMinor } from '../lib/drafts.js';

function dealMoney(deal) {
  const v = dealValueMinor(deal);
  return v ? formatMoney(v.minor, v.currency) : null;
}

const dealId = (d) => d._id || d.id;

function DealCard({ deal, onMove, stages, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dealId(deal),
    data: { deal },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const value = dealMoney(deal);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-lg border border-border bg-muted/50 p-3',
        isDragging && 'relative z-10 opacity-60 shadow-lg'
      )}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle: only this element starts a drag, so touch scrolling the
            board still works everywhere else on the card. */}
        <button
          type="button"
          {...listeners}
          {...attributes}
          aria-label={`Drag ${deal.title || 'deal'}`}
          className="-m-1 grid h-9 w-7 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
        >
          <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true">
            <circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" />
            <circle cx="3" cy="8" r="1.5" /><circle cx="9" cy="8" r="1.5" />
            <circle cx="3" cy="13" r="1.5" /><circle cx="9" cy="13" r="1.5" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => onOpen(deal)} className="block w-full truncate text-left text-sm font-medium hover:underline">
            {deal.title || deal.companyName || deal.name || 'Deal'}
          </button>
          {value && <p className="mt-1 text-xs text-muted-foreground">{value}</p>}
        </div>
      </div>
      {/* Non-drag alternative (touch + keyboard + screen readers). */}
      <label className="mt-2 block">
        <span className="sr-only">Move {deal.title || 'deal'} to stage</span>
        <select
          value={deal.stage}
          onChange={(e) => onMove(deal, e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-card px-2 text-xs capitalize text-foreground focus:border-ring focus:outline-none"
        >
          {stages.map((s) => (
            <option key={s} value={s} className="capitalize">{s}</option>
          ))}
        </select>
      </label>
      {deal.stage !== 'won' && deal.stage !== 'lost' && (
        <Link
          to={`/quotations?deal=${dealId(deal)}`}
          className="mt-2 flex h-9 items-center justify-center rounded-md border border-border text-xs font-medium hover:bg-muted"
        >
          Create quote
        </Link>
      )}
    </div>
  );
}

function Column({ stage, deals, onMove, stages, onOpen }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section aria-label={`${stage} stage`} className="flex w-[78vw] max-w-[18rem] shrink-0 snap-start flex-col sm:w-72">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold capitalize">{stage}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {deals.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[200px] flex-1 flex-col gap-2 rounded-xl border border-border p-2 transition-colors',
          isOver ? 'border-accent bg-accent/5' : 'bg-card'
        )}
      >
        {deals.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">No deals</p>
        )}
        {deals.map((d) => (
          <DealCard key={dealId(d)} deal={d} onMove={onMove} stages={stages} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

/** Everything about one deal, editable. */
function DealDialog({ deal, onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const id = deal && dealId(deal);
  const [f, setF] = useState({});
  useEffect(() => {
    if (deal) {
      setF({
        title: deal.title || '',
        amount: ((deal.value?.amountMinor ?? 0) / 100).toString(),
        currency: deal.value?.currency || 'USD',
        stage: deal.stage || 'new',
        lostReason: deal.lostReason || '',
      });
    }
  }, [deal]);
  const quotes = useQuery({
    queryKey: ['deal-quotes', id],
    queryFn: () => unwrap(api.get(`/admin/deals/${id}/quotations`)),
    enabled: Boolean(id),
  });
  const save = useMutation({
    mutationFn: (body) => unwrap(api.patch(`/admin/manage/deals/${id}`, body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals-board'] });
      toast.success('Deal saved');
      onClose();
    },
    onError: (e) => toast.error(e.message || 'Save failed'),
  });
  const remove = useMutation({
    mutationFn: () => unwrap(api.delete(`/admin/manage/deals/${id}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals-board'] });
      toast.success('Deal deleted');
      onClose();
    },
    onError: (e) => toast.error(e.message || 'Delete failed'),
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const qRows = Array.isArray(quotes.data) ? quotes.data : quotes.data?.items || [];
  return (
    <Dialog open={Boolean(deal)} onClose={onClose} title="Deal" className="max-w-2xl!">
      {deal && (
        <form
          className="space-y-4 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              title: f.title.trim(),
              stage: f.stage,
              value: { amountMinor: Math.round(Number(f.amount || 0) * 100), currency: f.currency },
              ...(f.stage === 'lost' ? { lostReason: f.lostReason } : {}),
            });
          }}
        >
          <div>
            <Label htmlFor="d-title">Title</Label>
            <Input id="d-title" required value={f.title ?? ''} onChange={set('title')} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="d-amount">Value</Label>
              <Input id="d-amount" type="number" min="0" step="0.01" inputMode="decimal" value={f.amount ?? ''} onChange={set('amount')} />
            </div>
            <div>
              <Label htmlFor="d-cur">Currency</Label>
              <Select id="d-cur" value={f.currency} onChange={set('currency')}>
                {['USD', 'GBP', 'INR'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="d-stage">Stage</Label>
              <Select id="d-stage" value={f.stage} onChange={set('stage')} className="capitalize">
                {DEAL_STAGES.map((s0) => (
                  <option key={s0} value={s0}>
                    {s0}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {f.stage === 'lost' && (
            <div>
              <Label htmlFor="d-lost">Why lost</Label>
              <Textarea id="d-lost" rows={2} value={f.lostReason ?? ''} onChange={set('lostReason')} />
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {deal.leadId && (
              <Link to={`/leads/${deal.leadId?._id || deal.leadId}`} className="text-primary hover:underline">
                Open lead
              </Link>
            )}
            {deal.source && <span>Source: {deal.source}</span>}
            <span>Created {formatDate(deal.createdAt)}</span>
            {deal.clientUserId && <Badge variant="success">client portal linked</Badge>}
          </div>
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">Quotations</h3>
              <Link to={`/quotations?deal=${id}`} className="text-xs text-primary hover:underline">
                New quote
              </Link>
            </div>
            {qRows.length === 0 ? (
              <p className="text-muted-foreground">None yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {qRows.map((q) => (
                  <li key={q._id} className="flex items-center justify-between px-3 py-2">
                    <span>
                      v{q.version} · {formatMoney(q.totalMinor, q.currency)}
                    </span>
                    <Badge>{q.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => window.confirm('Delete this deal and its quotations?') && remove.mutate()} disabled={remove.isPending}>
              Delete deal
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export default function Deals() {
  const [openDeal, setOpenDeal] = useState(null);
  const qc = useQueryClient();
  const toast = useToast();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Long-press to drag on touch so the board can still be scrolled.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['deals-board'],
    queryFn: () => unwrap(api.get('/admin/deals/board')),
  });

  // Normalize board into { stage: deals[] }
  const [board, setBoard] = useState({});
  useEffect(() => {
    if (!data) return;
    const next = {};
    DEAL_STAGES.forEach((s) => (next[s] = []));
    if (Array.isArray(data)) {
      // flat deals array
      data.forEach((d) => {
        const stage = d.stage || 'new';
        (next[stage] = next[stage] || []).push(d);
      });
    } else if (data.columns) {
      data.columns.forEach((col) => {
        next[col.stage || col.id] = col.deals || col.items || [];
      });
    } else {
      // object keyed by stage
      DEAL_STAGES.forEach((s) => {
        if (Array.isArray(data[s])) next[s] = data[s];
      });
    }
    setBoard(next);
  }, [data]);

  const move = useMutation({
    mutationFn: ({ id, to }) =>
      unwrap(api.post(`/admin/deals/${id}/move`, { to })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals-board'] });
      toast.success('Deal moved');
    },
    onError: (e) => {
      toast.error(e.message || 'Move failed');
      qc.invalidateQueries({ queryKey: ['deals-board'] });
    },
  });

  // Shared optimistic move used by both drag-and-drop and the stage select.
  const moveDeal = (deal, to) => {
    const id = dealId(deal);
    const from = deal?.stage || findStage(board, id);
    if (!from || from === to) return;
    setBoard((prev) => {
      const next = { ...prev };
      next[from] = (next[from] || []).filter((d) => dealId(d) !== id);
      next[to] = [...(next[to] || []), { ...deal, stage: to }];
      return next;
    });
    move.mutate({ id, to });
  };

  const onDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;
    const deal = active.data.current?.deal;
    if (deal) moveDeal(deal, over.id);
  };

  const stages = useMemo(() => DEAL_STAGES, []);

  return (
    <div>
      <PageHeader
        title="Deals"
        description="Drag a card by its handle (long-press on touch), or change its stage from the menu."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['deals-board'] })}
          >
            Refresh
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : isError ? (
        <EmptyState title="Could not load board" />
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-4 sm:mx-0 sm:snap-none sm:gap-4 sm:px-0">
            {stages.map((stage) => (
              <Column key={stage} stage={stage} deals={board[stage] || []} onMove={moveDeal} stages={stages} onOpen={setOpenDeal} />
            ))}
          </div>
        </DndContext>
      )}
      <DealDialog deal={openDeal} onClose={() => setOpenDeal(null)} />
    </div>
  );
}

function findStage(board, id) {
  for (const [stage, deals] of Object.entries(board)) {
    if (deals.some((d) => (d._id || d.id) === id)) return stage;
  }
  return null;
}
