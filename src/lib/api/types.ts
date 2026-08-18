/**
 * SyncStore API contract types — FRONTEND COPY.
 *
 * Derived from docs/ARCHITECTURE.md (entities §C, state machines §D, routes §B).
 * When the backend developer publishes docs/API_CONTRACT.md, reconcile this file
 * against it. Every amount is INTEGER minor units (kobo) — never floats.
 */

export type Role = 'ADMIN' | 'OPERATOR';

export interface User {
  id: string;
  email: string;
  name?: string;
  role: Role;
  orgId: string;
  orgName?: string;
}

/** §D.1 — payment state fold; DISPUTED is a display overlay, not a fifth state. */
export type TransactionStatus = 'OPEN' | 'PARTIALLY_PAID' | 'SETTLED' | 'CANCELLED';
export type TransactionDisplayStatus = TransactionStatus | 'DISPUTED';

/** §D.2 */
export type PaymentMatchStatus =
  | 'PENDING'
  | 'RECEIVED'
  | 'UNMATCHED'
  | 'SUGGESTED'
  | 'PARTIALLY_ALLOCATED'
  | 'MATCHED'
  | 'REVERSED'
  | 'FAILED';

/** §D.3 */
export type ExceptionStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'RESOLVED_UPHELD'
  | 'RESOLVED_REJECTED'
  | 'WITHDRAWN';

export type ExceptionType =
  | 'SHORT_DELIVERY'
  | 'DAMAGED'
  | 'WRONG_QTY'
  | 'AMBIGUOUS_PAYMENT'
  | 'OTHER';

/** §D.4 */
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'CLEARED';
export type AlertType = 'PAYMENT_VELOCITY_DROP' | 'OVERDUE_ESCALATION' | 'DISPUTE_SPIKE';
export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

/** §D.7 — bands 0–39 / 40–59 / 60–79 / 80–100 */
export type TrustBand = 'HIGH_RISK' | 'WATCH' | 'GOOD' | 'STRONG';

export interface TrustFactor {
  key: string;
  label: string;
  /** 0..1 */
  weight: number;
  /** 0..100 */
  subscore: number;
  weightedContribution: number;
  explanation: string;
}

export interface TrustSummary {
  status: 'SCORED' | 'INSUFFICIENT_HISTORY';
  score?: number;
  band?: TrustBand;
  factors?: TrustFactor[];
  /** FR-G2 visible progress toward the history gate. */
  progress?: {
    transactions: number;
    requiredTransactions: number;
    tenureDays: number;
    requiredTenureDays: number;
  };
  computedAt?: string;
  previous?: { score: number; computedAt: string };
}

export interface CreditAccount {
  creditLimitMinor: number;
  exposureMinor: number;
  unappliedCreditMinor: number;
  state?: string;
}

export interface Customer {
  id: string;
  name: string;
  externalRef?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  creditAccount?: CreditAccount;
  trust?: TrustSummary;
  openExceptions?: number;
  openAlerts?: number;
  lastPaymentAt?: string;
  channels?: CustomerChannel[];
}

export interface CustomerChannel {
  id: string;
  kind: 'PHONE' | 'WHATSAPP' | 'BANK_PAYER_REF';
  value: string;
  verified?: boolean;
}

export interface TransactionLineItem {
  id?: string;
  description: string;
  qty: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface Transaction {
  id: string;
  customerId: string;
  customerName?: string;
  invoiceRef?: string;
  amountMinor: number;
  amountPaidMinor: number;
  amountCreditedMinor: number;
  status: TransactionStatus;
  displayStatus: TransactionDisplayStatus;
  termsDays: number;
  issuedAt: string;
  dueDate: string;
  lineItems?: TransactionLineItem[];
  allocations?: Allocation[];
}

export interface Allocation {
  id: string;
  paymentId: string;
  transactionId: string;
  invoiceRef?: string;
  customerName?: string;
  amountMinor: number;
  createdAt: string;
  createdBy?: string;
  reversesAllocationId?: string;
}

/** §D.6 — persisted explanation of every reconciliation decision. */
export interface ReconciliationDecision {
  candidateCustomerId?: string;
  candidateCustomerName?: string;
  confidence: number;
  rulesFired: string[];
  outcome: 'AUTO' | 'SUGGESTED' | 'UNMATCHED';
  decidedAt?: string;
}

export interface Payment {
  id: string;
  customerId?: string;
  customerName?: string;
  amountMinor: number;
  allocatedMinor: number;
  matchStatus: PaymentMatchStatus;
  currency: string;
  payerRef?: string;
  narration?: string;
  externalRef?: string;
  occurredAt: string;
  reconciliation?: ReconciliationDecision;
  allocations?: Allocation[];
}

export interface ExceptionNote {
  id: string;
  authorUserId?: string;
  authorName?: string;
  body: string;
  createdAt: string;
}

export interface ExceptionEvidence {
  id: string;
  label: string;
  ref: string;
  createdAt: string;
}

export interface ExceptionCase {
  id: string;
  customerId: string;
  customerName?: string;
  transactionId?: string;
  invoiceRef?: string;
  paymentId?: string;
  type: ExceptionType;
  status: ExceptionStatus;
  claimedAmountMinor?: number;
  reason: string;
  resolution?: string;
  resolvedBy?: string;
  openedAt: string;
  resolvedAt?: string;
  notes?: ExceptionNote[];
  evidence?: ExceptionEvidence[];
  timeline?: AuditEntry[];
}

export interface AuditEntry {
  id: string;
  action: string;
  actorName?: string;
  entityType?: string;
  entityId?: string;
  detail?: string;
  createdAt: string;
}

export interface RiskAlert {
  id: string;
  customerId: string;
  customerName?: string;
  type: AlertType;
  severity: AlertSeverity;
  /** Advisory copy — never a loan/default decision (PRD §11, §17). */
  message: string;
  /** ≥2 contributing factors, each human-readable (FR-G5). */
  factors: string[];
  metrics?: Record<string, number | string>;
  status: AlertStatus;
  raisedAt: string;
}

export interface MessageEvent {
  id: string;
  customerId: string;
  customerName?: string;
  direction: 'OUT' | 'IN';
  templateId?: string;
  channel: string;
  toValue?: string;
  body: string;
  status?: string;
  createdAt: string;
}

export interface LedgerEventView {
  seq: number;
  id: string;
  type: string;
  transactionId?: string;
  paymentId?: string;
  summary?: string;
  payload?: Record<string, unknown>;
  occurredAt: string;
}

export interface ActivityItem {
  id: string;
  kind: string;
  customerId?: string;
  customerName?: string;
  summary: string;
  amountMinor?: number;
  occurredAt: string;
}

/** GET /api/reports/dashboard (reportingService, FR-H). */
export interface DashboardSummary {
  totalExposureMinor: number;
  collectionsTodayMinor: number;
  activeCustomers: number;
  customersNeedingAttention: number;
  overdueMinor?: number;
  unappliedCreditMinor?: number;
  recentActivity: ActivityItem[];
  openAlerts: RiskAlert[];
  trustDistribution: { band: TrustBand | 'INSUFFICIENT_HISTORY'; count: number }[];
}

export interface StatementEntry {
  date: string;
  description: string;
  debitMinor?: number;
  creditMinor?: number;
  balanceMinor: number;
}

export interface Statement {
  customerId: string;
  from?: string;
  to?: string;
  openingBalanceMinor: number;
  closingBalanceMinor: number;
  entries: StatementEntry[];
}

/** GET /api/stream/changes?since=<seq> — §A.2 polling high-water mark. */
export interface ChangesResponse {
  seq: number;
}

export interface DemoStep {
  index: number;
  label: string;
  description?: string;
  completed: boolean;
}

export interface DemoState {
  status: 'IDLE' | 'RUNNING' | 'COMPLETE';
  scenarioId?: string;
  stepIndex: number;
  totalSteps: number;
  steps: DemoStep[];
  lastEvent?: string;
}

export interface Paginated<T> {
  items: T[];
  total?: number;
  nextCursor?: string;
}
