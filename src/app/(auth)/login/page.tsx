'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import { login } from '@/lib/api/endpoints';
import { Button, Field, FormError, Input } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const validate = () => {
    const errs: typeof fieldErrors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Enter a valid email address';
    if (password.length < 1) errs.password = 'Password is required';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(undefined);
    if (!validate()) return;
    setBusy(true);
    try {
      await login(email.trim(), password);
      const next = params.get('next');
      router.replace(next && next.startsWith('/') ? next : '/');
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(
          err.status === 401
            ? 'Incorrect email or password.'
            : err.isUnavailable
              ? 'The SyncStore API is not reachable yet. Start the backend and try again.'
              : err.message,
        );
      } else {
        setFormError('Unexpected error — please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Email" error={fieldErrors.email}>
        <Input
          type="email"
          autoComplete="email"
          placeholder="you@distributor.ng"
          value={email}
          invalid={!!fieldErrors.email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Password" error={fieldErrors.password}>
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          invalid={!!fieldErrors.password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <FormError message={formError} />
      <Button type="submit" busy={busy} className="w-full">
        Sign in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-500 text-lg font-bold text-white">
            S
          </span>
          <span className="text-2xl font-semibold tracking-tight text-white">SyncStore</span>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <h1 className="mb-1 text-lg font-semibold text-slate-900">Sign in</h1>
          <p className="mb-5 text-sm text-slate-500">
            Credit, payments and trust intelligence for your distribution business.
          </p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">
          Demo environment — all payments and messages are simulated.
        </p>
      </div>
    </div>
  );
}
