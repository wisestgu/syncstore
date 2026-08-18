'use client';

/**
 * Create credit transaction. Line items are optional; when present the
 * invoice total is derived from them (no double entry of amounts).
 */
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import { createTransaction, listCustomers } from '@/lib/api/endpoints';
import { useQuery } from '@/lib/api/hooks';
import { formatMoney, parseMoneyToMinor } from '@/lib/format';
import {
  Button,
  Card,
  Field,
  FormError,
  Input,
  PageHeader,
  Select,
} from '@/components/ui';

interface LineDraft {
  description: string;
  qty: string;
  unitPrice: string;
}

const emptyLine: LineDraft = { description: '', qty: '1', unitPrice: '' };

function lineTotalMinor(l: LineDraft): number | null {
  const qty = parseInt(l.qty, 10);
  const unit = parseMoneyToMinor(l.unitPrice);
  if (!Number.isInteger(qty) || qty <= 0 || unit === null) return null;
  return qty * unit;
}

function NewTransactionForm() {
  const router = useRouter();
  const params = useSearchParams();
  const customers = useQuery(() => listCustomers());

  const [customerId, setCustomerId] = useState(params.get('customerId') ?? '');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [amount, setAmount] = useState('');
  const [terms, setTerms] = useState('14');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [errors, setErrors] = useState<{ customer?: string; amount?: string; terms?: string; lines?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const derivedTotal = useMemo(() => {
    if (lines.length === 0) return null;
    let sum = 0;
    for (const l of lines) {
      const t = lineTotalMinor(l);
      if (t === null) return null;
      sum += t;
    }
    return sum;
  }, [lines]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!customerId) errs.customer = 'Choose a customer';
    const termsDays = parseInt(terms, 10);
    if (!Number.isInteger(termsDays) || termsDays < 0 || termsDays > 365)
      errs.terms = 'Terms must be between 0 and 365 days';

    let amountMinor: number | null;
    if (lines.length > 0) {
      amountMinor = derivedTotal;
      if (amountMinor === null) errs.lines = 'Every line needs a description, quantity and valid unit price';
    } else {
      amountMinor = parseMoneyToMinor(amount);
      if (amountMinor === null) errs.amount = 'Enter a valid amount in naira';
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0 || amountMinor === null) return;

    setBusy(true);
    setFormError(undefined);
    try {
      const tx = await createTransaction({
        customerId,
        invoiceRef: invoiceRef.trim() || undefined,
        amountMinor,
        termsDays,
        lineItems:
          lines.length > 0
            ? lines.map((l) => ({
                description: l.description.trim(),
                qty: parseInt(l.qty, 10),
                unitPriceMinor: parseMoneyToMinor(l.unitPrice) ?? 0,
              }))
            : undefined,
      });
      router.push(`/transactions/${tx.id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create transaction');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-4" noValidate>
      <Card>
        <div className="flex flex-col gap-4">
          <Field label="Customer" error={errors.customer}>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">
                {customers.initialLoading
                  ? 'Loading customers…'
                  : customers.error
                    ? 'Could not load customers'
                    : 'Select customer…'}
              </option>
              {(customers.data?.items ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Invoice reference" hint="Optional — used for payment auto-matching.">
              <Input
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                placeholder="INV-2041"
              />
            </Field>
            <Field label="Payment terms (days)" error={errors.terms}>
              <Input
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                inputMode="numeric"
                invalid={!!errors.terms}
              />
            </Field>
          </div>
          {lines.length === 0 && (
            <Field label="Invoice amount (₦)" error={errors.amount}>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                invalid={!!errors.amount}
                placeholder="250,000"
              />
            </Field>
          )}
        </div>
      </Card>

      <Card
        title="Line items (optional)"
        actions={
          <Button
            type="button"
            variant="secondary"
            className="!px-2.5 !py-1 text-xs"
            onClick={() => setLines((ls) => [...ls, { ...emptyLine }])}
          >
            Add line
          </Button>
        }
      >
        {lines.length === 0 ? (
          <p className="text-sm text-slate-500">
            No line items — the invoice amount above will be used. Add lines to itemise the sale;
            the total is then calculated from them.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {lines.map((l, i) => {
              const total = lineTotalMinor(l);
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input
                    value={l.description}
                    onChange={(e) =>
                      setLines((ls) => ls.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))
                    }
                    placeholder="Cement 50kg bag"
                    className="min-w-40 flex-1"
                    aria-label={`Line ${i + 1} description`}
                  />
                  <Input
                    value={l.qty}
                    onChange={(e) =>
                      setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))
                    }
                    inputMode="numeric"
                    className="w-16"
                    aria-label={`Line ${i + 1} quantity`}
                  />
                  <Input
                    value={l.unitPrice}
                    onChange={(e) =>
                      setLines((ls) => ls.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)))
                    }
                    inputMode="decimal"
                    placeholder="Unit ₦"
                    className="w-28"
                    aria-label={`Line ${i + 1} unit price`}
                  />
                  <span className="tnum w-24 text-right text-sm text-slate-700">
                    {total !== null ? formatMoney(total) : '—'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                    aria-label={`Remove line ${i + 1}`}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            <div className="mt-1 flex justify-end border-t border-slate-100 pt-2 text-sm">
              <span className="text-slate-500">Invoice total:&nbsp;</span>
              <span className="tnum font-semibold text-slate-900">
                {derivedTotal !== null ? formatMoney(derivedTotal) : '—'}
              </span>
            </div>
            {errors.lines && <p className="text-xs font-medium text-rose-600">{errors.lines}</p>}
          </div>
        )}
      </Card>

      <FormError message={formError} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" busy={busy}>
          Create transaction
        </Button>
      </div>
    </form>
  );
}

export default function NewTransactionPage() {
  return (
    <>
      <PageHeader title="New credit transaction" sub="Record goods released on credit." />
      <Suspense>
        <NewTransactionForm />
      </Suspense>
    </>
  );
}
