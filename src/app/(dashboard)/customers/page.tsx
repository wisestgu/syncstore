'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { createCustomer, listCustomers } from '@/lib/api/endpoints';
import { useLiveQuery } from '@/lib/api/hooks';
import { formatMoneyCompact, parseMoneyToMinor, timeAgo } from '@/lib/format';
import {
  Button,
  Card,
  Field,
  FormError,
  Input,
  Modal,
  PageHeader,
  QueryBoundary,
  Select,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { Badge, TrustPill } from '@/components/status';

function UtilisationBar({ exposure, limit }: { exposure: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (exposure / limit) * 100) : 0;
  const color = pct >= 90 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="w-24">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="tnum mt-0.5 text-[11px] text-slate-500">{pct.toFixed(0)}% of limit</div>
    </div>
  );
}

function NewCustomerModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [limit, setLimit] = useState('');
  const [phone, setPhone] = useState('');
  const [bankPayerRef, setBankPayerRef] = useState('');
  const [errors, setErrors] = useState<{ name?: string; limit?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (name.trim().length < 2) errs.name = 'Customer name is required';
    const limitMinor = parseMoneyToMinor(limit);
    if (limitMinor === null) errs.limit = 'Enter a valid amount in naira';
    setErrors(errs);
    if (Object.keys(errs).length > 0 || limitMinor === null) return;

    setBusy(true);
    setFormError(undefined);
    try {
      const customer = await createCustomer({
        name: name.trim(),
        externalRef: externalRef.trim() || undefined,
        creditLimitMinor: limitMinor,
        phone: phone.trim() || undefined,
        bankPayerRef: bankPayerRef.trim() || undefined,
      });
      onCreated(customer.id);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create customer');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New customer">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Business name" error={errors.name}>
          <Input
            value={name}
            invalid={!!errors.name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Grace Retail & Trading"
            autoFocus
          />
        </Field>
        <Field label="Credit limit (₦)" error={errors.limit}>
          <Input
            value={limit}
            invalid={!!errors.limit}
            onChange={(e) => setLimit(e.target.value)}
            inputMode="decimal"
            placeholder="500,000"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone (optional)">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0803 000 0000"
            />
          </Field>
          <Field label="Your ref (optional)">
            <Input
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
              placeholder="CUST-041"
            />
          </Field>
        </div>
        <Field
          label="Bank payer reference (optional)"
          hint="Used to auto-match incoming transfers to this customer."
        >
          <Input value={bankPayerRef} onChange={(e) => setBankPayerRef(e.target.value)} />
        </Field>
        <FormError message={formError} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Create customer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function CustomersPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const query = useLiveQuery(() => listCustomers({ q, status: status || undefined }), [q, status]);

  return (
    <>
      <PageHeader
        title="Customers"
        sub="Every retailer buying on credit, with live balance and behaviour."
        actions={<Button onClick={() => setCreating(true)}>New customer</Button>}
      />
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or reference…"
            className="max-w-xs"
            aria-label="Search customers"
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-36"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </div>
        <QueryBoundary
          query={query}
          empty={{
            when: (d) => d.items.length === 0,
            title: q || status ? 'No customers match these filters' : 'No customers yet',
            hint: q || status ? undefined : 'Create your first customer to start extending credit.',
            action:
              q || status ? undefined : (
                <Button onClick={() => setCreating(true)}>New customer</Button>
              ),
          }}
        >
          {(d) => (
            <Table
              head={
                <>
                  <Th>Customer</Th>
                  <Th right>Outstanding</Th>
                  <Th>Utilisation</Th>
                  <Th>Trust Score</Th>
                  <Th>Attention</Th>
                  <Th>Last payment</Th>
                </>
              }
            >
              {d.items.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => router.push(`/customers/${c.id}`)}
                >
                  <Td>
                    <Link
                      href={`/customers/${c.id}`}
                      className="font-medium text-slate-900 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {c.externalRef ?? '—'}
                      {c.status === 'INACTIVE' && (
                        <span className="ml-2">
                          <Badge tone="slate" label="Inactive" />
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td right>
                    <span className="font-medium">
                      {formatMoneyCompact(c.creditAccount?.exposureMinor)}
                    </span>
                    {(c.creditAccount?.unappliedCreditMinor ?? 0) > 0 && (
                      <div className="text-[11px] text-emerald-600">
                        {formatMoneyCompact(c.creditAccount?.unappliedCreditMinor)} unapplied
                      </div>
                    )}
                  </Td>
                  <Td>
                    {c.creditAccount ? (
                      <UtilisationBar
                        exposure={c.creditAccount.exposureMinor}
                        limit={c.creditAccount.creditLimitMinor}
                      />
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td>
                    <TrustPill trust={c.trust} />
                  </Td>
                  <Td>
                    {(c.openExceptions ?? 0) > 0 || (c.openAlerts ?? 0) > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {(c.openExceptions ?? 0) > 0 && (
                          <Badge tone="rose" label={`${c.openExceptions} dispute${c.openExceptions === 1 ? '' : 's'}`} />
                        )}
                        {(c.openAlerts ?? 0) > 0 && (
                          <Badge tone="amber" label={`${c.openAlerts} alert${c.openAlerts === 1 ? '' : 's'}`} />
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-500">{timeAgo(c.lastPaymentAt)}</span>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </QueryBoundary>
      </Card>
      <NewCustomerModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          router.push(`/customers/${id}`);
        }}
      />
    </>
  );
}
