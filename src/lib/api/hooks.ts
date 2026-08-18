'use client';

/**
 * Data-access hooks. `useQuery` is plain fetch-on-mount with reload;
 * `useLiveQuery` additionally re-fetches whenever the ledger high-water mark
 * advances (GET /api/stream/changes every 2.5 s — §A.2 decision 6).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './client';
import { getChanges } from './endpoints';

const POLL_INTERVAL_MS = 2500;

export interface QueryState<T> {
  data: T | undefined;
  error: ApiError | undefined;
  /** true on the very first load only — reloads keep stale data visible */
  initialLoading: boolean;
  reload: () => void;
}

export function useQuery<T>(fetcher: () => Promise<T>, deps: readonly unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // `fetcher` is intentionally not a dependency: callers pass inline
    // closures and control refetching via `deps` and `reload()`.
    fetcher()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(undefined);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e : new ApiError(0, 'Unexpected error'));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return {
    data,
    error,
    initialLoading: data === undefined && error === undefined,
    reload,
  };
}

/**
 * Subscribes to the change stream; calls onChange each time seq advances.
 * Silently tolerates errors (backend absent, transient network) — polling
 * simply resumes on the next tick.
 */
export function useChangeStream(onChange: () => void, enabled = true) {
  const seqRef = useRef<number>(-1);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const controller = new AbortController();

    const tick = async () => {
      try {
        const { seq } = await getChanges(Math.max(seqRef.current, 0), controller.signal);
        if (stopped) return;
        if (seqRef.current >= 0 && seq > seqRef.current) onChangeRef.current();
        seqRef.current = seq;
      } catch {
        // backend unreachable or aborted — try again next interval
      }
    };

    void tick();
    const id = setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(id);
    };
  }, [enabled]);
}

/** Query that auto-reloads when the ledger advances. */
export function useLiveQuery<T>(fetcher: () => Promise<T>, deps: readonly unknown[] = []): QueryState<T> {
  const q = useQuery(fetcher, deps);
  useChangeStream(q.reload);
  return q;
}
