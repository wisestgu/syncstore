# SyncStore Frontend — handoff notes

Owner: frontend/UX/demo track. The backend (ledger, payments, disputes, Trust
Score, APIs) is developed in parallel and is **not** part of this codebase yet.

## How the frontend talks to the backend

All API access goes through one typed layer — components never call `fetch`:

| File | Role |
|---|---|
| `src/lib/api/types.ts` | Contract types (entities, state machines, response shapes) |
| `src/lib/api/client.ts` | Fetch wrapper: JSON, session cookie, `ApiError` |
| `src/lib/api/endpoints.ts` | One typed function per endpoint |
| `src/lib/api/hooks.ts` | `useQuery` / `useLiveQuery` (2.5 s change-stream polling) |
| `src/lib/format.ts` | The ONLY place kobo → ₦ display conversion happens |

The endpoint paths and shapes were derived from `docs/ARCHITECTURE.md` (§B route
tree, §C entities, §D state machines) because `docs/API_CONTRACT.md` did not
exist yet. **When the backend contract lands, reconcile `types.ts` +
`endpoints.ts` against it** — that is the entire integration surface.

Notable assumptions to confirm with the backend:

- `GET /api/auth/me` → `{ user }`; 401 when signed out (drives the login redirect).
- `GET /api/stream/changes?since=<seq>` → `{ seq }` (high-water mark; UI refetches when it advances).
- `GET /api/reports/dashboard` → `DashboardSummary` (exposure, collections today, attention count, recent activity, open alerts, trust distribution).
- List endpoints return `{ items: T[] }` (`Paginated<T>`).
- Demo controls: `POST /api/demo/run` with `{ action: 'start' | 'next' }`, `GET /api/demo/run` for state, `POST /api/demo/reset`. Mapped from §B's `demo/{seed,run,reset}`; rename here if the backend chooses differently.
- Amounts are sent/received as integer minor units (kobo) everywhere.

## Behaviour with no backend running

Every screen renders its loading state, then a consistent "API not reachable"
state (via `QueryBoundary`). Auth: a real 401 redirects to `/login`; an
unreachable API shows the screens in preview with a banner instead of locking
the UI out. No financial data is hardcoded anywhere in the frontend.

## Validation commands

```
npm run lint        # eslint — clean
npm run typecheck   # tsc --noEmit — clean
npm run build       # production build — 14 routes
```
