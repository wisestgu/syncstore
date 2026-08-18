/**
 * One place for every status → colour mapping, so the same state never has
 * two colours anywhere in the app.
 */
import type {
  AlertSeverity,
  AlertStatus,
  ExceptionStatus,
  PaymentMatchStatus,
  TransactionDisplayStatus,
  TrustBand,
  TrustSummary,
} from '@/lib/api/types';
import { humanize } from '@/lib/format';

type Tone = 'slate' | 'sky' | 'emerald' | 'amber' | 'rose' | 'violet';

const toneClasses: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export function Badge({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}

const transactionTones: Record<TransactionDisplayStatus, Tone> = {
  OPEN: 'sky',
  PARTIALLY_PAID: 'amber',
  SETTLED: 'emerald',
  CANCELLED: 'slate',
  DISPUTED: 'rose',
};

export function TransactionBadge({ status }: { status: TransactionDisplayStatus }) {
  return <Badge tone={transactionTones[status] ?? 'slate'} label={humanize(status)} />;
}

const paymentTones: Record<PaymentMatchStatus, Tone> = {
  PENDING: 'slate',
  RECEIVED: 'sky',
  UNMATCHED: 'rose',
  SUGGESTED: 'violet',
  PARTIALLY_ALLOCATED: 'amber',
  MATCHED: 'emerald',
  REVERSED: 'slate',
  FAILED: 'slate',
};

export function PaymentBadge({ status }: { status: PaymentMatchStatus }) {
  return <Badge tone={paymentTones[status] ?? 'slate'} label={humanize(status)} />;
}

const exceptionTones: Record<ExceptionStatus, Tone> = {
  OPEN: 'rose',
  UNDER_REVIEW: 'amber',
  RESOLVED_UPHELD: 'emerald',
  RESOLVED_REJECTED: 'slate',
  WITHDRAWN: 'slate',
};

export function ExceptionBadge({ status }: { status: ExceptionStatus }) {
  return <Badge tone={exceptionTones[status] ?? 'slate'} label={humanize(status)} />;
}

const severityTones: Record<AlertSeverity, Tone> = {
  LOW: 'sky',
  MEDIUM: 'amber',
  HIGH: 'rose',
};

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return <Badge tone={severityTones[severity] ?? 'slate'} label={humanize(severity)} />;
}

const alertStatusTones: Record<AlertStatus, Tone> = {
  OPEN: 'rose',
  ACKNOWLEDGED: 'amber',
  CLEARED: 'emerald',
};

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  return <Badge tone={alertStatusTones[status] ?? 'slate'} label={humanize(status)} />;
}

export const bandMeta: Record<TrustBand, { label: string; tone: Tone; bar: string }> = {
  STRONG: { label: 'Strong', tone: 'emerald', bar: 'bg-emerald-500' },
  GOOD: { label: 'Good', tone: 'sky', bar: 'bg-sky-500' },
  WATCH: { label: 'Watch', tone: 'amber', bar: 'bg-amber-500' },
  HIGH_RISK: { label: 'High risk', tone: 'rose', bar: 'bg-rose-500' },
};

/**
 * Trust Score pill. Shows the gate progress instead of inventing a score for
 * thin-history customers (FR-G2), and never implies a lending decision.
 */
export function TrustPill({ trust }: { trust?: TrustSummary }) {
  if (!trust) return <span className="text-xs text-slate-400">—</span>;
  if (trust.status === 'INSUFFICIENT_HISTORY') {
    const p = trust.progress;
    return (
      <Badge
        tone="slate"
        label={
          p
            ? `Building history · ${Math.min(p.transactions, p.requiredTransactions)}/${p.requiredTransactions} txns`
            : 'Building history'
        }
      />
    );
  }
  const band = trust.band ?? 'WATCH';
  const meta = bandMeta[band];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tnum text-sm font-semibold text-slate-800">{trust.score}</span>
      <Badge tone={meta.tone} label={meta.label} />
    </span>
  );
}
