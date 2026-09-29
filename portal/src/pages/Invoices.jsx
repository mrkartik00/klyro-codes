import { useInvoices } from '../hooks/usePortalData.js';
import {
  Card,
  EmptyState,
  Spinner,
  StatusBadge,
} from '../components/ui/index.jsx';
import { formatDate, formatMoney } from '../lib/utils.js';

export default function Invoices() {
  const { data, isLoading, isError } = useInvoices();
  const list = Array.isArray(data) ? data : [];

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Invoices</h1>
      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <EmptyState title="Could not load invoices" description="Try again later." />
      ) : list.length === 0 ? (
        <EmptyState title="No invoices yet" />
      ) : (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm [&_th]:whitespace-nowrap">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-muted-foreground)]">
                <th className="p-3 font-medium">Invoice</th>
                <th className="p-3 font-medium">Issued</th>
                <th className="p-3 text-right font-medium">Amount</th>
                <th className="p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((inv) => (
                <tr
                  key={inv._id || inv.id}
                  className="border-b border-[var(--color-border)] last:border-0"
                >
                  <td className="p-3 font-medium">
                    {inv.number || inv.reference || inv._id || inv.id}
                  </td>
                  <td className="p-3 text-[var(--color-muted-foreground)]">
                    {formatDate(inv.issuedAt || inv.createdAt)}
                  </td>
                  <td className="p-3 text-right">
                    {formatMoney(
                      inv.amount ?? inv.total ?? 0,
                      inv.currency || 'USD'
                    )}
                  </td>
                  <td className="p-3">
                    <StatusBadge status={inv.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
