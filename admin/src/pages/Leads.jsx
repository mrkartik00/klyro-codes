import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import { LEAD_STAGES } from '@klyro/shared/enums';
import api, { unwrap } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.jsx';
import {
  Card,
  Select,
  Input,
  Badge,
  Spinner,
  EmptyState,
} from '../components/ui/index.jsx';

const stageVariant = (stage) => {
  if (['converted', 'qualified'].includes(stage)) return 'success';
  if (['disqualified'].includes(stage)) return 'destructive';
  if (['enrolled', 'replied'].includes(stage)) return 'primary';
  return 'default';
};

export default function Leads() {
  const navigate = useNavigate();
  const [stage, setStage] = useState('');
  const [minScore, setMinScore] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['leads', stage, minScore],
    queryFn: () => {
      const params = {};
      if (stage) params.stage = stage;
      if (minScore) params.minScore = minScore;
      return unwrap(api.get('/admin/leads', { params }));
    },
  });

  const rows = useMemo(
    () => (Array.isArray(data) ? data : data?.items || data?.leads || []),
    [data]
  );

  const columns = useMemo(
    () => [
      {
        header: 'Company',
        accessorKey: 'companyName',
        cell: (info) =>
          info.getValue() || info.row.original.company || info.row.original.name || '—',
      },
      {
        header: 'Contact',
        accessorFn: (r) => r.contactName || r.email || '—',
      },
      {
        header: 'Stage',
        accessorKey: 'stage',
        cell: (info) => (
          <Badge variant={stageVariant(info.getValue())}>
            {info.getValue() || 'new'}
          </Badge>
        ),
      },
      {
        header: 'Score',
        accessorKey: 'score',
        cell: (info) => info.getValue() ?? '—',
      },
      {
        header: 'Channel',
        accessorKey: 'channel',
        cell: (info) => info.getValue() || '—',
      },
    ],
    []
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div>
      <PageHeader title="Leads" description="Prospect pipeline." />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="w-48">
          <Select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">All stages</option>
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Input
            type="number"
            placeholder="Min score"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : isError ? (
          <div className="p-5">
            <EmptyState title="Could not load leads" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No leads found" hint="Adjust filters or scrape targets." />
          </div>
        ) : (
          <div className="-mx-px overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[640px] text-sm [&_th]:whitespace-nowrap">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-border">
                    {hg.headers.map((h) => (
                      <th
                        key={h.id}
                        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => navigate(`/leads/${row.original._id || row.original.id}`)}
                    className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
