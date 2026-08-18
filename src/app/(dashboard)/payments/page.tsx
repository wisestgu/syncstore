'use client';

/**
 * Payment review — the operations queue. Matched, suggested, unmatched and
 * partial payments with the reconciliation evidence (confidence + rules
 * fired), and manual allocation for authorized users.
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { allocatePayment, listCustomers, listPayments, listTransactions } from '@/lib/api/endpoints';
import { useLiveQuery, useQuery } from '@/lib/api/hooks';
import type { Payment, Transaction } from '@/lib/api/types';
import {
  daysOverdue,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPercent,
  parseMoneyToMinor,
} from '@/lib/format';
import {
  Button,
  Card,
  Field,
  FormError,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  QueryBoundary,
  Select,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { Badge, PaymentBadge } from '@/components/status';
import { Tabs, useTabs } from '@/components/tabs';

const REVIEW_STATUSES = new Set(['UNMATCHED', 'SUGGESTED', 'PARTIALLY_ALLOCATED']);

function ConfidenceCell({ payment }: { payment: Payment }) {
  const r = payment.reconciliation;
  if (!r) return <span className="text-xs text-slate-400">—</span>;
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="tnum text-sm font-medium text-slate-800">{formatPercent(r.confidence)}</span>
        {r.candidateCustomerName && (
          <span className="truncate text-xs text-slate-500">→ {r.candidateCustomerName}</span>
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-1">
        {r.rulesFired.map((rule) => (
          <span key={rule} className="rounded bg-slate-100 px-1 py-px font-mono text-[10px] text-slate-500">
            {rule}
          </span>
        ))}
      </div>
    </div>
  );
}

function openAmount(t: Transaction) {
  return t.amountMinor - t.amountPaidMinor - t.amountCreditedMinor;
}

function AllocateModal({
  payment,
  onClose,
  onDone,
}: {
  payment: Payment;
  onClose: () => void;
  onDone: () => void;
}) {
  const customers = useQuery(() => listCustomers());
  const [customerId, setCustomerId] = useState(
    payment.customerId ?? payment.reconciliation?.candidateCustomerId ?? '',
  );
  const transactions = useQuery(
    () =>
      customerId
        ? listTransactions({ customerId })
        : Promise.resolve({ items: [] as Transaction[] }),
    [customerId],
  );
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const remainingToAllocate = payment.amountMinor - payment.allocatedMinor;

  const openTxns = useMemo(
    () =>
      (transactions.data?.items ?? [])
        .filter((t) => openAmount(t) > 0 && t.status !== 'CANCELLED')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.issuedAt.localeCompare(b.issuedAt)),
    [transactions.data],
  );

  const totalEntered = openTxns.reduce((sum, t) => {
    const v = amounts[t.id];
    if (!v) return sum;
    const minor = parseMoneyToMinor(v);
    return minor === null ? sum : sum + minor;
  }, 0);

  const autoFillFifo = () => {
    let left = remainingToAllocate;
    const next: Record<string, string> = {};
    for (const t of openTxns) {
      if (left <= 0) break;
      const take = Math.min(left, openAmount(t));
      next[t.id] = (take / 100).toFixed(2);
      left -= take;
    }
    setAmounts(next);
  };

  const submit = async () => {
    const allocations: { transactionId: string; amountMinor: number }[] = [];
    for (const t of openTxns) {
      const v = amounts[t.id];
      if (!v || v.trim() === '') continue;
      const minor = parseMoneyToMinor(v);
      if (minor === null) {
        setFormError(`Invalid amount for ${t.invoiceRef ?? t.id.slice(0, 8)}`);
        return;
      }
      if (minor > openAmount(t)) {
        setFormError(`Amount for ${t.invoiceRef ?? t.id.slice(0, 8)} exceeds its outstanding balance`);
        return;
      }
      allocations.push({ transactionId: t.id, amountMinor: minor });
    }
    if (!customerId) {
      setFormError('Choose a customer');
      return;
    }
    if (allocations.length === 0) {
      setFormError('Enter at least one allocation amount');
      return;
    }
    if (totalEntered > remainingToAllocate) {
      setFormError('Allocations exceed the unallocated amount of this payment');
      return;
    }
    setBusy(true);
    setFormError(undefined);
    try {
      await allocatePayment(payment.id, { customerId, allocations });
      onDone();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Allocation failed');
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Allocate payment" wide>
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm">
        <span>
          Payment <span className="tnum font-semibold">{formatMoney(payment.amountMinor)}</span>
        </span>
        <span>
          Unallocated{' '}
          <span className="tnum font-semibold text-amber-700">{formatMoney(remainingToAllocate)}</span>
        </span>
        {payment.narration && (
          <span className="w-full truncate text-xs text-slate-500">“{payment.narration}”</span>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Field label="Customer">
          <Select
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setAmounts({});
              setFormError(undefined);
            }}
          >
            <option value="">
              {customers.initialLoading ? 'Loading…' : 'Select customer…'}
            </option>
            {(customers.data?.items ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.id === payment.reconciliation?.candidateCustomerId ? ' (suggested)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        {customerId &&
          (transactions.initialLoading ? (
            <LoadingState label="Loading open transactions…" />
          ) : openTxns.length === 0 ? (
            <p className="text-sm text-slate-500">
              This customer has no open transactions. Any allocation remainder becomes unapplied
              credit on their account.
            </p>
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Open transactions</span>
                <Button type="button" variant="secondary" className="!px-2.5 !py-1 text-xs" onClick={autoFillFifo}>
                  Auto-fill oldest first
                </Button>
              </div>
              <Table
                head={
                  <>
                    <Th>Invoice</Th>
                    <Th>Due</Th>
                    <Th right>Outstanding</Th>
                    <Th right>Allocate (₦)</Th>
                  </>
                }
              >
                {openTxns.map((t) => (
                  <tr key={t.id}>
                    <Td>{t.invoiceRef ?? t.id.slice(0, 8)}</Td>
                    <Td className={daysOverdue(t.dueDate) > 0 ? 'text-rose-600' : ''}>
                      {formatDate(t.dueDate)}
                    </Td>
                    <Td right>{formatMoney(openAmount(t))}</Td>
                    <Td right>
                      <Input
                        value={amounts[t.id] ?? ''}
                        onChange={(e) => setAmounts((a) => ({ ...a, [t.id]: e.target.value }))}
                        inputMode="decimal"
                        className="!w-28 text-right"
                        aria-label={`Allocation for ${t.invoiceRef ?? t.id}`}
                      />
                    </Td>
                  </tr>
                ))}
              </Table>
              <div className="mt-2 flex justify-end gap-4 text-sm">
                <span className="text-slate-500">
                  Entered: <span className="tnum font-medium text-slate-900">{formatMoney(totalEntered)}</span>
                </span>
                <span className="text-slate-500">
                  Remaining after:{' '}
                  <span
                    className={`tnum font-medium ${
                      remainingToAllocate - totalEntered === 0 ? 'text-emerald-700' : 'text-slate-900'
                    }`}
                  >
                    {formatMoney(Math.max(0, remainingToAllocate - totalEntered))}
                  </span>
                </span>
              </div>
            </div>
          ))}

        <FormError message={formError} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} busy={busy} disabled={!customerId}>
            Allocate
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function PaymentsPage() {
  const tabs = useTabs('review');
  const query = useLiveQuery(() => listPayments());
  const [allocating, setAllocating] = useState<Payment | null>(null);

  return (
    <>
      <PageHeader
        title="Payment review"
        sub="Incoming payments, how they were matched, and what needs a human decision."
      />
      <Card padded={false}>
        <QueryBoundary
          query={query}
          empty={{
            when: (d) => d.items.length === 0,
            title: 'No payments received yet',
            hint: 'Payments arriving through the webhook will appear here in real time.',
          }}
        >
          {(d) => {
            const review = d.items.filter((p) => REVIEW_STATUSES.has(p.matchStatus));
            const matched = d.items.filter((p) => p.matchStatus === 'MATCHED');
            const shown =
              tabs.active === 'review' ? review : tabs.active === 'matched' ? matched : d.items;
            return (
              <>
                <div className="px-3 pt-1">
                  <Tabs
                    tabs={[
                      { key: 'review', label: 'Needs review', badge: review.length },
                      { key: 'matched', label: 'Matched', badge: matched.length },
                      { key: 'all', label: 'All payments', badge: d.items.length },
                    ]}
                    active={tabs.active}
                    onChange={tabs.setActive}
                  />
                </div>
                {shown.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">
                    {tabs.active === 'review'
                      ? 'Queue is clear — every payment is fully allocated.'
                      : 'Nothing here yet.'}
                  </p>
                ) : (
                  <Table
                    head={
                      <>
                        <Th>Received</Th>
                        <Th>Customer</Th>
                        <Th right>Amount</Th>
                        <Th right>Allocated</Th>
                        <Th>Match & why</Th>
                        <Th>Reference</Th>
                        <Th>Status</Th>
                        <Th />
                      </>
                    }
                  >
                    {shown.map((p) => (
                      <tr key={p.id} className="row-in hover:bg-slate-50">
                        <Td>
                          <span className="whitespace-nowrap">{formatDateTime(p.occurredAt)}</span>
                        </Td>
                        <Td>
                          {p.customerId && p.customerName ? (
                            <Link href={`/customers/${p.customerId}`} className="hover:underline">
                              {p.customerName}
                            </Link>
                          ) : (
                            <Badge tone="slate" label="Unassigned" />
                          )}
                        </Td>
                        <Td right className="font-medium">
                          {formatMoney(p.amountMinor)}
                        </Td>
                        <Td right className={p.allocatedMinor < p.amountMinor ? 'text-amber-700' : ''}>
                          {formatMoney(p.allocatedMinor)}
                        </Td>
                        <Td>
                          <ConfidenceCell payment={p} />
                        </Td>
                        <Td mono>
                          <div className="max-w-44 truncate" title={p.narration ?? undefined}>
                            {p.externalRef ?? p.payerRef ?? '—'}
                            {p.narration && (
                              <div className="truncate text-[10px] text-slate-400">{p.narration}</div>
                            )}
                          </div>
                        </Td>
                        <Td>
                          <PaymentBadge status={p.matchStatus} />
                        </Td>
                        <Td>
                          {REVIEW_STATUSES.has(p.matchStatus) && (
                            <Button
                              variant="secondary"
                              className="!px-2.5 !py-1 text-xs"
                              onClick={() => setAllocating(p)}
                            >
                              {p.matchStatus === 'SUGGESTED' ? 'Review' : 'Allocate'}
                            </Button>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </Table>
                )}
              </>
            );
          }}
        </QueryBoundary>
      </Card>
      {allocating && (
        <AllocateModal
          payment={allocating}
          onClose={() => setAllocating(null)}
          onDone={() => {
            setAllocating(null);
            query.reload();
          }}
        />
      )}
    </>
  );
}
