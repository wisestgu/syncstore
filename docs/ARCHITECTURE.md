# SyncStore — MVP Architecture & Build Plan

Derived from `SyncStore_Product_Description_and_PRD_v3_Broad_Trade.docx` (v3, Broad Trade Edition).
Text extraction of the PRD lives at `docs/PRD_extracted.txt`.

Status: **proposal awaiting sign-off. No application code written yet.**

---

## 0. Current repository state

| Item | State |
|---|---|
| Git | `main`, **zero commits**, remote `git@github.com:samuel-cyber/syncstore.git` |
| Files | PRD `.docx`, `.claude/settings.local.json`, `docs/` |
| Application code | none |
| Node / npm | v22.23.2 / 10.9.8 — npm registry reachable |
| `node:sqlite` | available (`DatabaseSync`, `StatementSync`) — verified |
| TS type-stripping | enabled by default (`process.features.typescript === 'strip'`) — verified |
| PostgreSQL | **not installed** |
| Docker | **not installed** |

Verified by probe, not assumed:
- `node --test` runs `.ts` test files directly, no test framework, no build step.
- `node:sqlite` supports `BEGIN`/`ROLLBACK`, `UNIQUE` constraint violations (idempotency),
  and `BEFORE UPDATE ... RAISE(ABORT)` triggers (append-only ledger enforcement).

---

## A. Architecture

### A.1 Shape

A single Next.js application with a **pure domain core** that has no knowledge of HTTP, React, or the
database. One process, one deployable, one `npm run dev`. Nothing on stage touches the network.

```
┌──────────────────────────────────────────────────────────────────────┐
│  BROWSER — Distributor dashboard (React) + Simulated WhatsApp pane   │
│  polls GET /api/stream/changes?since=<seq>  every 2500 ms            │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ REST/JSON, session cookie
┌───────────────────────────────▼──────────────────────────────────────┐
│  src/app/api/**  — ROUTE LAYER                                       │
│  parse · authn/authz · call one service · serialize. No logic.       │
└───────────────────────────────┬──────────────────────────────────────┘
┌───────────────────────────────▼──────────────────────────────────────┐
│  src/services/**  — ORCHESTRATION                                    │
│  opens the DB transaction, loads facts via repositories, calls the    │
│  domain, appends ledger events, updates projections, emits messages   │
│  and audit events. One service call = one atomic commit.              │
└──────┬───────────────────────────┬───────────────────────┬───────────┘
       │                           │                       │
┌──────▼─────────────┐   ┌─────────▼──────────┐   ┌────────▼──────────┐
│ src/domain/**      │   │ src/db/**          │   │ src/adapters/**   │
│ PURE FUNCTIONS     │   │ SQL lives ONLY in  │   │ PaymentAdapter    │
│ state machines     │   │ repositories.      │   │  └ Simulated      │
│ reconciliation     │   │ migrations/*.sql   │   │ MessageGateway    │
│ trust score        │   │ node:sqlite        │   │  └ SimulatedWA    │
│ anomaly            │   │                    │   │                   │
│ no I/O, no clock,  │   │                    │   │ (Wema / real      │
│ no randomness      │   │                    │   │  WhatsApp = future│
└────────────────────┘   └────────────────────┘   │  impls, not built)│
                                                  └───────────────────┘
```

### A.2 Load-bearing decisions

**1. Event-sourced ledger, derived projections.**
`ledger_events` is the single source of truth: append-only, monotonic `seq`, `UPDATE`/`DELETE` blocked
by DB triggers. Balances and statuses live in mutable *projection* columns that are a pure fold of the
event stream and can be rebuilt from zero at any time.

This directly buys four PRD requirements: FR-C4 (immutable event history), FR-E4 (never silently
overwrite), Business Rule "corrections create new events rather than rewriting history", and an
integrity test that no amount of UI polish can fake — *rebuild == live* after any operation sequence.

Corrections are always new events. A wrong allocation is undone by appending
`PAYMENT_UNALLOCATED`, never by deleting the `allocations` row.

**2. Determinism is an architectural constraint, not a test trick.**
`Date.now()`, `new Date()`, and `Math.random()` are **banned inside `src/domain/**`**, enforced by a
grep check in `npm test`. Time enters through an injected `Clock`; randomness (demo data only) through
a seeded PRNG. Consequence: the Trust Score, the anomaly threshold, and the whole demo replay are
reproducible byte-for-byte. This is what makes constraints 6, 7 and 8 true rather than aspirational.

**3. Idempotency at two levels.**
- Adapter level: `payment_events.idempotency_key UNIQUE`. Ingest is INSERT-first; on unique violation
  the service returns the **original** outcome unchanged and appends nothing.
- Command level: `ledger_events.dedupe_key UNIQUE` (nullable) so a double-clicked *Allocate* or
  *Post adjustment* cannot post twice.

**4. Money is integer kobo.** Every column is `*_minor INTEGER`. No floats anywhere in the stack;
formatting happens only at the render edge. Rounding is defined once, in `domain/money.ts`.

**5. One webhook path for real and simulated events.**
`POST /api/webhooks/payments` accepts a `NormalizedPaymentEvent`. The demo simulator posts to it. A
future Wema adapter would post to it. PRD §14's "replay three payments through the same code path used
by (future) webhook events" is satisfied literally, and it means the simulator exercises production
code rather than a parallel test-only branch.

**6. Polling over push.** Client polls `GET /api/stream/changes?since=<seq>`, which is one indexed
`MAX(seq)` read. The UI refetches only when `seq` advanced. Cheap, boring, and satisfies FR-D5 plus the
≤3s latency metric. SSE would slot in behind the identical endpoint contract as P2 — not built.

### A.3 Stack

| Concern | Choice | Why |
|---|---|---|
| App | Next.js (App Router) + React, TypeScript | PRD §13; one process instead of two servers + CORS |
| Database | **SQLite via `node:sqlite`** | see Decision D-1 below; zero deps, zero external services |
| Tests | `node --test` | verified working on `.ts` with no framework — 0 test deps |
| Auth | `node:crypto` scrypt + HMAC-signed httpOnly cookie | PRD §13 session auth; 0 deps |
| IDs | `crypto.randomUUID()` (ULID-ish sortable ids for events) | 0 deps |
| Styling | see Decision D-2 | |

Runtime dependency budget: **`next`, `react`, `react-dom`.** That is the whole list.

---

## B. Folder structure

```
syncstore/
├── docs/
│   ├── PRD_extracted.txt          # machine-readable PRD text
│   ├── ARCHITECTURE.md            # this file
│   ├── ASSUMPTIONS.md             # what is real / simulated / synthetic / future  (§21 last bullet)
│   └── DEMO_SCRIPT.md             # the on-stage script + judge Q&A one-liners
│
├── src/
│   ├── domain/                    # ── PURE. no db, no http, no clock, no random ──
│   │   ├── money.ts               # Minor units, add/sub/min, allocation-safe arithmetic
│   │   ├── clock.ts               # Clock interface, SystemClock, FixedClock
│   │   ├── ids.ts                 # id generation seam (injected, so tests are stable)
│   │   ├── result.ts              # Ok/Err result type — no exceptions for domain rules
│   │   ├── ledger/
│   │   │   ├── events.ts          # LedgerEvent discriminated union + payload shapes
│   │   │   ├── transactionState.ts# transaction state machine + legal transitions
│   │   │   ├── paymentState.ts    # payment match-state machine
│   │   │   ├── exceptionState.ts  # exception state machine
│   │   │   └── project.ts         # fold(events) -> projections   (rebuild lives here)
│   │   ├── reconciliation/
│   │   │   ├── config.ts          # AUTO_MATCH / REVIEW thresholds — one place
│   │   │   ├── rules.ts           # R1..R5 confidence rules, ordered & pure
│   │   │   ├── match.ts           # payment -> candidate customer + confidence
│   │   │   └── allocate.ts        # allocation plan: exact-match, then FIFO
│   │   ├── intelligence/
│   │   │   ├── facts.ts           # LedgerFacts — the only input the scorer sees
│   │   │   ├── weights.ts         # PRD §9 weights, single source of truth
│   │   │   ├── factors/           # one file per factor, each 0..100 + explanation
│   │   │   │   ├── repaymentConsistency.ts   (30%)
│   │   │   │   ├── timeliness.ts             (20%)
│   │   │   │   ├── velocityStability.ts      (15%)
│   │   │   │   ├── exposureTrend.ts          (15%)
│   │   │   │   ├── disputeBehaviour.ts       (10%)
│   │   │   │   └── tenure.ts                 (10%)
│   │   │   ├── trustScore.ts      # weighted sum + history gate + band
│   │   │   └── anomaly.ts         # velocity threshold detectors
│   │   └── messaging/
│   │       └── templates.ts       # the 5 PRD §11 templates, pure render
│   │
│   ├── db/
│   │   ├── connection.ts          # DatabaseSync handle, WAL, foreign_keys ON
│   │   ├── withTransaction.ts     # BEGIN IMMEDIATE / COMMIT / ROLLBACK helper
│   │   ├── migrate.ts
│   │   ├── migrations/
│   │   │   ├── 001_core.sql       # orgs, users, customers, credit accounts
│   │   │   ├── 002_ledger.sql     # transactions, payments, allocations, ledger_events + triggers
│   │   │   ├── 003_exceptions.sql
│   │   │   ├── 004_intelligence.sql
│   │   │   └── 005_messaging_audit.sql
│   │   └── repositories/          # ── THE ONLY PLACE SQL EXISTS ──
│   │       ├── customerRepo.ts    transactionRepo.ts   paymentRepo.ts
│   │       ├── allocationRepo.ts  ledgerRepo.ts        exceptionRepo.ts
│   │       ├── snapshotRepo.ts    alertRepo.ts         messageRepo.ts
│   │       └── auditRepo.ts       userRepo.ts
│   │
│   ├── services/                  # transaction boundary + domain + repos
│   │   ├── customerService.ts
│   │   ├── transactionService.ts
│   │   ├── paymentIngestService.ts# idempotent entry point for ALL payment events
│   │   ├── allocationService.ts   # auto + manual allocation, and un-allocation
│   │   ├── exceptionService.ts
│   │   ├── adjustmentService.ts   # credit note / write-off / cash collection (ADMIN)
│   │   ├── intelligenceService.ts # snapshot + alert computation
│   │   ├── messagingService.ts
│   │   ├── statementService.ts
│   │   └── reportingService.ts    # exposure, overdue, recent activity (FR-H)
│   │
│   ├── adapters/
│   │   ├── payments/
│   │   │   ├── PaymentAdapter.ts  # interface + NormalizedPaymentEvent (4 kinds)
│   │   │   └── SimulatedAdapter.ts# the only implementation
│   │   └── messaging/
│   │       ├── MessageGateway.ts  # interface
│   │       └── SimulatedWhatsAppGateway.ts
│   │
│   ├── auth/
│   │   ├── password.ts            # scrypt hash/verify
│   │   ├── session.ts             # HMAC-signed cookie
│   │   └── guards.ts              # requireUser / requireRole(ADMIN)
│   │
│   ├── demo/
│   │   ├── prng.ts                # seeded, deterministic
│   │   ├── scenarios.ts           # scripted event timelines (§14)
│   │   ├── seed.ts                # distributor + 3 customers + history
│   │   ├── runner.ts              # replays a scenario through the webhook path
│   │   └── reset.ts               # drop DB file, migrate, re-seed → clean state
│   │
│   └── app/                       # Next.js — presentation and transport ONLY
│       ├── (auth)/login/
│       ├── (dashboard)/
│       │   ├── page.tsx                    # Distributor Home
│       │   ├── customers/                  # List + [id] Detail
│       │   ├── transactions/new/
│       │   ├── payments/review/            # matched / suggested / unmatched queue
│       │   ├── exceptions/[id]/
│       │   ├── risk/                       # Risk Center
│       │   ├── whatsapp/                   # simulated customer thread
│       │   └── demo/                       # deterministic simulation controls
│       └── api/
│           ├── auth/[...]/         customers/[...]/       transactions/[...]/
│           ├── webhooks/payments/  # single ingress for real + simulated
│           ├── payments/[id]/allocate/     exceptions/[...]/
│           ├── customers/[id]/statement/   risk/alerts/
│           ├── demo/{seed,run,reset}/
│           └── stream/changes/     # polling high-water mark
│
├── tests/
│   ├── unit/                      # domain only. no DB. milliseconds.
│   ├── integration/               # services against :memory: SQLite
│   ├── acceptance/                # one test per PRD §21 criterion
│   └── fixtures/                  # golden trust-score & scenario snapshots
│
├── scripts/check-determinism.sh   # greps domain/ for Date.now|Math.random|new Date
├── package.json  tsconfig.json  .env.example  README.md
```

The rule that keeps constraint 9 true: **`src/domain/**` may not import from `src/db`, `src/app`,
`src/services`, or `src/adapters`.** Enforced by a grep check in `npm test` alongside the determinism
check. Cheap, and it is the difference between "testable in principle" and testable.

---

## C. Database entities and relationships

### C.1 Entity map

```
organizations ──1:N── users
      │
      └──1:N── customers ──1:1── credit_accounts
                   │
                   ├──1:N── customer_channels        (phone / whatsapp / payer bank ref)
                   ├──1:N── transactions ──1:N── transaction_line_items
                   │              │
                   │              └──1:N── allocations ──N:1── payments
                   │                                              │
                   ├──1:N── payment_events ──1:0..1── payments    │
                   │           (idempotency boundary)             │
                   │                                              │
                   ├──1:N── reconciliation_decisions ─────────────┘
                   ├──1:N── adjustments
                   ├──1:N── exceptions ──1:N── exception_notes
                   │                     └──1:N── exception_evidence
                   ├──1:N── behaviour_snapshots
                   ├──1:N── risk_alerts
                   ├──1:N── message_events
                   └──1:N── ledger_events   ← APPEND-ONLY SOURCE OF TRUTH
                                            (also references transaction / payment)
audit_events  (actor → any entity, by type + id)
demo_runs     (scenario id, clock epoch, status)
```

### C.2 Entities

Maps 1:1 onto PRD §7 Core Data Model. Every amount is `INTEGER` minor units (kobo).

| Entity | Key fields | Notes |
|---|---|---|
| `organizations` | id, name, currency, business_metadata | the distributor (PRD: Distributor) |
| `users` | id, org_id, email, password_hash, role `ADMIN\|OPERATOR`, active | FR-A1/A2 |
| `customers` | id, org_id, name, external_ref, status `ACTIVE\|INACTIVE`, created_at | FR-B1/B2 |
| `customer_channels` | id, customer_id, kind `PHONE\|WHATSAPP\|BANK_PAYER_REF`, value, verified | powers match rule R3 |
| `credit_accounts` | id, customer_id (unique), credit_limit_minor, **exposure_minor**\*, **unapplied_credit_minor**\*, state | PRD §7 CreditAccount |
| `transactions` | id, org_id, customer_id, invoice_ref, amount_minor, **amount_paid_minor**\*, **amount_credited_minor**\*, **status**\*, terms_days, issued_at, due_date, source_ref | FR-C1/C3 |
| `transaction_line_items` | id, transaction_id, description, qty, unit_price_minor, line_total_minor | FR-C2, optional |
| `payment_events` | id, org_id, **idempotency_key UNIQUE**, provider, provider_event_id, kind, raw_payload, received_at, outcome | the dedupe boundary, FR-D6 |
| `payments` | id, payment_event_id (unique), customer_id (nullable until matched), amount_minor, **allocated_minor**\*, **match_status**\*, currency, payer_ref, narration, external_ref, occurred_at | PRD §7 Payment |
| `allocations` | id, payment_id, transaction_id, amount_minor, created_by, created_at, reverses_allocation_id | append-only; reversal = new row |
| `reconciliation_decisions` | id, payment_id, candidate_customer_id, confidence, rules_fired (JSON), outcome `AUTO\|SUGGESTED\|UNMATCHED`, decided_at | explainability for FR-D2/D4 |
| `adjustments` | id, transaction_id?, credit_account_id?, kind `CREDIT_NOTE\|WRITE_OFF\|CASH_COLLECTION\|CORRECTION`, amount_minor, reason, created_by, created_at | PRD §8 manual adjustments |
| `exceptions` | id, customer_id, transaction_id?, payment_id?, type `SHORT_DELIVERY\|DAMAGED\|WRONG_QTY\|AMBIGUOUS_PAYMENT\|OTHER`, status, claimed_amount_minor, reason, resolution, resolved_by, opened_at, resolved_at | FR-E1/E3 |
| `exception_notes` | id, exception_id, author_user_id, body, created_at | append-only, FR-E2 |
| `exception_evidence` | id, exception_id, label, ref (uri/filename), created_at | reference only; no object store in MVP |
| `ledger_events` | **seq INTEGER PK AUTOINCREMENT**, id, org_id, customer_id, transaction_id?, payment_id?, type, payload JSON, actor_user_id?, **dedupe_key UNIQUE**?, occurred_at, recorded_at | **append-only, trigger-enforced** |
| `behaviour_snapshots` | id, customer_id, computed_at, status `SCORED\|INSUFFICIENT_HISTORY`, score, band, factors JSON, facts JSON | FR-G1/G2/G3; immutable history so *changes* are explainable |
| `risk_alerts` | id, customer_id, type, severity, message, factors JSON, metrics JSON, status `OPEN\|ACKNOWLEDGED\|CLEARED`, **dedupe_key UNIQUE**, raised_at | FR-G4/G5 |
| `message_events` | id, customer_id, direction `OUT\|IN`, template_id, channel, to_value, body, payload JSON, status, created_at | PRD §7 MessageEvent, FR-F |
| `audit_events` | id, actor_user_id, action, entity_type, entity_id, before JSON, after JSON, request_id, created_at | FR-A3, PRD §13 observability |
| `demo_runs` | id, scenario_id, clock_epoch, seed, status, started_at | deterministic replay |

`*` = **projection column**: derived, rebuildable, never authoritative.

### C.3 Integrity rules enforced in the database, not just in code

1. `ledger_events`: `BEFORE UPDATE` and `BEFORE DELETE` triggers → `RAISE(ABORT)`. (verified working)
2. Same triggers on `allocations`, `adjustments`, `exception_notes`, `payment_events`,
   `behaviour_snapshots`, `message_events`, `audit_events`.
3. `UNIQUE(payment_events.idempotency_key)` — FR-D6, and `UNIQUE(ledger_events.dedupe_key)`.
4. `UNIQUE(transactions.org_id, invoice_ref)` where invoice_ref is not null.
5. `CHECK(amount_minor > 0)` on transactions, payments, allocations, adjustments.
6. `CHECK(amount_paid_minor + amount_credited_minor <= amount_minor)` — over-allocation is
   structurally impossible; overpayment must land in `unapplied_credit_minor`.
7. `foreign_keys = ON`, `journal_mode = WAL`.

### C.4 Portability

All SQL is confined to `src/db/migrations/*.sql` and `src/db/repositories/*.ts`. The dialect surface we
use is deliberately narrow (no SQLite-specific expressions in queries), so a PostgreSQL swap is a
migration rewrite plus a driver change in `connection.ts` — not an application rewrite.

---

## D. Core domain / state machines

### D.1 Transaction

Payment state, a pure fold of allocations + adjustments:

```
                    ┌──────────── CANCELLED   (only from OPEN with zero payments; ADMIN)
                    │
   TRANSACTION_CREATED
          │
          ▼
        OPEN ──────► PARTIALLY_PAID ──────► SETTLED
          ▲              │   ▲                 │
          │              │   │                 │  allocation reversed / payment reversed
          └──────────────┘   └─────────────────┘  (re-opens; new event, never a rewrite)

 settled_amount = amount_paid_minor + amount_credited_minor
 SETTLED        when settled_amount == amount_minor
 PARTIALLY_PAID when 0 < settled_amount < amount_minor
 OPEN           when settled_amount == 0
```

**`DISPUTED` is an overlay, not a fifth mutually-exclusive state.** A transaction can be
partially paid *and* disputed, so storing them in one column would lose information. The display
status the PRD asks for in FR-C3 is computed as: `open exception exists ? DISPUTED : paymentState`.
The underlying payment state is never destroyed by a dispute.

### D.2 Payment

```
 PaymentPending  ──►  PENDING
 PaymentReceived ──►  RECEIVED ──┬──► UNMATCHED             (confidence < 0.50, review queue)
                                 ├──► SUGGESTED             (0.50–0.89, review + prefilled suggestion)
                                 ├──► PARTIALLY_ALLOCATED   (0 < allocated < amount)
                                 └──► MATCHED               (allocated == amount)
 PaymentReversed ──►  REVERSED   (terminal; reverses every allocation via new events)
 PaymentFailed   ──►  FAILED     (terminal; no ledger effect)
```

`UNMATCHED`/`SUGGESTED`/`PARTIALLY_ALLOCATED` → `MATCHED` on manual or further allocation.
Nothing auto-allocates below the threshold, ever (PRD §8).

### D.3 Exception

```
 OPEN ──► UNDER_REVIEW ──┬──► RESOLVED_UPHELD    → posts a CREDIT_NOTE adjustment (ADMIN)
                         ├──► RESOLVED_REJECTED   → no ledger effect, reason recorded
                         └──► WITHDRAWN
 OPEN ──► WITHDRAWN
```
Resolution never edits the disputed transaction. It appends `EXCEPTION_RESOLVED` and, if upheld, an
`ADJUSTMENT_POSTED` credit note that reduces the outstanding balance forward-only.

### D.4 Risk alert

```
 OPEN ──► ACKNOWLEDGED ──► CLEARED        (CLEARED when the condition no longer holds)
```
`dedupe_key` = `customer_id:type:period_bucket`, so a 2.5-second poll cannot spam duplicates.

### D.5 Ledger event catalogue

`TRANSACTION_CREATED`, `TRANSACTION_CANCELLED`, `PAYMENT_RECEIVED`, `PAYMENT_ALLOCATED`,
`PAYMENT_UNALLOCATED`, `PAYMENT_REVERSED`, `PAYMENT_FAILED`, `ADJUSTMENT_POSTED`,
`EXCEPTION_OPENED`, `EXCEPTION_RESOLVED`, `CREDIT_LIMIT_CHANGED`.

`project.ts` folds this stream into every projection column. `rebuildProjections()` replays from
`seq = 0`. The invariant test asserts live == rebuilt.

### D.6 Reconciliation (deterministic, ordered, explainable)

Candidate customer resolution — highest-confidence rule wins; ties are ambiguous by construction:

| Rule | Signal | Confidence |
|---|---|---|
| R1 | explicit `customer_id` or exact `invoice_ref` in the payload | 1.00 |
| R2 | exact invoice-reference token found in narration | 0.95 |
| R3 | `payer_ref` matches a registered `customer_channels` bank ref | 0.85 |
| R4 | normalized name token overlap yields exactly one candidate | 0.60 |
| R5 | amount exactly equals the outstanding of one open transaction | **+0.15** boost |
| — | two or more equally-scored candidates | capped at 0.40 |

Then, within the chosen customer, the allocation plan:
1. exact-outstanding match on a single open transaction → allocate there;
2. otherwise **FIFO by `due_date`, then `issued_at`, then `id`** — fully specified tie-breaks, cascading
   across transactions until the payment is exhausted;
3. any remainder → `unapplied_credit_minor` on the credit account. Never silently absorbed.

Thresholds in `reconciliation/config.ts`: `AUTO_MATCH = 0.90`, `REVIEW_FLOOR = 0.50`.
Every decision persists the rules that fired and the score — that is the on-screen explanation and
the answer to "how did it decide?".

### D.7 Trust Score (PRD §9, canonical)

Gate first (FR-G2): fewer than **5 transactions** and less than **30 days** tenure →
`INSUFFICIENT_HISTORY`, with visible progress ("3 of 5 transactions"). No score is invented for a new
customer.

Each factor is a pure function `LedgerFacts → { subscore 0..100, inputs, explanation }`:

| # | Factor | Weight | Deterministic definition |
|---|---|---|---|
| 1 | Repayment consistency | 30% | share of due obligations settled without ever becoming overdue |
| 2 | Timeliness / days outstanding | 20% | amount-weighted mean days-to-settle vs terms; piecewise linear, `≤ terms → 100`, `terms+30 → 0` |
| 3 | Payment-velocity stability | 15% | inverted coefficient of variation of per-period payment totals |
| 4 | Outstanding exposure trend | 15% | credit-limit utilisation blended with 30-day direction of change |
| 5 | Dispute frequency / resolution | 10% | disputes per 10 transactions, penalised; softened by fast resolution |
| 6 | Relationship tenure / consistency | 10% | months active × share of months with activity |

`score = round(Σ wᵢ · subscoreᵢ)`; bands 0–39 High risk, 40–59 Watch, 60–79 Good, 80–100 Strong.
The response always carries all six factors with `weightedContribution`, so FR-G3 and the
"≥2 contributing factors" success metric hold by construction rather than by UI discipline.

Snapshots are immutable, so a score *change* is explainable by diffing two snapshots
("−8 points: timeliness −22, exposure trend −9").

**The weights are the PRD's illustrative MVP weights and the UI must label them as such** (PRD §9
says validate before production use).

### D.8 Anomaly detection (statistical threshold, no model)

```
current   = Σ confirmed payments in the trailing 7 days
baseline  = mean of the four preceding 7-day windows
delta_pct = (current − baseline) / baseline
```
Fewer than two non-empty baseline windows → `INSUFFICIENT_DATA` (no alert).

| Alert | Condition | Why two factors |
|---|---|---|
| `PAYMENT_VELOCITY_DROP` | `delta_pct ≤ −0.35` **and** 30-day exposure change `> 0` | drop + rising exposure |
| `OVERDUE_ESCALATION` | oldest overdue crosses 30 days **and** utilisation `> 50%` | ageing + utilisation |
| `DISPUTE_SPIKE` | `≥ 2` open exceptions **and** exposure `> 0` | dispute count + exposure |

Severity from magnitude bands. Copy is advisory, per PRD §11 and the "never claim default" safety rule:

> "Behavioural change detected: payment velocity down 42% over the last 7 days while outstanding
> exposure rose 18%. Review current credit exposure."

One sentence explains any alert under judge questioning: *a trailing-average comparison crossing a
fixed threshold.* Nothing is trained.

### D.9 Payment adapter contract

```
NormalizedPaymentEvent {
  kind: 'PaymentReceived' | 'PaymentPending' | 'PaymentReversed' | 'PaymentFailed'
  providerEventId, idempotencyKey, amountMinor, currency, occurredAt,
  payerRef?, narration?, externalRef?, customerHint?, raw
}
```
Exactly the four event kinds PRD §12 specifies. Sole implementation: `SimulatedAdapter`, deterministic
and seeded. A `WemaAdapter` would be a new file implementing the same interface — deliberately
not built (constraint 4).

### D.10 Messaging contract

`MessageGateway.send(customer, templateId, vars) → MessageEvent`, sole implementation
`SimulatedWhatsAppGateway` — renders, persists, no network. Five templates per PRD §11: payment
confirmation, partial-payment confirmation, outstanding balance, statement response, dispute
acknowledgement. Inbound simulation is a keyword router (`BALANCE`, `STATEMENT`) — plain string
matching, no model in the path.

---

## E. Implementation phases

Each phase ends **green and demoable**. PRD §20's build sequence, with a scaffold phase in front and
acceptance hardening at the back.

| Phase | Scope | PRD refs | Exit criteria |
|---|---|---|---|
| **0. Scaffold + spikes** | Next app, tsconfig, migrations runner, `npm test`, determinism/boundary grep checks, CI script. **Spike: Next.js + `node --test` TS interop** (see R-2) | §13 | `npm test` green with one placeholder test; `npm run dev` serves a page; migration applies |
| **1. Ledger core (pure)** | `money`, `clock`, event union, three state machines, `project.ts`, `rebuildProjections` | Ph.1, FR-C4, FR-E4 | Full unit suite green **with no database and no UI**. Rebuild invariant test passes |
| **2. Persistence + auth + CRUD** | migrations + triggers, repositories, session auth, roles, customer & transaction create/list, dashboard shell | Ph.1–2, FR-A, FR-B, FR-C | Login works; create customer + obligation in **< 20 s** (§21); append-only triggers proven by test |
| **3. Payments + reconciliation** | adapter interface, simulated adapter, `POST /api/webhooks/payments`, idempotent ingest, matching rules, allocation, partial payments, review queue | Ph.3, FR-D, §8 | Duplicate key posts once; partial leaves correct balance; low-confidence lands in the queue |
| **4. Exceptions + adjustments + statement** | dispute open/resolve, notes/evidence, credit notes, write-offs, cash collections, customer statement | Ph.3, FR-E, FR-H4 | Resolution posts a new credit-note event; original obligation still intact in history |
| **5. Messaging + polling** | 5 templates, WhatsApp pane, inbound keyword router, `/api/stream/changes`, 2.5 s client polling | Ph.4, FR-F, FR-D5 | Balance updates on screen **≤ 3 s** after a simulated payment, no page refresh |
| **6. Trust Score** | facts assembler, 6 factors, weighted sum, history gate, snapshots, factor breakdown UI | Ph.5, FR-G1–G3 | Golden-fixture scores match; gate blocks thin-history customers; all 6 factors visible |
| **7. Anomaly + Risk Center** | 3 detectors, alert dedupe, severity, Risk Center screen with explanations | Ph.6, FR-G4–G5 | Scripted deterioration raises exactly one alert showing **≥ 2** factors |
| **8. Demo mode** | seed (1 distributor, 3 customers), scenario timelines, replay runner, one-click reset | Ph.7, §14 | Same scenario run twice from clean state → identical final ledger hash |
| **9. Hardening + rehearsal** | one test per §21 criterion, reporting screens (FR-H1–H3), `ASSUMPTIONS.md`, `DEMO_SCRIPT.md`, backup recording | Ph.8, §16, §21 | All eight acceptance criteria automated and green; demo rehearsed end-to-end |

Phases 1–5 are P0 and constitute a defensible demo on their own. 6–8 are the P1 intelligence layer.
**Nothing from PRD §19's P2 list gets built** — no WebSockets, no external exports, no additional
payment rails, no local model for dispute notes.

Screen priority if time compresses: Customer Detail → Payment Review → Risk Center are demo-critical;
Home, Customer List, Create Transaction, Exception Detail, Demo Mode follow.

---

## F. Testing strategy

`npm test` = `node --test` + two static checks. No test framework, no mocking library, target **< 10 s**.

**Static gates (run first, fail loudly)**
- `src/domain/**` contains no `Date.now(`, `new Date(`, `Math.random(` → determinism is enforced, not hoped for.
- `src/domain/**` imports nothing from `db`, `services`, `adapters`, or `app` → constraint 9 holds mechanically.

**Unit — `tests/unit/`, pure domain, no database**
- money arithmetic and rounding at boundaries
- three state machines: every legal transition, and every illegal one rejected
- `project.ts` fold, including out-of-order and reversal events
- reconciliation rules as a **table-driven** suite: one case per rule, plus ambiguity caps and the
  exact threshold boundaries (0.89 → review, 0.90 → auto)
- allocation: exact match, FIFO cascade, overpayment → unapplied credit, tie-break determinism
- each Trust Score factor independently, then the weighted sum against **golden fixtures**; the
  history gate at 4 vs 5 transactions and 29 vs 30 days
- anomaly boundaries: −34.9% (no alert) vs −35.0% (alert); insufficient-baseline case
- template rendering

**Integration — `tests/integration/`, services against `:memory:` SQLite**
- **idempotency**: same key twice → one ledger event, one payment, identical response body
- append-only triggers reject `UPDATE`/`DELETE` on every protected table
- partial-payment sequences leave exact outstanding balances
- payment reversal re-opens a settled transaction through new events only
- exception upheld → credit note posted, original obligation untouched in history
- role guard: OPERATOR is refused a manual adjustment, ADMIN allowed, both audited
- **projection invariant**: after a seeded pseudo-random sequence of operations,
  `rebuildProjections()` equals live projections

**Acceptance — `tests/acceptance/`, one test per PRD §21 criterion**
1. customer + obligation created in < 20 s (measured as service-call latency, not typing)
2. simulated payment updates the right balance, observed via the polling endpoint
3. partial payment leaves the correct outstanding balance
4. unmatched payment appears in the review queue and is **not** assigned
5. a customer-facing confirmation message is produced
6. behavioural change produces a visible alert with an explanation
7. full demo repeats from clean state → identical ledger hash, no corruption
8. `ASSUMPTIONS.md` enumerates what is real / simulated / synthetic / future

**Success-metric tests (PRD §16)** — duplicate postings == 0; balance-update latency measured < 3 s;
every alert asserted to carry ≥ 2 factors; scripted demo runs three times consecutively.

Not tested automatically: React rendering. A short manual smoke checklist in `DEMO_SCRIPT.md` covers
the screens. For a hackathon, UI test infrastructure would cost more than it protects.

---

## G. Potential risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| **R-1** | **SQLite instead of PRD §13's PostgreSQL.** Neither Postgres nor Docker is installed here. | High (needs sign-off) | SQLite gives us the PRD's own "zero external dependency" demo-reliability metric. All SQL confined to `migrations/` + `repositories/`, dialect surface kept narrow → Postgres becomes a migration rewrite, not an app rewrite. Judge answer: "SQLite for demo determinism; the data access layer is Postgres-ready." **Decision D-1.** |
| **R-2** | Native TS type-stripping is verified for `node --test`, but the **Next.js + explicit `.ts` import-extension interaction is unverified**. | Medium | Phase 0 spike task. If it fights us, add exactly one devDependency (`tsx` or `vitest`) rather than contorting the source layout. Flagged early because it changes the import convention everywhere. |
| **R-3** | Type-stripping cannot compile `enum`, `namespace`, or constructor parameter properties. | Low | Convention: `as const` objects + union types (already used in the probe), plain classes, `import type` for type-only imports. Documented in `README.md`. |
| **R-4** | `node:sqlite` is experimental in Node 22 and prints a warning. | Low | Pin `engines.node = "22.x"`, commit the version, document it. API is the same shape as `better-sqlite3`, so switching is a one-file change if it ever misbehaves. |
| **R-5** | **Feature creep** — 8 screens and 8 PRD requirement groups in hackathon time. | High | Phase gates; explicit screen priority order; the P2 list is banned outright. Every phase ends demoable, so we can stop at any boundary and still have a demo. |
| **R-6** | Determinism leaks (a stray `Date.now()` in domain code) silently break replay and golden tests. | Medium | The grep gate in `npm test`. Cheap, mechanical, catches it on the commit that introduces it. |
| **R-7** | Over-engineering reconciliation into a scoring engine. | Medium | Rule set **frozen at R1–R5** and two thresholds. New rules need a written justification. |
| **R-8** | Trust Score weights are the PRD's own illustrative numbers; a judge may read them as validated. | Medium | UI labels them "illustrative MVP weighting — not validated for production" (PRD §9's language). Never presented as a credit-bureau score (PRD §17). |
| **R-9** | Demo reset leaves partial state and corrupts a second run. | Medium | Reset = delete the DB file, migrate, re-seed. Never partial `DELETE`s. Acceptance test 7 asserts identical ledger hash across runs. |
| **R-10** | Overpayment / multi-invoice remainder is the classic ledger hole. | Medium | `unapplied_credit_minor` is a first-class projection plus a `CHECK` constraint making over-allocation structurally impossible. Direct unit coverage. |
| **R-11** | SQLite single-writer contention under the 2.5 s poll from several browser tabs. | Low | WAL mode; polling endpoint is one indexed `MAX(seq)` read; writes are short. Single-presenter demo load. |
| **R-12** | Live-demo failure on stage. | Medium | Everything is local and simulated. `npm run demo:reset` returns a clean state in seconds, plus the PRD §14 recorded backup walkthrough. |
| **R-13** | Judges probe "is this really AI?" | Low | Scripted one-liners: the score is a published six-factor weighted sum computed from the ledger; the alert is a trailing-average comparison against a fixed threshold. Nothing is trained, by design (PRD §10). |
| **R-14** | Scope of "immutable" misunderstood mid-build and someone adds an `UPDATE` to a ledger table. | Low | Enforced by database triggers, not convention — the write fails loudly in tests. |

---

## Decisions needing your sign-off before Phase 0

**D-1 — Database.** Recommend **SQLite via `node:sqlite`** for the hackathon, with SQL isolated for a
later Postgres swap. This deviates from PRD §13, which names PostgreSQL. The alternative that keeps
Postgres is a hosted instance (Neon/Supabase), which introduces the exact on-stage network dependency
PRD §2 and §16 tell us to eliminate. *Your call.*

**D-2 — Styling.** Eight screens of hand-written CSS is real hackathon hours. Recommend **Tailwind v4**
as a single build-time dependency (no runtime cost). Strictly speaking it is not required by the PRD,
so it brushes against constraint 3 — hence flagging rather than assuming. Fallback: one global
stylesheet with design tokens. *Your call.*

**D-3 — Demo sector.** PRD Build-Lock §1 leaves the trade category to the team ("whichever sector the
team can validate most strongly"; the ledger logic is identical). The PRD's own examples use building
materials — Adeyemi Wholesale supplying Grace Retail & Trading, cement bags, a 12-bag short-delivery
dispute. Recommend seeding exactly that so the demo data matches the document. *Confirm or name
another sector.*

**D-4 — First commit.** The repo has zero commits. Recommend committing the PRD, this document, and a
`.gitignore` as the baseline before any code lands, so the phase boundaries are legible in history.
