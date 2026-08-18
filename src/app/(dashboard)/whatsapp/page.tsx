'use client';

/**
 * Simulated WhatsApp — renders the customer's phone view of the thread.
 * Every bubble is a real backend message_event; the composer posts inbound
 * messages through the backend keyword router (BALANCE, STATEMENT). No
 * message text is invented client-side.
 */
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { listCustomers, listMessages, sendInboundMessage } from '@/lib/api/endpoints';
import { useLiveQuery, useQuery } from '@/lib/api/hooks';
import type { MessageEvent } from '@/lib/api/types';
import { formatDate, formatTime } from '@/lib/format';
import { Card, PageHeader, QueryBoundary, Select, Spinner } from '@/components/ui';

function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-2 flex justify-center">
      <span className="rounded-lg bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
        {label}
      </span>
    </div>
  );
}

function Bubble({ msg }: { msg: MessageEvent }) {
  // The pane shows the CUSTOMER's phone: SyncStore templates (direction OUT)
  // arrive on the left; the customer's own messages (IN) sit on the right.
  const fromBusiness = msg.direction === 'OUT';
  return (
    <div className={`row-in flex ${fromBusiness ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-1.5 shadow-sm ${
          fromBusiness ? 'rounded-tl-none bg-white' : 'rounded-tr-none bg-[#d9fdd3]'
        }`}
      >
        <p className="text-[13.5px] leading-snug whitespace-pre-wrap text-slate-900">{msg.body}</p>
        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-400">
          {formatTime(msg.createdAt)}
          {!fromBusiness && (
            <svg viewBox="0 0 16 11" className="h-2.5 w-3.5 fill-sky-500" aria-hidden>
              <path d="M11.07.65 5.65 6.07 3.5 3.93l-1.06 1.06 3.21 3.22L12.14 1.7zM15.5 1.7 14.43.65 8.3 6.79l1.06 1.06z" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

function Thread({ customerId }: { customerId: string }) {
  const query = useLiveQuery(() => listMessages(customerId), [customerId]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = query.data?.items.length ?? 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [count]);

  const send = async (text: string) => {
    if (!text.trim()) return;
    setSending(true);
    setSendError(undefined);
    try {
      await sendInboundMessage(customerId, text.trim());
      setDraft('');
      query.reload();
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div ref={scrollRef} className="wa-bg flex-1 overflow-y-auto p-4">
        <QueryBoundary
          query={query}
          empty={{
            when: (d) => d.items.length === 0,
            title: 'No messages yet',
            hint: 'Payment confirmations and balance updates will appear here as backend events occur.',
          }}
        >
          {(d) => {
            const sorted = [...d.items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            let lastDay = '';
            return (
              <div className="flex flex-col gap-1.5">
                {sorted.map((m) => {
                  const day = formatDate(m.createdAt);
                  const divider = day !== lastDay;
                  lastDay = day;
                  return (
                    <div key={m.id}>
                      {divider && <DayDivider label={day} />}
                      <Bubble msg={m} />
                    </div>
                  );
                })}
              </div>
            );
          }}
        </QueryBoundary>
      </div>
      <div className="border-t border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex gap-1.5">
          {['BALANCE', 'STATEMENT'].map((kw) => (
            <button
              key={kw}
              onClick={() => send(kw)}
              disabled={sending}
              className="rounded-full border border-slate-300 bg-white px-2.5 py-1 font-mono text-[11px] text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              {kw}
            </button>
          ))}
          <span className="self-center text-[11px] text-slate-400">
            quick keywords the customer can text
          </span>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type as the customer…"
            className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm focus:border-emerald-500"
            aria-label="Message as customer"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="flex size-9 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
            aria-label="Send"
          >
            {sending ? (
              <Spinner className="size-4" />
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 size-4" aria-hidden>
                <path d="M3.4 20.4 20.85 12 3.4 3.6l.01 6.53L15 12 3.41 13.87z" />
              </svg>
            )}
          </button>
        </form>
        {sendError && <p className="mt-1 text-xs text-rose-600">{sendError}</p>}
      </div>
    </>
  );
}

export default function WhatsAppPage() {
  const customers = useQuery(() => listCustomers());
  const [selectedId, setSelectedId] = useState('');
  // Default to the first customer once loaded, without extra state churn.
  const customerId = selectedId || customers.data?.items[0]?.id || '';
  const selected = customers.data?.items.find((c) => c.id === customerId);

  return (
    <>
      <PageHeader
        title="WhatsApp"
        sub="What the customer sees on their phone. All messages are real backend events — nothing is sent to the WhatsApp network."
      />
      <Card padded={false} className="overflow-hidden">
        <div className="flex h-[calc(100vh-14.5rem)] min-h-96 flex-col">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-[#008069] px-4 py-2.5 text-white">
            <span className="flex size-9 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">
              {selected ? selected.name.charAt(0).toUpperCase() : '·'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{selected?.name ?? 'Select a customer'}</div>
              <div className="text-[11px] text-white/80">
                {selected?.channels?.find((ch) => ch.kind === 'WHATSAPP' || ch.kind === 'PHONE')?.value ??
                  'simulated channel'}
              </div>
            </div>
            <Select
              value={customerId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="!w-48 !border-white/30 !bg-white/10 !text-white"
              aria-label="Select customer thread"
            >
              <option value="" className="text-slate-900">
                {customers.initialLoading ? 'Loading…' : 'Choose customer…'}
              </option>
              {(customers.data?.items ?? []).map((c) => (
                <option key={c.id} value={c.id} className="text-slate-900">
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          {customerId ? (
            <Thread customerId={customerId} />
          ) : (
            <div className="wa-bg flex flex-1 items-center justify-center text-sm text-slate-500">
              Choose a customer to open their thread.
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
