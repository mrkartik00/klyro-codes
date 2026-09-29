import { useMemo, useState, useEffect } from 'react';
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
import { Button, Spinner, EmptyState } from '../components/ui/index.jsx';

import { dealValueMinor } from '../lib/drafts.js';

function dealMoney(deal) {
  const v = dealValueMinor(deal);
  return v ? formatMoney(v.minor, v.currency) : null;
}

const dealId = (d) => d._id || d.id;

function DealCard({ deal, onMove, stages }) {
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
          <p className="truncate text-sm font-medium">
            {deal.title || deal.companyName || deal.name || 'Deal'}
          </p>
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
    </div>
  );
}

function Column({ stage, deals, onMove, stages }) {
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
          <DealCard key={dealId(d)} deal={d} onMove={onMove} stages={stages} />
        ))}
      </div>
    </section>
  );
}

export default function Deals() {
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
              <Column key={stage} stage={stage} deals={board[stage] || []} onMove={moveDeal} stages={stages} />
            ))}
          </div>
        </DndContext>
      )}
    </div>
  );
}

function findStage(board, id) {
  for (const [stage, deals] of Object.entries(board)) {
    if (deals.some((d) => (d._id || d.id) === id)) return stage;
  }
  return null;
}
