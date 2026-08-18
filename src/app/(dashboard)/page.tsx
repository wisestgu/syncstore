'use client';

/**
 * Distributor home — the operational picture: exposure, today's collections,
 * customers needing attention, live activity, behavioural alerts, and the
 * Trust Score distribution. All figures come from /api/reports/dashboard.
 */
import Link from 'next/link';
import { getDashboard } from '@/lib/api/endpoints';
import { useLiveQuery } from '@/lib/api/hooks';
import type { DashboardSummary } from '@/lib/api/types';
import { formatMoneyCompact, formatMoney, humanize, timeAgo } from '@/lib/format';
import { Card, PageHeader, QueryBoundary, StatCard } from '@/components/ui';
import { SeverityBadge, bandMeta } from '@/components/status';
import type { TrustBand } from '@/lib/api/types';

function TrustDistribution({ data }: { data: DashboardSummary['trustDistribution'] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return <p className="text-sm text-slate-500">No scored customers yet.</p>;
  }
  const order: (TrustBand | 'INSUFFICIENT_HISTORY')[] = [
    'STRONG',
    'GOOD',
    'WATCH',
    'HIGH_RISK',
    'INSUFFICIENT_HISTORY',
  ];
  const sorted = order
    .map((band) => data.find((d) => d.band === band))
    .filter((d): d is NonNullable<typeof d> => !!d && d.count > 0);
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {sorted.map((d) => (
          <div
            key={d.band}
            className={
              d.band === 'INSUFFICIENT_HISTORY' ? 'bg-slate-300' : bandMeta[d.band as TrustBand].bar
            }
            style={{ width: `${(d.count / total) * 100}%` }}
            title={`${humanize(d.band)}: ${d.count}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {sorted.map((d) => (
          <span key={d.band} className="flex items-center gap-1.5">
            <span
              className={`size-2 rounded-full ${
                d.band === 'INSUFFICIENT_HISTORY'
                  ? 'bg-slate-300'
                  : bandMeta[d.band as TrustBand].bar
              }`}
            />
            {d.band === 'INSUFFICIENT_HISTORY' ? 'Building history' : bandMeta[d.band as TrustBand].label}
            <span className="tnum font-medium">{d.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const query = useLiveQuery(getDashboard);

  return (
    <>
      <PageHeader
        title="Dashboard"
        sub="Live position across credit, collections and customer behaviour."
      />
      <QueryBoundary query={query}>
        {(d) => (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Outstanding exposure"
                value={formatMoneyCompact(d.totalExposureMinor)}
                sub={d.overdueMinor ? `${formatMoneyCompact(d.overdueMinor)} overdue` : undefined}
                tone={d.overdueMinor ? 'warning' : 'default'}
              />
              <StatCard
                label="Collections today"
                value={formatMoneyCompact(d.collectionsTodayMinor)}
                tone="positive"
              />
              <StatCard label="Active customers" value={d.activeCustomers} />
              <StatCard
                label="Needing attention"
                value={d.customersNeedingAttention}
                sub="Open alerts or disputes"
                tone={d.customersNeedingAttention > 0 ? 'danger' : 'default'}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-5">
              <Card title="Recent payment activity" className="lg:col-span-3" padded={false}>
                {d.recentActivity.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">No activity yet today.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {d.recentActivity.map((a) => (
                      <li key={a.id} className="row-in flex items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-slate-800">{a.summary}</div>
                          <div className="text-xs text-slate-500">
                            {a.customerName && (
                              <Link
                                href={`/customers/${a.customerId}`}
                                className="hover:text-slate-700 hover:underline"
                              >
                                {a.customerName}
                              </Link>
                            )}
                            {a.customerName && ' · '}
                            {timeAgo(a.occurredAt)}
                          </div>
                        </div>
                        {a.amountMinor !== undefined && (
                          <div className="tnum text-sm font-medium text-slate-900">
                            {formatMoney(a.amountMinor)}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <div className="flex flex-col gap-4 lg:col-span-2">
                <Card
                  title="Behavioural alerts"
                  actions={
                    <Link href="/risk" className="text-xs font-medium text-sky-700 hover:underline">
                      Risk center →
                    </Link>
                  }
                  padded={false}
                >
                  {d.openAlerts.length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">No open alerts.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {d.openAlerts.slice(0, 5).map((al) => (
                        <li key={al.id} className="px-4 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <Link
                              href={`/customers/${al.customerId}`}
                              className="truncate text-sm font-medium text-slate-800 hover:underline"
                            >
                              {al.customerName ?? humanize(al.type)}
                            </Link>
                            <SeverityBadge severity={al.severity} />
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{al.message}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card title="Trust Score distribution">
                  <TrustDistribution data={d.trustDistribution} />
                  <p className="mt-3 text-[11px] text-slate-400">
                    Illustrative MVP weighting — behavioural signal, not a lending decision.
                  </p>
                </Card>
              </div>
            </div>
          </div>
        )}
      </QueryBoundary>
    </>
  );
}
