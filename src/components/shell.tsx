'use client';

/**
 * Application shell: responsive sidebar navigation, header with user menu,
 * and the auth gate for protected routes.
 *
 * Auth gate behaviour: a real 401 from GET /api/auth/me redirects to /login.
 * If the API is simply unreachable (backend not landed yet), we render the
 * screens with an "API offline" banner instead of locking the UI out — every
 * screen already shows its own unavailable state.
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { logout, me } from '@/lib/api/endpoints';
import type { User } from '@/lib/api/types';
import { humanize } from '@/lib/format';
import { LoadingState } from './ui';

const UserContext = createContext<User | null>(null);
export const useUser = () => useContext(UserContext);

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-[18px] shrink-0" aria-hidden>
    <path d={d} />
  </svg>
);

const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: icon('M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10') },
  { href: '/customers', label: 'Customers', icon: icon('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75') },
  { href: '/transactions', label: 'Transactions', icon: icon('M4 6h16M4 12h16M4 18h10') },
  { href: '/payments', label: 'Payment review', icon: icon('M2 8h20M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM6 15h4') },
  { href: '/disputes', label: 'Disputes', icon: icon('M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01') },
  { href: '/risk', label: 'Risk center', icon: icon('M22 12h-4l-3 9L9 3l-3 9H2') },
  { href: '/whatsapp', label: 'WhatsApp', icon: icon('M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z') },
  { href: '/demo', label: 'Demo mode', icon: icon('M5 3l14 9-14 9V3z') },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 px-2" aria-label="Main">
      {NAV.map((item) => {
        const active =
          item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? 'bg-slate-800 text-white'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 px-4">
      <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500 text-sm font-bold text-white">
        S
      </span>
      <span className="text-base font-semibold tracking-tight text-white">SyncStore</span>
    </Link>
  );
}

function UserMenu({ user, apiOffline }: { user: User | null; apiOffline: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const initials = user
    ? (user.name ?? user.email)
        .split(/[\s@.]+/)
        .slice(0, 2)
        .map((s) => s.charAt(0).toUpperCase())
        .join('')
    : '·';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 hover:bg-slate-100"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
          {initials}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm leading-tight font-medium text-slate-800">
            {user ? (user.name ?? user.email) : apiOffline ? 'Offline preview' : 'Signed out'}
          </span>
          {user && (
            <span className="block text-xs leading-tight text-slate-500">{humanize(user.role)}</span>
          )}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {user && (
            <div className="border-b border-slate-100 px-3 py-2">
              <div className="truncate text-sm font-medium text-slate-800">{user.email}</div>
              <div className="text-xs text-slate-500">
                {user.orgName ?? 'Distributor'} · {humanize(user.role)}
              </div>
            </div>
          )}
          <button
            role="menuitem"
            onClick={async () => {
              try {
                await logout();
              } catch {
                // session may already be gone — proceed to login regardless
              }
              router.push('/login');
            }}
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [phase, setPhase] = useState<'checking' | 'ready' | 'offline'>('checking');
  const [mobileNav, setMobileNav] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    me()
      .then(({ user }) => {
        if (cancelled) return;
        setUser(user);
        setPhase('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.isAuthError) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        } else {
          setPhase('offline');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  if (phase === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Checking session…" />
      </div>
    );
  }

  return (
    <UserContext.Provider value={user}>
      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col gap-5 bg-slate-900 py-5 lg:flex">
          <Logo />
          <NavLinks />
          <div className="mt-auto px-4 text-[11px] leading-relaxed text-slate-500">
            Simulated environment.
            <br />
            No live bank or WhatsApp traffic.
          </div>
        </aside>

        {/* Mobile drawer */}
        {mobileNav && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileNav(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-64 flex-col gap-5 bg-slate-900 py-5">
              <Logo />
              <NavLinks onNavigate={() => setMobileNav(false)} />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col lg:pl-56">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
                onClick={() => setMobileNav(true)}
                aria-label="Open navigation"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5" aria-hidden>
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <span className="text-sm font-medium text-slate-500">
                {user?.orgName ?? 'Distributor workspace'}
              </span>
            </div>
            <UserMenu user={user} apiOffline={phase === 'offline'} />
          </header>

          {phase === 'offline' && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              Backend API is not reachable — screens are shown in preview and will populate once the
              API is running.
            </div>
          )}

          <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </UserContext.Provider>
  );
}
