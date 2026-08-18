'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { listExceptions } from '@/lib/api/endpoints';
import { useLiveQuery } from '@/lib/api/hooks';
import { formatDate, formatMoney, humanize, timeAgo } from '@/lib/format';
import { Card, PageHeader, QueryBoundary, Select, Table, Td, Th } from '@/components/ui';
import { ExceptionBadge } from '@/components/status';

export default function DisputesPage() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const query = useLiveQuery(
    () => listExceptions({ status: status || undefined, type: type || undefined }),
    [status, type],
  );

  return (
    <>
      <PageHeader
        title="Disputes"
        sub="Exceptions raised against transactions and payments — every resolution is a new ledger event, never an edit."
      />
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44" aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="UNDER_REVIEW">Under review</option>
            <option value="RESOLVED_UPHELD">Resolved — upheld</option>
            <option value="RESOLVED_REJECTED">Resolved — rejected</option>
            <option value="WITHDRAWN">Withdrawn</option>
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-44" aria-label="Filter by type">
            <option value="">All types</option>
            <option value="SHORT_DELIVERY">Short delivery</option>
            <option value="DAMAGED">Damaged</option>
            <option value="WRONG_QTY">Wrong quantity</option>
            <option value="AMBIGUOUS_PAYMENT">Ambiguous payment</option>
            <option value="OTHER">Other</option>
          </Select>
        </div>
        <QueryBoundary
          query={query}
          empty={{
            when: (d) => d.items.length === 0,
            title: status || type ? 'No disputes match these filters' : 'No disputes raised',
            hint: status || type ? undefined : 'When a customer disputes a delivery or payment, it appears here.',
          }}
        >
          {(d) => (
            <Table
              head={
                <>
                  <Th>Customer</Th>
                  <Th>Type</Th>
                  <Th>Against</Th>
                  <Th right>Claimed</Th>
                  <Th>Opened</Th>
                  <Th>Status</Th>
                </>
              }
            >
              {d.items.map((ex) => (
                <tr
                  key={ex.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => router.push(`/disputes/${ex.id}`)}
                >
                  <Td>
                    <Link
                      href={`/disputes/${ex.id}`}
                      className="font-medium text-slate-900 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {ex.customerName ?? ex.customerId.slice(0, 8)}
                    </Link>
                    <div className="max-w-56 truncate text-xs text-slate-500">{ex.reason}</div>
                  </Td>
                  <Td>{humanize(ex.type)}</Td>
                  <Td mono>{ex.invoiceRef ?? (ex.paymentId ? 'payment' : '—')}</Td>
                  <Td right>
                    {ex.claimedAmountMinor !== undefined ? formatMoney(ex.claimedAmountMinor) : '—'}
                  </Td>
                  <Td>
                    <span title={formatDate(ex.openedAt)}>{timeAgo(ex.openedAt)}</span>
                  </Td>
                  <Td>
                    <ExceptionBadge status={ex.status} />
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </QueryBoundary>
      </Card>
    </>
  );
}
