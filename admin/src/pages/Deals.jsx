import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  PointerSensor,
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

function DealCard({ deal }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal._id || deal.id,
    data: { deal },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'cursor-grab touch-none rounded-lg border border-border bg-muted/50 p-3 active:cursor-grabbing',
        isDragging && 'opacity-50'
      )}
    >
      <p className="text-sm font-medium">
        {deal.title || deal.companyName || deal.name || 'Deal'}
      </p>
      {deal.value != null && (
        <p className="mt-1 text-xs text-muted-foreground">
          {formatMoney(deal.value, deal.currency || 'USD')}
        </p>
      )}
    </div>
  );
}

function Column({ stage, deals }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div className="flex w-72 shrink-0 flex-col">
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
        {deals.map((d) => (
          <DealCard key={d._id || d.id} deal={d} />
        ))}
      </div>
    </div>
  );
}

export default function Deals() {
  const qc = useQueryClient();
  const toast = useToast();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
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

  const onDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;
    const to = over.id;
    const dealId = active.id;
    const deal = active.data.current?.deal;
    const from = deal?.stage || findStage(board, dealId);
    if (!from || from === to) return;

    // optimistic move
    setBoard((prev) => {
      const next = { ...prev };
      next[from] = (next[from] || []).filter(
        (d) => (d._id || d.id) !== dealId
      );
      const moved = { ...deal, stage: to };
      next[to] = [...(next[to] || []), moved];
      return next;
    });
    move.mutate({ id: dealId, to });
  };

  const stages = useMemo(() => DEAL_STAGES, []);

  return (
    <div>
      <PageHeader
        title="Deals"
        description="Drag cards between stages to update. Use keyboard-accessible buttons if needed."
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
          <div className="flex gap-4 overflow-x-auto pb-4">
            {stages.map((stage) => (
              <Column key={stage} stage={stage} deals={board[stage] || []} />
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
