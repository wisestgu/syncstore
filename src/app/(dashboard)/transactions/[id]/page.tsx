'use client';

import Link from 'next/link';
import { use } from 'react';
import { getTransaction } from '@/lib/api/endpoints';
import { useLiveQuery } from '@/lib/api/hooks';
import { daysOverdue, formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { Card, PageHeader, QueryBoundary, StatCard, Table, Td, Th } from '@/components/ui';
import { TransactionBadge } from '@/components/status';

export default function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useLiveQuery(() => getTransaction(id), [id]);

  return (
    <QueryBoundary query={query}>
      {(t) => {
        const outstanding = t.amountMinor - t.amountPaidMinor - t.amountCreditedMinor;
        const settledPct =
          t.amountMinor > 0 ? ((t.amountPaidMinor + t.amountCreditedMinor) / t.amountMinor) * 100 : 0;
        const overdueDays = outstanding > 0 ? daysOverdue(t.dueDate) : 0;
        return (
          <>
            <PageHeader
              title={
                <span className="flex items-center gap-2.5">
                  {t.invoiceRef ?? `Transaction ${t.id.slice(0, 8)}`}
                  <TransactionBadge status={t.displayStatus} />
                </span>
              }
              sub={
                <>
                  {t.customerName && (
                    <Link href={`/customers/${t.customerId}`} className="font-medium hover:underline">
                      {t.customerName}
                    </Link>
                  )}
                  {' · '}Issued {formatDate(t.issuedAt)} · Due {formatDate(t.dueDate)} ({t.termsDays}-day
                  terms)
                  {overdueDays > 0 && (
                    <span className="tnum ml-1 font-medium text-rose-600">
                      · {overdueDays} days overdue
                    </span>
                  )}
                </>
              }
            />

            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Invoice amount" value={formatMoney(t.amountMinor)} />
              <StatCard label="Paid" value={formatMoney(t.amountPaidMinor)} tone="positive" />
              <StatCard
                label="Credited"
                value={formatMoney(t.amountCreditedMinor)}
                sub="Credit notes / adjustments"
              />
              <StatCard
                label="Outstanding"
                value={formatMoney(outstanding)}
                tone={outstanding > 0 ? (overdueDays > 0 ? 'danger' : 'warning') : 'positive'}
              />
            </div>

            <Card className="mb-4">
              <div className="mb-1.5 flex justify-between text-xs text-slate-500">
                <span>Settlement progress</span>
                <span className="tnum">{settledPct.toFixed(0)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full ${settledPct >= 100 ? 'bg-emerald-500' : 'bg-sky-500'}`}
                  style={{ width: `${Math.min(100, settledPct)}%` }}
                />
              </div>
            </Card>

            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Card title="Line items" padded={false}>
                {!t.lineItems || t.lineItems.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">No itemised lines on this invoice.</p>
                ) : (
                  <Table
                    head={
                      <>
                        <Th>Description</Th>
                        <Th right>Qty</Th>
                        <Th right>Unit</Th>
                        <Th right>Total</Th>
                      </>
                    }
                  >
                    {t.lineItems.map((li, i) => (
                      <tr key={li.id ?? i}>
                        <Td>{li.description}</Td>
                        <Td right>{li.qty}</Td>
                        <Td right>{formatMoney(li.unitPriceMinor)}</Td>
                        <Td right className="font-medium">
                          {formatMoney(li.lineTotalMinor)}
                        </Td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Card>

              <Card title="Payment history" padded={false}>
                {!t.allocations || t.allocations.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">No payments allocated yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {t.allocations.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div>
                          <div className="text-sm text-slate-800">
                            {a.reversesAllocationId ? 'Allocation reversed' : 'Payment allocated'}
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatDateTime(a.createdAt)}
                            {a.createdBy && ` · by ${a.createdBy}`}
                          </div>
                        </div>
                        <span
                          className={`tnum text-sm font-medium ${
                            a.reversesAllocationId ? 'text-rose-600' : 'text-emerald-700'
                          }`}
                        >
                          {a.reversesAllocationId ? '−' : ''}
                          {formatMoney(a.amountMinor)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        );
      }}
    </QueryBoundary>
  );
}
