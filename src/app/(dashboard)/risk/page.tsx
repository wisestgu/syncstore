'use client';

/**
 * Risk center — behavioural alerts with their full "why", Trust Score
 * distribution, and the customer risk list. Alerts are advisory signals
 * (trailing-average threshold comparisons), never automated loan decisions.
 */
import Link from 'next/link';
import { useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { acknowledgeAlert, getDashboard, listAlerts, listCustomers } from '@/lib/api/endpoints';
import { useLiveQuery } from '@/lib/api/hooks';
import type { RiskAlert } from '@/lib/api/types';
import { formatMoneyCompact, humanize, timeAgo } from '@/lib/format';
import { Button, Card, PageHeader, QueryBoundary, Select, Table, Td, Th } from '@/components/ui';
import { AlertStatusBadge, SeverityBadge, TrustPill, bandMeta } from '@/components/status';

function AlertCard({ alert, onAcknowledged }: { alert: RiskAlert; onAcknowledged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const ack = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await acknowledgeAlert(alert.id);
      onAcknowledged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to acknowledge');
      setBusy(false);
    }
  };

  return (
    <div className="row-in rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SeverityBadge severity={alert.severity} />
          <span className="text-sm font-semibold text-slate-900">{humanize(alert.type)}</span>
          <AlertStatusBadge status={alert.status} />
        </div>
        <span className="text-xs text-slate-500">{timeAgo(alert.raisedAt)}</span>
      </div>
      <div className="mt-2 text-sm text-slate-700">
        <Link href={`/customers/${alert.customerId}`} className="font-medium text-slate-900 hover:underline">
          {alert.customerName ?? 'Customer'}
        </Link>
        {' — '}
        {alert.message}
      </div>
      <div className="mt-2.5">
        <div className="text-[11px] font-medium tracking-wide text-slate-400 uppercase">
          Why this alert exists
        </div>
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {alert.factors.map((f, i) => (
            <li key={i} className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900 ring-1 ring-amber-200 ring-inset">
              {f}
            </li>
          ))}
        </ul>
      </div>
      {alert.metrics && Object.keys(alert.metrics).length > 0 && (
        <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
          {Object.entries(alert.metrics).map(([k, v]) => (
            <div key={k}>
              <dt className="inline text-slate-400">{humanize(k)}: </dt>
              <dd className="tnum inline font-medium text-slate-800">{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-slate-400">
          Advisory signal — review exposure; not an automated credit decision.
        </span>
        {alert.status === 'OPEN' && (
          <Button variant="secondary" className="!px-2.5 !py-1 text-xs" onClick={ack} busy={busy}>
            Acknowledge
          </Button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function CustomerRiskList() {
  const query = useLiveQuery(() => listCustomers());
  return (
    <Card title="Customer risk list" padded={false}>
      <QueryBoundary query={query} empty={{ when: (d) => d.items.length === 0, title: 'No customers yet' }}>
        {(d) => {
          const ranked = [...d.items].sort((a, b) => {
            const sa = a.trust?.status === 'SCORED' ? (a.trust.score ?? 100) : 101;
            const sb = b.trust?.status === 'SCORED' ? (b.trust.score ?? 100) : 101;
            return sa - sb;
          });
          return (
            <Table
              head={
                <>
                  <Th>Customer</Th>
                  <Th>Trust Score</Th>
                  <Th right>Exposure</Th>
                  <Th right>Utilisation</Th>
                  <Th>Open items</Th>
                </>
              }
            >
              {ranked.map((c) => {
                const util =
                  c.creditAccount && c.creditAccount.creditLimitMinor > 0
                    ? c.creditAccount.exposureMinor / c.creditAccount.creditLimitMinor
                    : undefined;
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/customers/${c.id}`} className="font-medium text-slate-900 hover:underline">
                        {c.name}
                      </Link>
                    </Td>
                    <Td>
                      <TrustPill trust={c.trust} />
                    </Td>
                    <Td right>{formatMoneyCompact(c.creditAccount?.exposureMinor)}</Td>
                    <Td right className={util !== undefined && util >= 0.9 ? 'font-medium text-rose-600' : ''}>
                      {util !== undefined ? `${(util * 100).toFixed(0)}%` : '—'}
                    </Td>
                    <Td>
                      <span className="text-xs text-slate-600">
                        {[
                          (c.openAlerts ?? 0) > 0 ? `${c.openAlerts} alerts` : null,
                          (c.openExceptions ?? 0) > 0 ? `${c.openExceptions} disputes` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          );
        }}
      </QueryBoundary>
    </Card>
  );
}

function Distribution() {
  const query = useLiveQuery(getDashboard);
  return (
    <Card title="Trust Score distribution">
      <QueryBoundary query={query}>
        {(d) => {
          const total = d.trustDistribution.reduce((s, x) => s + x.count, 0);
          if (total === 0) return <p className="text-sm text-slate-500">No scored customers yet.</p>;
          return (
            <ul className="space-y-2">
              {d.trustDistribution.map((x) => {
                const meta =
                  x.band === 'INSUFFICIENT_HISTORY'
                    ? { label: 'Building history', bar: 'bg-slate-300' }
                    : bandMeta[x.band];
                return (
                  <li key={x.band}>
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>{meta.label}</span>
                      <span className="tnum font-medium">{x.count}</span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full ${meta.bar}`} style={{ width: `${(x.count / total) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          );
        }}
      </QueryBoundary>
    </Card>
  );
}

export default function RiskPage() {
  const [status, setStatus] = useState('OPEN');
  const alerts = useLiveQuery(() => listAlerts({ status: status || undefined }), [status]);

  return (
    <>
      <PageHeader
        title="Risk center"
        sub="Behavioural anomalies across the book. Each alert states exactly why it was raised."
      />
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Behavioural alerts</h2>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-40" aria-label="Filter alerts">
              <option value="OPEN">Open</option>
              <option value="ACKNOWLEDGED">Acknowledged</option>
              <option value="CLEARED">Cleared</option>
              <option value="">All</option>
            </Select>
          </div>
          <QueryBoundary
            query={alerts}
            empty={{
              when: (d) => d.items.length === 0,
              title: status === 'OPEN' ? 'No open alerts' : 'No alerts',
              hint: 'Alerts are raised when payment behaviour crosses fixed statistical thresholds.',
            }}
          >
            {(d) => (
              <div className="flex flex-col gap-3">
                {d.items.map((a) => (
                  <AlertCard key={a.id} alert={a} onAcknowledged={alerts.reload} />
                ))}
              </div>
            )}
          </QueryBoundary>
          <CustomerRiskList />
        </div>
        <div className="flex flex-col gap-4">
          <Distribution />
          <Card title="How alerts work">
            <p className="text-xs leading-relaxed text-slate-600">
              Each detector compares the trailing 7 days against the average of the four preceding
              7-day windows and fires only when <em>two</em> independent conditions hold (for
              example, payment velocity down while exposure rises). Nothing is trained; every alert
              can be explained in one sentence from the ledger.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
