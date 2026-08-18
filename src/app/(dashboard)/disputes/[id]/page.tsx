'use client';

/**
 * Dispute detail — evidence, notes, resolution actions and the audit
 * timeline. Upholding posts a credit-note adjustment (ADMIN only); the
 * original obligation is never edited.
 */
import Link from 'next/link';
import { use, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  addExceptionNote,
  getException,
  resolveException,
  updateExceptionStatus,
} from '@/lib/api/endpoints';
import { useLiveQuery } from '@/lib/api/hooks';
import type { ExceptionCase } from '@/lib/api/types';
import { formatDateTime, formatMoney, humanize, parseMoneyToMinor } from '@/lib/format';
import { useUser } from '@/components/shell';
import {
  Button,
  Card,
  Field,
  FormError,
  Input,
  Modal,
  PageHeader,
  QueryBoundary,
  Textarea,
} from '@/components/ui';
import { ExceptionBadge } from '@/components/status';

function ResolveModal({
  exception,
  outcome,
  onClose,
  onDone,
}: {
  exception: ExceptionCase;
  outcome: 'UPHELD' | 'REJECTED';
  onClose: () => void;
  onDone: () => void;
}) {
  const [resolution, setResolution] = useState('');
  const [creditAmount, setCreditAmount] = useState(
    exception.claimedAmountMinor !== undefined ? (exception.claimedAmountMinor / 100).toFixed(2) : '',
  );
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (resolution.trim().length < 5) {
      setFormError('Describe the resolution — this is recorded permanently in the audit trail.');
      return;
    }
    let creditAmountMinor: number | undefined;
    if (outcome === 'UPHELD') {
      const parsed = parseMoneyToMinor(creditAmount);
      if (parsed === null) {
        setFormError('Enter a valid credit note amount in naira.');
        return;
      }
      creditAmountMinor = parsed;
    }
    setBusy(true);
    setFormError(undefined);
    try {
      await resolveException(exception.id, {
        outcome,
        resolution: resolution.trim(),
        creditAmountMinor,
      });
      onDone();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to resolve dispute');
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={outcome === 'UPHELD' ? 'Uphold dispute' : 'Reject dispute'}
    >
      <div className="flex flex-col gap-4">
        {outcome === 'UPHELD' ? (
          <p className="text-sm text-slate-600">
            Upholding posts a <strong>credit note</strong> against the disputed obligation. The
            original transaction stays intact in history; the credit is a new ledger event.
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            Rejecting records the decision and reason. No ledger adjustment is made.
          </p>
        )}
        {outcome === 'UPHELD' && (
          <Field label="Credit note amount (₦)">
            <Input
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              inputMode="decimal"
            />
          </Field>
        )}
        <Field label="Resolution notes">
          <Textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder={
              outcome === 'UPHELD'
                ? 'e.g. Delivery confirmed 12 bags short against waybill; credit issued.'
                : 'e.g. Waybill and customer signature confirm full delivery.'
            }
          />
        </Field>
        <FormError message={formError} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={outcome === 'UPHELD' ? 'primary' : 'danger'} onClick={submit} busy={busy}>
            {outcome === 'UPHELD' ? 'Uphold & post credit note' : 'Reject dispute'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function NoteComposer({ exceptionId, onAdded }: { exceptionId: string; onAdded: () => void }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    if (body.trim().length === 0) return;
    setBusy(true);
    setError(undefined);
    try {
      await addExceptionNote(exceptionId, body.trim());
      setBody('');
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add note');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add an investigation note… (append-only)"
      />
      <FormError message={error} />
      <div className="flex justify-end">
        <Button variant="secondary" onClick={submit} busy={busy} disabled={body.trim().length === 0}>
          Add note
        </Button>
      </div>
    </div>
  );
}

export default function DisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useLiveQuery(() => getException(id), [id]);
  const user = useUser();
  const [resolving, setResolving] = useState<'UPHELD' | 'REJECTED' | null>(null);
  const [actionError, setActionError] = useState<string>();

  const isAdmin = user?.role === 'ADMIN';
  const canAct = user !== null;

  const moveTo = async (status: 'UNDER_REVIEW' | 'WITHDRAWN') => {
    setActionError(undefined);
    try {
      await updateExceptionStatus(id, status);
      query.reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed');
    }
  };

  return (
    <QueryBoundary query={query}>
      {(ex) => {
        const openForAction = ex.status === 'OPEN' || ex.status === 'UNDER_REVIEW';
        return (
          <>
            <PageHeader
              title={
                <span className="flex items-center gap-2.5">
                  {humanize(ex.type)} dispute
                  <ExceptionBadge status={ex.status} />
                </span>
              }
              sub={
                <>
                  <Link href={`/customers/${ex.customerId}`} className="font-medium hover:underline">
                    {ex.customerName ?? 'Customer'}
                  </Link>
                  {ex.transactionId && (
                    <>
                      {' · against '}
                      <Link href={`/transactions/${ex.transactionId}`} className="hover:underline">
                        {ex.invoiceRef ?? 'transaction'}
                      </Link>
                    </>
                  )}
                  {' · opened '}
                  {formatDateTime(ex.openedAt)}
                </>
              }
              actions={
                openForAction && canAct ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {ex.status === 'OPEN' && (
                      <Button variant="secondary" onClick={() => moveTo('UNDER_REVIEW')}>
                        Start review
                      </Button>
                    )}
                    <Button variant="secondary" onClick={() => moveTo('WITHDRAWN')}>
                      Withdraw
                    </Button>
                    {isAdmin ? (
                      <>
                        <Button variant="danger" onClick={() => setResolving('REJECTED')}>
                          Reject
                        </Button>
                        <Button onClick={() => setResolving('UPHELD')}>Uphold…</Button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-500">Resolution requires an admin</span>
                    )}
                  </div>
                ) : undefined
              }
            />
            <FormError message={actionError} />

            <div className="mt-2 grid items-start gap-4 lg:grid-cols-3">
              <div className="flex flex-col gap-4 lg:col-span-2">
                <Card title="Claim">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-slate-500">Claimed amount</dt>
                      <dd className="tnum mt-0.5 font-semibold text-slate-900">
                        {ex.claimedAmountMinor !== undefined ? formatMoney(ex.claimedAmountMinor) : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Type</dt>
                      <dd className="mt-0.5 font-medium">{humanize(ex.type)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Resolved</dt>
                      <dd className="mt-0.5">{ex.resolvedAt ? formatDateTime(ex.resolvedAt) : '—'}</dd>
                    </div>
                    <div className="col-span-2 sm:col-span-3">
                      <dt className="text-xs text-slate-500">Reason</dt>
                      <dd className="mt-0.5 text-slate-800">{ex.reason}</dd>
                    </div>
                    {ex.resolution && (
                      <div className="col-span-2 sm:col-span-3">
                        <dt className="text-xs text-slate-500">Resolution</dt>
                        <dd className="mt-0.5 text-slate-800">{ex.resolution}</dd>
                      </div>
                    )}
                  </dl>
                </Card>

                <Card title="Notes" padded={false}>
                  <div className="flex flex-col">
                    {(ex.notes ?? []).length === 0 ? (
                      <p className="px-4 pt-4 text-sm text-slate-500">No notes yet.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {(ex.notes ?? []).map((n) => (
                          <li key={n.id} className="px-4 py-3">
                            <p className="text-sm whitespace-pre-wrap text-slate-800">{n.body}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {n.authorName ?? 'Unknown'} · {formatDateTime(n.createdAt)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                    {openForAction && canAct && (
                      <div className="border-t border-slate-100 p-4">
                        <NoteComposer exceptionId={id} onAdded={query.reload} />
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              <div className="flex flex-col gap-4">
                <Card title="Evidence" padded={false}>
                  {(ex.evidence ?? []).length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">No evidence attached.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {(ex.evidence ?? []).map((ev) => (
                        <li key={ev.id} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-4" aria-hidden>
                              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM13 2v7h7" />
                            </svg>
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-800">{ev.label}</div>
                            <div className="truncate font-mono text-xs text-slate-500">{ev.ref}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card title="Audit timeline" padded={false}>
                  {(ex.timeline ?? []).length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">No audit events yet.</p>
                  ) : (
                    <ol className="relative m-4 ml-6 space-y-4 border-l border-slate-200 pl-4">
                      {(ex.timeline ?? []).map((a) => (
                        <li key={a.id} className="relative">
                          <span className="absolute top-1.5 -left-[21px] size-2 rounded-full border-2 border-white bg-slate-400" />
                          <div className="text-sm text-slate-800">{a.detail ?? humanize(a.action)}</div>
                          <div className="text-xs text-slate-500">
                            {a.actorName && `${a.actorName} · `}
                            {formatDateTime(a.createdAt)}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </Card>
              </div>
            </div>

            {resolving && (
              <ResolveModal
                exception={ex}
                outcome={resolving}
                onClose={() => setResolving(null)}
                onDone={() => {
                  setResolving(null);
                  query.reload();
                }}
              />
            )}
          </>
        );
      }}
    </QueryBoundary>
  );
}
