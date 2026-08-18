'use client';

/**
 * Demo mode — drives the scripted scenario through REAL backend endpoints
 * (/api/demo/run and /api/demo/reset, which replay events through the same
 * webhook path production would use). There is no client-side fake data:
 * this screen only sends control actions and renders backend state.
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { getDashboard, getDemoState, nextDemoEvent, resetDemo, startDemo } from '@/lib/api/endpoints';
import { useLiveQuery } from '@/lib/api/hooks';
import type { DemoState } from '@/lib/api/types';
import { formatMoneyCompact, timeAgo, formatMoney } from '@/lib/format';
import { Button, Card, PageHeader, QueryBoundary, StatCard } from '@/components/ui';

const AUTO_PLAY_INTERVAL_MS = 4000;

function StepList({ demo }: { demo: DemoState }) {
  return (
    <ol className="space-y-1.5">
      {demo.steps.map((s) => {
        const isCurrent = demo.status === 'RUNNING' && s.index === demo.stepIndex;
        return (
          <li
            key={s.index}
            className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm ${
              isCurrent ? 'bg-sky-50 ring-1 ring-sky-200' : ''
            }`}
          >
            <span
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                s.completed
                  ? 'bg-emerald-500 text-white'
                  : isCurrent
                    ? 'bg-sky-500 text-white'
                    : 'bg-slate-200 text-slate-600'
              }`}
            >
              {s.completed ? '✓' : s.index + 1}
            </span>
            <span>
              <span className={`font-medium ${s.completed ? 'text-slate-500' : 'text-slate-900'}`}>
                {s.label}
              </span>
              {s.description && <span className="block text-xs text-slate-500">{s.description}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function LivePosition() {
  const query = useLiveQuery(getDashboard);
  return (
    <QueryBoundary query={query}>
      {(d) => (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Outstanding exposure" value={formatMoneyCompact(d.totalExposureMinor)} />
            <StatCard
              label="Collections today"
              value={formatMoneyCompact(d.collectionsTodayMinor)}
              tone="positive"
            />
            <StatCard label="Active customers" value={d.activeCustomers} />
            <StatCard
              label="Needing attention"
              value={d.customersNeedingAttention}
              tone={d.customersNeedingAttention > 0 ? 'danger' : 'default'}
            />
          </div>
          <Card title="Latest activity" padded={false} className="mt-3">
            {d.recentActivity.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Nothing yet — start the demo.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {d.recentActivity.slice(0, 6).map((a) => (
                  <li key={a.id} className="row-in flex items-center justify-between gap-2 px-4 py-2">
                    <span className="min-w-0 truncate text-sm text-slate-700">{a.summary}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                      {a.amountMinor !== undefined && (
                        <span className="tnum font-medium text-slate-800">{formatMoney(a.amountMinor)}</span>
                      )}
                      {timeAgo(a.occurredAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </QueryBoundary>
  );
}

export default function DemoPage() {
  const query = useLiveQuery(getDemoState);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>();
  const [autoPlay, setAutoPlay] = useState(false);

  const run = useCallback(
    async (name: string, fn: () => Promise<DemoState>) => {
      setBusy(name);
      setActionError(undefined);
      try {
        await fn();
        query.reload();
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : 'Demo action failed');
        setAutoPlay(false);
      } finally {
        setBusy(null);
      }
    },
    [query],
  );

  const demo = query.data;
  const running = demo?.status === 'RUNNING';
  // Auto play is only effective while the scenario is running; when it
  // completes the interval simply stops without extra state.
  const autoPlaying = autoPlay && running;

  // AUTO PLAY: advance through the real backend at a steady narration pace.
  useEffect(() => {
    if (!autoPlaying) return;
    const id = setInterval(() => void run('auto', nextDemoEvent), AUTO_PLAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoPlaying, run]);

  return (
    <>
      <PageHeader
        title="Demo mode"
        sub="Replays the scripted scenario through the real webhook and ledger — the other screens update live as events land."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          onClick={() => run('start', () => startDemo())}
          busy={busy === 'start'}
          disabled={running}
        >
          ▶ Start demo
        </Button>
        <Button
          variant="secondary"
          onClick={() => run('next', nextDemoEvent)}
          busy={busy === 'next'}
          disabled={!running || autoPlaying}
        >
          Next event
        </Button>
        <Button
          variant={autoPlaying ? 'danger' : 'secondary'}
          onClick={() => setAutoPlay((v) => !v)}
          disabled={!running}
        >
          {autoPlaying ? '⏸ Stop auto play' : '⏵ Auto play'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setAutoPlay(false);
            void run('reset', resetDemo);
          }}
          busy={busy === 'reset'}
        >
          ↺ Reset to clean state
        </Button>
        {actionError && <span className="text-sm font-medium text-rose-600">{actionError}</span>}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card
          title="Scenario"
          actions={
            demo && (
              <span className="tnum text-xs text-slate-500">
                {demo.status === 'IDLE'
                  ? 'Not started'
                  : demo.status === 'COMPLETE'
                    ? 'Complete'
                    : `Step ${Math.min(demo.stepIndex + 1, demo.totalSteps)} of ${demo.totalSteps}`}
              </span>
            )
          }
        >
          <QueryBoundary
            query={query}
            empty={{
              when: (d) => d.steps.length === 0,
              title: 'No scenario loaded',
              hint: 'Reset to a clean state to load the scripted scenario.',
            }}
          >
            {(d) => <StepList demo={d} />}
          </QueryBoundary>
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            Watch it land: the{' '}
            <Link href="/" className="font-medium text-sky-700 hover:underline">
              dashboard
            </Link>
            ,{' '}
            <Link href="/payments" className="font-medium text-sky-700 hover:underline">
              payment review
            </Link>
            ,{' '}
            <Link href="/whatsapp" className="font-medium text-sky-700 hover:underline">
              WhatsApp
            </Link>{' '}
            and{' '}
            <Link href="/risk" className="font-medium text-sky-700 hover:underline">
              risk center
            </Link>{' '}
            all poll the same ledger and update within ~3 seconds of each event.
          </div>
        </Card>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Live position</h2>
          <LivePosition />
        </div>
      </div>
    </>
  );
}
