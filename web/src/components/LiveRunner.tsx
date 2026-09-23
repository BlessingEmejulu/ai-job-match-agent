'use client';

import { useEffect, useRef, useState } from 'react';

import type { OpportunityView } from '@/lib/opportunity';
import type { SummaryView } from '@/lib/summary';

import { OpportunityExplorer } from './OpportunityExplorer';

type Phase = 'idle' | 'starting' | 'polling' | 'done' | 'error';
interface StatusResponse {
    status: string;
    statusMessage: string | null;
    terminal: boolean;
    summary: SummaryView | null;
}

const STATUS_TEXT: Record<string, string> = {
    READY: 'Queued on Apify…',
    RUNNING: 'Running: reading verified employer boards…',
    SUCCEEDED: 'Finished',
    FAILED: 'The run failed',
    'TIMING-OUT': 'Timing out…',
    'TIMED-OUT': 'The run timed out',
    ABORTING: 'Stopping…',
    ABORTED: 'The run was stopped',
};

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col">
            <label htmlFor={id} className="text-sm font-medium text-slate-800">
                {label}
            </label>
            {hint && (
                <span id={`${id}-hint`} className="text-xs text-slate-600">
                    {hint}
                </span>
            )}
            {children}
        </div>
    );
}

const input = 'mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm';

export function LiveRunner() {
    const [phase, setPhase] = useState<Phase>('idle');
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<StatusResponse | null>(null);
    const [items, setItems] = useState<OpportunityView[]>([]);
    const [more, setMore] = useState<{ ref: string; offset: number } | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            if (timer.current) clearTimeout(timer.current);
        };
    }, []);

    async function loadItems(ref: string, offset: number) {
        const res = await fetch(`/api/runs/${encodeURIComponent(ref)}/items?offset=${offset}`);
        if (!res.ok) return setError('Could not load results.');
        const body = (await res.json()) as { items: OpportunityView[]; hasMore: boolean };
        setItems((prev) => [...prev, ...body.items]);
        setMore(body.hasMore ? { ref, offset: offset + body.items.length } : null);
    }

    async function poll(ref: string, attempt: number) {
        if (!alive.current) return;
        const res = await fetch(`/api/runs/${encodeURIComponent(ref)}`);
        if (!res.ok) {
            setPhase('error');
            setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not read run status.');
            return;
        }
        const body = (await res.json()) as StatusResponse;
        setStatus(body);
        if (body.terminal) {
            setPhase('done');
            if (body.status === 'SUCCEEDED' || (body.summary?.delivered ?? 0) > 0) await loadItems(ref, 0);
            return;
        }
        // Stop polling at terminal states; otherwise back off gently (3s → 6s).
        timer.current = setTimeout(() => poll(ref, attempt + 1), Math.min(6000, 3000 + attempt * 250));
    }

    async function start(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setPhase('starting');
        setError(null);
        setItems([]);
        setStatus(null);
        const payload = {
            roleKeywords: String(fd.get('roleKeywords') ?? ''),
            countries: String(fd.get('countries') ?? ''),
            workArrangements: fd.getAll('workArrangements').map(String),
            seniorityLevels: fd.getAll('seniorityLevels').map(String),
            skills: String(fd.get('skills') ?? ''),
            yearsExperience: String(fd.get('yearsExperience') ?? ''),
            desiredRoles: String(fd.get('desiredRoles') ?? ''),
            candidateCountry: String(fd.get('candidateCountry') ?? ''),
            studentStatus: String(fd.get('studentStatus') ?? ''),
        };
        const res = await fetch('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        const body = (await res.json().catch(() => ({}))) as { ref?: string; error?: string };
        if (!res.ok || !body.ref) {
            setPhase('error');
            setError(body.error ?? 'Could not start the run.');
            return;
        }
        setPhase('polling');
        poll(body.ref, 0);
    }

    const busy = phase === 'starting' || phase === 'polling';
    const s = status?.summary;

    return (
        <div className="space-y-6">
            <form onSubmit={start} className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2" aria-describedby="privacy-note">
                <fieldset className="space-y-3">
                    <legend className="text-sm font-semibold text-slate-900">1. Roles and location</legend>
                    <Field id="roleKeywords" label="Role keywords" hint="Comma-separated, e.g. data analyst, intern">
                        <input id="roleKeywords" name="roleKeywords" className={input} aria-describedby="roleKeywords-hint" />
                    </Field>
                    <Field id="countries" label="Countries you can work from (required)" hint="ISO codes, e.g. NG, KE, GH">
                        <input id="countries" name="countries" required defaultValue="NG" className={input} aria-describedby="countries-hint" />
                    </Field>
                    <fieldset>
                        <legend className="text-sm font-medium text-slate-800">Work arrangement</legend>
                        <div className="mt-1 flex flex-wrap gap-3 text-sm">
                            {['remote', 'hybrid', 'onsite'].map((w) => (
                                <label key={w} className="inline-flex items-center gap-1">
                                    <input type="checkbox" name="workArrangements" value={w} /> {w}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                    <fieldset>
                        <legend className="text-sm font-medium text-slate-800">Seniority</legend>
                        <div className="mt-1 flex flex-wrap gap-3 text-sm">
                            {['internship', 'graduate', 'entry', 'junior', 'mid'].map((w) => (
                                <label key={w} className="inline-flex items-center gap-1">
                                    <input type="checkbox" name="seniorityLevels" value={w} /> {w}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                </fieldset>

                <fieldset className="space-y-3">
                    <legend className="text-sm font-semibold text-slate-900">2. Optional: match against your skills</legend>
                    <Field id="skills" label="Skills" hint="Comma-separated, e.g. SQL, Excel, Python">
                        <input id="skills" name="skills" className={input} aria-describedby="skills-hint" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field id="yearsExperience" label="Years of experience">
                            <input id="yearsExperience" name="yearsExperience" type="number" min={0} max={40} step={0.5} className={input} />
                        </Field>
                        <Field id="candidateCountry" label="Your country (ISO)">
                            <input id="candidateCountry" name="candidateCountry" maxLength={2} className={input} />
                        </Field>
                    </div>
                    <Field id="desiredRoles" label="Desired roles" hint="Defaults to the role keywords">
                        <input id="desiredRoles" name="desiredRoles" className={input} aria-describedby="desiredRoles-hint" />
                    </Field>
                    <Field id="studentStatus" label="Student status">
                        <select id="studentStatus" name="studentStatus" className={input} defaultValue="">
                            <option value="">Prefer not to say</option>
                            <option value="enrolled">Currently enrolled</option>
                            <option value="graduated">Graduated</option>
                            <option value="not_student">Not a student</option>
                        </select>
                    </Field>
                </fieldset>

                <div className="sm:col-span-2">
                    <p id="privacy-note" className="text-xs text-slate-600">
                        Do not enter your name, contact details or CV. Skills, experience and country are sent to the Actor for this run only and are stored in the site owner&apos;s Apify run storage under its retention settings. Matching needs skills, years and your country; otherwise the run only discovers jobs.
                    </p>
                    <button disabled={busy} className="mt-3 rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                        {busy ? 'Working…' : 'Start live run'}
                    </button>
                </div>
            </form>

            <div aria-live="polite" className="space-y-2">
                {phase === 'starting' && <p className="text-sm text-slate-700">Starting a run on Apify…</p>}
                {status && (
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                        <p className="font-medium text-slate-900">
                            Live run status: {STATUS_TEXT[status.status] ?? status.status}
                            {!status.terminal && <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-teal-700" aria-hidden="true" />}
                        </p>
                        {status.statusMessage && <p className="text-slate-700">{status.statusMessage}</p>}
                        {s && (
                            <div className="mt-2 space-y-1 text-slate-700">
                                <p>
                                    Outcome: <strong>{s.outcome.replace(/_/g, ' ')}</strong> · {s.delivered} delivered from {s.listingsDiscovered} listings read
                                </p>
                                <p>Sources: {s.sources.map((x) => `${x.id} (${x.status})`).join(', ')}</p>
                                {s.outcome === 'partial_source_failure' && <p className="text-amber-900">Some sources failed; results come from the others.</p>}
                                {s.outcome === 'total_source_failure' && <p className="text-rose-900">All sources failed. No results could be collected.</p>}
                                {s.outcome === 'no_matches' && <p>The search worked, but nothing matched these filters.</p>}
                                {s.warnings.map((w) => (
                                    <p key={w} className="text-amber-900">
                                        {w}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {error && (
                    <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                        {error}
                    </p>
                )}
            </div>

            {items.length > 0 && <OpportunityExplorer items={items} />}
            {more && (
                <button onClick={() => loadItems(more.ref, more.offset)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm">
                    Load more results
                </button>
            )}
        </div>
    );
}
