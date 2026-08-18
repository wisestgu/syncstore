'use client';

/**
 * Customer detail — balance, credit limit, Trust Score with full factor
 * breakdown, transaction timeline, payments, disputes and statement.
 */
import Link from 'next/link';
import { use } from 'react';
import {
  getCustomer,
  getCustomerStatement,
  getCustomerTimeline,
  listAlerts,
  listExceptions,
  listPayments,
  listTransactions,
} from '@/lib/api/endpoints';
import { useLiveQuery } from '@/lib/api/hooks';
import type { Customer, TrustSummary } from '@/lib/api/types';
import {
  daysOverdue,
  formatDate,
  formatDateTime,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  humanize,
} from '@/lib/format';
import { Card, PageHeader, QueryBoundary, StatCard, Table, Td, Th } from '@/components/ui';
import {
  Badge,
  ExceptionBadge,
  PaymentBadge,
  SeverityBadge,
  TransactionBadge,
  TrustPill,
  bandMeta,
} from '@/components/status';
import { Tabs, useTabs } from '@/components/tabs';

function TrustBreakdown({ trust }: { trust?: TrustSummary }) {
  if (!trust) {
    return <p className="text-sm text-slate-500">No behavioural data computed yet.</p>;
  }
  if (trust.status === 'INSUFFICIENT_HISTORY') {
    const p = trust.progress;
    return (
      <div className="text-sm text-slate-600">
        <p className="font-medium text-slate-800">Building history — no score yet.</p>
        {p && (
          <ul className="mt-2 space-y-1 text-xs">
            <li>
              Transactions: <span className="tnum font-medium">{p.transactions}</span> of{' '}
              <span className="tnum">{p.requiredTransactions}</span> required
            </li>
            <li>
              Tenure: <span className="tnum font-medium">{p.tenureDays}</span> of{' '}
              <span className="tnum">{p.requiredTenureDays}</span> days required
            </li>
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">
          A score is only computed once there is enough repayment history to be meaningful.
        </p>
      </div>
    );
  }

  const band = trust.band ? bandMeta[trust.band] : undefined;
  return (
    <div>
      <div className="mb-4 flex items-end gap-3">
        <span className="tnum text-4xl font-semibold text-slate-900">{trust.score}</span>
        {band && <Badge tone={band.tone} label={band.label} />}
        {trust.previous && trust.score !== undefined && (
          <span
            className={`tnum text-sm font-medium ${
              trust.score >= trust.previous.score ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {trust.score >= trust.previous.score ? '▲' : '▼'}{' '}
            {Math.abs(trust.score - trust.previous.score)} since {formatDate(trust.previous.computedAt)}
          </span>
        )}
      </div>
      <div className="space-y-3">
        {(trust.factors ?? []).map((f) => (
          <div key={f.key}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-slate-800">
                {f.label}{' '}
                <span className="text-xs font-normal text-slate-400">({formatPercent(f.weight)})</span>
              </span>
              <span className="tnum text-slate-600">
                {f.subscore}/100 · +{f.weightedContribution.toFixed(1)}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full ${f.subscore >= 70 ? 'bg-emerald-500' : f.subscore >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${f.subscore}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">{f.explanation}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-slate-400">
        Illustrative MVP weighting, computed from this ledger only. A behavioural signal — not a
        credit-bureau score and not an automatic lending decision.
      </p>
    </div>
  );
}

function TransactionsTab({ customerId }: { customerId: string }) {
  const query = useLiveQuery(() => listTransactions({ customerId }), [customerId]);
  return (
    <QueryBoundary query={query} empty={{ when: (d) => d.items.length === 0, title: 'No transactions yet' }}>
      {(d) => (
        <Table
          head={
            <>
              <Th>Invoice</Th>
              <Th>Issued</Th>
              <Th>Due</Th>
              <Th right>Amount</Th>
              <Th right>Outstanding</Th>
              <Th>Status</Th>
            </>
          }
        >
          {d.items.map((t) => {
            const outstanding = t.amountMinor - t.amountPaidMinor - t.amountCreditedMinor;
            const overdue = outstanding > 0 && daysOverdue(t.dueDate) > 0;
            return (
              <tr key={t.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/transactions/${t.id}`} className="font-medium text-slate-900 hover:underline">
                    {t.invoiceRef ?? t.id.slice(0, 8)}
                  </Link>
                </Td>
                <Td>{formatDate(t.issuedAt)}</Td>
                <Td className={overdue ? 'text-rose-600' : ''}>
                  {formatDate(t.dueDate)}
                  {overdue && <span className="tnum ml-1 text-xs">+{daysOverdue(t.dueDate)}d</span>}
                </Td>
                <Td right>{formatMoney(t.amountMinor)}</Td>
                <Td right className={outstanding > 0 ? 'font-medium' : 'text-slate-400'}>
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
  );
}

function PaymentsTab({ customerId }: { customerId: string }) {
  const query = useLiveQuery(() => listPayments({ customerId }), [customerId]);
  return (
    <QueryBoundary query={query} empty={{ when: (d) => d.items.length === 0, title: 'No payments yet' }}>
      {(d) => (
        <Table
          head={
            <>
              <Th>Received</Th>
              <Th>Reference</Th>
              <Th right>Amount</Th>
              <Th right>Allocated</Th>
              <Th>Status</Th>
            </>
          }
        >
          {d.items.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <Td>{formatDateTime(p.occurredAt)}</Td>
              <Td mono>{p.externalRef ?? p.payerRef ?? '—'}</Td>
              <Td right>{formatMoney(p.amountMinor)}</Td>
              <Td right>{formatMoney(p.allocatedMinor)}</Td>
              <Td>
                <PaymentBadge status={p.matchStatus} />
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </QueryBoundary>
  );
}

function DisputesTab({ customerId }: { customerId: string }) {
  const query = useLiveQuery(() => listExceptions({ customerId }), [customerId]);
  return (
    <QueryBoundary query={query} empty={{ when: (d) => d.items.length === 0, title: 'No disputes' }}>
      {(d) => (
        <ul className="divide-y divide-slate-100">
          {d.items.map((ex) => (
            <li key={ex.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <Link href={`/disputes/${ex.id}`} className="text-sm font-medium text-slate-900 hover:underline">
                  {humanize(ex.type)}
                  {ex.invoiceRef && <span className="text-slate-500"> · {ex.invoiceRef}</span>}
                </Link>
                <p className="truncate text-xs text-slate-500">{ex.reason}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {ex.claimedAmountMinor !== undefined && (
                  <span className="tnum text-sm text-slate-700">{formatMoney(ex.claimedAmountMinor)}</span>
                )}
                <ExceptionBadge status={ex.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </QueryBoundary>
  );
}

function TimelineTab({ customerId }: { customerId: string }) {
  const query = useLiveQuery(() => getCustomerTimeline(customerId), [customerId]);
  return (
    <QueryBoundary query={query} empty={{ when: (d) => d.items.length === 0, title: 'No ledger events yet' }}>
      {(d) => (
        <ol className="relative ml-2 space-y-4 border-l border-slate-200 pl-5">
          {d.items.map((ev) => (
            <li key={ev.seq} className="relative">
              <span className="absolute top-1.5 -left-[26px] size-2.5 rounded-full border-2 border-white bg-slate-400" />
              <div className="text-sm font-medium text-slate-800">{ev.summary ?? humanize(ev.type)}</div>
              <div className="text-xs text-slate-500">
                {formatDateTime(ev.occurredAt)} · <span className="font-mono">{ev.type}</span> ·{' '}
                <span className="tnum">#{ev.seq}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </QueryBoundary>
  );
}

function StatementTab({ customerId }: { customerId: string }) {
  const query = useLiveQuery(() => getCustomerStatement(customerId), [customerId]);
  return (
    <QueryBoundary query={query} empty={{ when: (d) => d.entries.length === 0, title: 'No statement entries' }}>
      {(d) => (
        <>
          <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
            <span>
              Opening balance:{' '}
              <span className="tnum font-medium text-slate-900">{formatMoney(d.openingBalanceMinor)}</span>
            </span>
            <span>
              Closing balance:{' '}
              <span className="tnum font-medium text-slate-900">{formatMoney(d.closingBalanceMinor)}</span>
            </span>
          </div>
          <Table
            head={
              <>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th right>Debit</Th>
                <Th right>Credit</Th>
                <Th right>Balance</Th>
              </>
            }
          >
            {d.entries.map((e, i) => (
              <tr key={i}>
                <Td>{formatDate(e.date)}</Td>
                <Td>{e.description}</Td>
                <Td right>{e.debitMinor !== undefined ? formatMoney(e.debitMinor) : ''}</Td>
                <Td right className="text-emerald-700">
                  {e.creditMinor !== undefined ? formatMoney(e.creditMinor) : ''}
                </Td>
                <Td right className="font-medium">
                  {formatMoney(e.balanceMinor)}
                </Td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </QueryBoundary>
  );
}

function CustomerAlerts({ customerId }: { customerId: string }) {
  const query = useLiveQuery(() => listAlerts({ customerId, status: 'OPEN' }), [customerId]);
  if (!query.data || query.data.items.length === 0) return null;
  return (
    <Card title="Open behavioural alerts" padded={false} className="border-amber-200">
      <ul className="divide-y divide-slate-100">
        {query.data.items.map((al) => (
          <li key={al.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-800">{humanize(al.type)}</span>
              <SeverityBadge severity={al.severity} />
            </div>
            <p className="mt-1 text-xs text-slate-600">{al.message}</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {al.factors.map((f, i) => (
                <li key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                  {f}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CustomerHeader({ customer }: { customer: Customer }) {
  const acc = customer.creditAccount;
  const utilisation =
    acc && acc.creditLimitMinor > 0 ? acc.exposureMinor / acc.creditLimitMinor : undefined;
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            {customer.name}
            {customer.status === 'INACTIVE' && <Badge tone="slate" label="Inactive" />}
          </span>
        }
        sub={
          <>
            {customer.externalRef && <span className="mr-3">Ref {customer.externalRef}</span>}
            Customer since {formatDate(customer.createdAt)}
          </>
        }
        actions={
          <Link
            href={`/transactions/new?customerId=${customer.id}`}
            className="inline-flex items-center rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            New credit transaction
          </Link>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Current balance"
          value={formatMoneyCompact(acc?.exposureMinor)}
          sub="Outstanding credit exposure"
        />
        <StatCard
          label="Credit limit"
          value={formatMoneyCompact(acc?.creditLimitMinor)}
          sub={utilisation !== undefined ? `${formatPercent(utilisation)} utilised` : undefined}
          tone={utilisation !== undefined && utilisation >= 0.9 ? 'danger' : 'default'}
        />
        <StatCard
          label="Unapplied credit"
          value={formatMoneyCompact(acc?.unappliedCreditMinor)}
          sub="Overpayments awaiting allocation"
          tone={(acc?.unappliedCreditMinor ?? 0) > 0 ? 'positive' : 'default'}
        />
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">Trust Score</div>
          <div className="mt-1.5">
            <TrustPill trust={customer.trust} />
          </div>
        </div>
      </div>
    </>
  );
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useLiveQuery(() => getCustomer(id), [id]);
  const tabs = useTabs('transactions');

  return (
    <QueryBoundary query={query}>
      {(customer) => (
        <>
          <CustomerHeader customer={customer} />
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <Card padded={false}>
                <Tabs
                  tabs={[
                    { key: 'transactions', label: 'Transactions' },
                    { key: 'payments', label: 'Payments' },
                    { key: 'disputes', label: 'Disputes', badge: customer.openExceptions },
                    { key: 'timeline', label: 'Timeline' },
                    { key: 'statement', label: 'Statement' },
                  ]}
                  active={tabs.active}
                  onChange={tabs.setActive}
                />
                <div className="p-4">
                  {tabs.active === 'transactions' && <TransactionsTab customerId={id} />}
                  {tabs.active === 'payments' && <PaymentsTab customerId={id} />}
                  {tabs.active === 'disputes' && <DisputesTab customerId={id} />}
                  {tabs.active === 'timeline' && <TimelineTab customerId={id} />}
                  {tabs.active === 'statement' && <StatementTab customerId={id} />}
                </div>
              </Card>
            </div>
            <div className="flex flex-col gap-4">
              <Card title="Trust Score breakdown">
                <TrustBreakdown trust={customer.trust} />
              </Card>
              <CustomerAlerts customerId={id} />
            </div>
          </div>
        </>
      )}
    </QueryBoundary>
  );
}
