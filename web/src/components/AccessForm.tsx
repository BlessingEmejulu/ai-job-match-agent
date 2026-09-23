'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function AccessForm() {
    const router = useRouter();
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
        setBusy(false);
        if (res.ok) router.refresh();
        else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Sign-in failed.');
    }

    return (
        <form onSubmit={submit} className="mx-auto max-w-md space-y-6 rounded-3xl border border-line bg-paper p-8 shadow-soft sm:p-10">
            <div className="space-y-2">
                <p className="font-display text-2xl text-forest-deep">Private access</p>
                <p className="text-sm leading-relaxed text-muted">Live searches spend real credits, so they are open to people with the access code.</p>
            </div>
            <div className="flex flex-col gap-1.5">
                <label htmlFor="code" className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                    Access code
                </label>
                <input
                    id="code"
                    type="password"
                    autoComplete="off"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="h-12 rounded-xl border border-line bg-paper px-4 text-base transition hover:border-line-strong focus:border-gold"
                />
            </div>
            {error && (
                <p role="alert" className="rounded-xl bg-rose-wash px-4 py-3 text-sm text-rose-ink">
                    {error}
                </p>
            )}
            <button disabled={busy} className="h-12 w-full rounded-full bg-forest text-sm font-medium text-paper transition hover:bg-forest-deep disabled:opacity-60">
                {busy ? 'Checking…' : 'Continue'}
            </button>
        </form>
    );
}
