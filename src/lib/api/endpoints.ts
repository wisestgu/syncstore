/**
 * Typed endpoint functions — components never call fetch/api() directly,
 * they import from here. Paths follow docs/ARCHITECTURE.md §B (src/app/api tree).
 * Reconcile against docs/API_CONTRACT.md when the backend publishes it.
 */
import { api, qs } from './client';
import type {
  ChangesResponse,
  Customer,
  DashboardSummary,
  DemoState,
  ExceptionCase,
  ExceptionStatus,
  ExceptionType,
  LedgerEventView,
  MessageEvent,
  Paginated,
  Payment,
  RiskAlert,
  Statement,
  Transaction,
  User,
} from './types';

// ── Auth ────────────────────────────────────────────────────────────────
export const login = (email: string, password: string) =>
  api<{ user: User }>('/api/auth/login', { method: 'POST', body: { email, password } });

export const logout = () => api<void>('/api/auth/logout', { method: 'POST' });

export const me = () => api<{ user: User }>('/api/auth/me');

// ── Stream (polling high-water mark) ────────────────────────────────────
export const getChanges = (since: number, signal?: AbortSignal) =>
  api<ChangesResponse>(`/api/stream/changes${qs({ since })}`, { signal });

// ── Dashboard / reporting ───────────────────────────────────────────────
export const getDashboard = () => api<DashboardSummary>('/api/reports/dashboard');

// ── Customers ───────────────────────────────────────────────────────────
export const listCustomers = (opts: { q?: string; status?: string; band?: string } = {}) =>
  api<Paginated<Customer>>(`/api/customers${qs(opts)}`);

export const getCustomer = (id: string) => api<Customer>(`/api/customers/${id}`);

export const createCustomer = (body: {
  name: string;
  externalRef?: string;
  creditLimitMinor: number;
  phone?: string;
  bankPayerRef?: string;
}) => api<Customer>('/api/customers', { method: 'POST', body });

export const getCustomerStatement = (id: string) =>
  api<Statement>(`/api/customers/${id}/statement`);

export const getCustomerTimeline = (id: string) =>
  api<Paginated<LedgerEventView>>(`/api/customers/${id}/timeline`);

// ── Transactions ────────────────────────────────────────────────────────
export const listTransactions = (opts: { customerId?: string; status?: string; q?: string } = {}) =>
  api<Paginated<Transaction>>(`/api/transactions${qs(opts)}`);

export const getTransaction = (id: string) => api<Transaction>(`/api/transactions/${id}`);

export const createTransaction = (body: {
  customerId: string;
  invoiceRef?: string;
  amountMinor: number;
  termsDays: number;
  lineItems?: { description: string; qty: number; unitPriceMinor: number }[];
}) => api<Transaction>('/api/transactions', { method: 'POST', body });

// ── Payments / review queue ─────────────────────────────────────────────
export const listPayments = (opts: { status?: string; customerId?: string; q?: string } = {}) =>
  api<Paginated<Payment>>(`/api/payments${qs(opts)}`);

export const getPayment = (id: string) => api<Payment>(`/api/payments/${id}`);

export const allocatePayment = (
  id: string,
  body: { customerId: string; allocations: { transactionId: string; amountMinor: number }[] },
) => api<Payment>(`/api/payments/${id}/allocate`, { method: 'POST', body });

// ── Exceptions (disputes) ───────────────────────────────────────────────
export const listExceptions = (opts: { status?: string; type?: string; customerId?: string } = {}) =>
  api<Paginated<ExceptionCase>>(`/api/exceptions${qs(opts)}`);

export const getException = (id: string) => api<ExceptionCase>(`/api/exceptions/${id}`);

export const createException = (body: {
  customerId: string;
  transactionId?: string;
  paymentId?: string;
  type: ExceptionType;
  claimedAmountMinor?: number;
  reason: string;
}) => api<ExceptionCase>('/api/exceptions', { method: 'POST', body });

export const addExceptionNote = (id: string, bodyText: string) =>
  api<ExceptionCase>(`/api/exceptions/${id}/notes`, { method: 'POST', body: { body: bodyText } });

export const updateExceptionStatus = (id: string, status: ExceptionStatus) =>
  api<ExceptionCase>(`/api/exceptions/${id}/status`, { method: 'POST', body: { status } });

export const resolveException = (
  id: string,
  body: { outcome: 'UPHELD' | 'REJECTED'; resolution: string; creditAmountMinor?: number },
) => api<ExceptionCase>(`/api/exceptions/${id}/resolve`, { method: 'POST', body });

// ── Risk ────────────────────────────────────────────────────────────────
export const listAlerts = (opts: { status?: string; customerId?: string } = {}) =>
  api<Paginated<RiskAlert>>(`/api/risk/alerts${qs(opts)}`);

export const acknowledgeAlert = (id: string) =>
  api<RiskAlert>(`/api/risk/alerts/${id}/acknowledge`, { method: 'POST' });

// ── Messaging (simulated WhatsApp) ──────────────────────────────────────
export const listMessages = (customerId: string) =>
  api<Paginated<MessageEvent>>(`/api/messages${qs({ customerId })}`);

/** Simulated inbound customer message (keyword router: BALANCE, STATEMENT). */
export const sendInboundMessage = (customerId: string, body: string) =>
  api<MessageEvent>('/api/messages/inbound', { method: 'POST', body: { customerId, body } });

// ── Demo mode — must hit REAL backend actions (no fake demo backend) ────
export const getDemoState = () => api<DemoState>('/api/demo/run');

export const startDemo = (scenarioId?: string) =>
  api<DemoState>('/api/demo/run', { method: 'POST', body: { action: 'start', scenarioId } });

export const nextDemoEvent = () =>
  api<DemoState>('/api/demo/run', { method: 'POST', body: { action: 'next' } });

export const resetDemo = () => api<DemoState>('/api/demo/reset', { method: 'POST' });
