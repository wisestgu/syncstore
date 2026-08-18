'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { listTransactions } from '@/lib/api/endpoints';
import { useLiveQuery } from '@/lib/api/hooks';
import { daysOverdue, formatDate, formatMoney } from '@/lib/format';
import { Card, Input, PageHeader, QueryBoundary, Select, Table, Td, Th } from '@/components/ui';
import { TransactionBadge } from '@/components/status';

export default function TransactionsPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const query = useLiveQuery(() => listTransactions({ q, status: status || undefined }), [q, status]);

  return (
    <>
      <PageHeader
        title="Transactions"
        sub="Credit sales and their settlement state."
        actions={
          <Link
            href="/transactions/new"
            className="inline-flex items-center rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            New transaction
          </Link>
        }
      />
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search invoice or customer…"
            className="max-w-xs"
            aria-label="Search transactions"
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-44"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="PARTIALLY_PAID">Partially paid</option>
            <option value="SETTLED">Settled</option>
            <option value="DISPUTED">Disputed</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </div>
        <QueryBoundary
          query={query}
          empty={{
            when: (d) => d.items.length === 0,
            title: q || status ? 'Nothing matches these filters' : 'No transactions yet',
            hint: q || status ? undefined : 'Record a credit sale to get started.',
          }}
        >
          {(d) => (
            <Table
              head={
                <>
                  <Th>Invoice</Th>
                  <Th>Customer</Th>
                  <Th>Issued</Th>
                  <Th>Due</Th>
                  <Th right>Amount</Th>
                  <Th right>Paid</Th>
                  <Th right>Outstanding</Th>
                  <Th>Status</Th>
                </>
              }
            >
              {d.items.map((t) => {
                const outstanding = t.amountMinor - t.amountPaidMinor - t.amountCreditedMinor;
                const overdue = outstanding > 0 && daysOverdue(t.dueDate) > 0;
                return (
                  <tr
                    key={t.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(`/transactions/${t.id}`)}
                  >
                    <Td>
                      <span className="font-medium text-slate-900">
                        {t.invoiceRef ?? t.id.slice(0, 8)}
                      </span>
                    </Td>
                    <Td>
                      {t.customerName ? (
                        <Link
                          href={`/customers/${t.customerId}`}
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {t.customerName}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td>{formatDate(t.issuedAt)}</Td>
                    <Td className={overdue ? 'font-medium text-rose-600' : ''}>
                      {formatDate(t.dueDate)}
                      {overdue && <span className="tnum ml-1 text-xs">+{daysOverdue(t.dueDate)}d</span>}
                    </Td>
                    <Td right>{formatMoney(t.amountMinor)}</Td>
                    <Td right className="text-emerald-700">
                      {t.amountPaidMinor > 0 ? formatMoney(t.amountPaidMinor) : '—'}
                    </Td>
                    <Td right className={outstanding > 0 ? 'font-semibold' : 'text-slate-400'}>
                      {formatMoney(outstanding)}
                    </Td>
                    <Td>
                      <TransactionBadge status={t.displayStatus} />
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </QueryBoundary>
      </Card>
    </>
  );
}
