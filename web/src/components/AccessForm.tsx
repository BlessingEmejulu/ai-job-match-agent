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
        <form onSubmit={submit} className="max-w-sm space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-700">Live runs cost the site owner real credits, so they are limited to people with the access code.</p>
            <div className="flex flex-col">
                <label htmlFor="code" className="text-sm font-medium text-slate-800">
                    Access code
                </label>
                <input id="code" type="password" autoComplete="off" required value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 rounded-md border border-slate-300 px-2 py-1.5" />
            </div>
            {error && (
                <p role="alert" className="text-sm text-rose-800">
                    {error}
                </p>
            )}
            <button disabled={busy} className="rounded-md bg-teal-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
                {busy ? 'Checking…' : 'Continue'}
            </button>
        </form>
    );
}
