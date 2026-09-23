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
    startedAt: string | null;
    summary: SummaryView | null;
}

const STAGES = ['Reading verified employer boards', 'Filtering for your roles and countries', 'Analysing requirements and eligibility', 'Delivering results'];
const TERMINAL_TEXT: Record<string, string> = {
    SUCCEEDED: 'Search complete',
    FAILED: 'The search failed',
    'TIMED-OUT': 'The search timed out',
    ABORTED: 'The search was stopped',
};

/** The Actor reports progress as "Stage n/4 · detail". */
function parseStage(msg: string | null): { stage: number; detail: string } | null {
    const m = msg?.match(/^Stage (\d)\/4 · (.+)$/);
    return m ? { stage: Number(m[1]), detail: m[2]! } : null;
}

const fieldCls = 'h-12 rounded-xl border border-line bg-paper px-4 text-base text-ink placeholder:text-muted/70 transition hover:border-line-strong focus:border-gold';
const labelCls = 'text-[11px] font-medium uppercase tracking-[0.16em] text-muted';

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={id} className={labelCls}>
                {label}
            </label>
            {children}
            {hint && (
                <span id={`${id}-hint`} className="text-xs text-muted">
                    {hint}
                </span>
            )}
        </div>
    );
}

function Choice({ name, value }: { name: string; value: string }) {
    return (
        <label className="cursor-pointer rounded-full border border-line px-4 py-2 text-sm capitalize text-ink-soft transition hover:border-line-strong has-[:checked]:border-forest has-[:checked]:bg-forest has-[:checked]:text-paper has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold">
            <input type="checkbox" name={name} value={value} className="sr-only" /> {value}
        </label>
    );
}

export function LiveRunner() {
    const [phase, setPhase] = useState<Phase>('idle');
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<StatusResponse | null>(null);
    const [items, setItems] = useState<OpportunityView[]>([]);
    const [more, setMore] = useState<{ ref: string; offset: number } | null>(null);
    const [startedAt, setStartedAt] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const alive = useRef(true);
    const lastStage = useRef(0);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            if (timer.current) clearTimeout(timer.current);
        };
    }, []);

    // Elapsed-time clock while a search is in flight.
    useEffect(() => {
        if (phase !== 'polling' && phase !== 'starting') return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [phase]);

    async function loadItems(ref: string, offset: number) {
        const res = await fetch(`/api/runs/${encodeURIComponent(ref)}/items?offset=${offset}`);
        if (!res.ok) return setError('Could not load results.');
        const body = (await res.json()) as { items: OpportunityView[]; hasMore: boolean };
        setItems((prev) => [...prev, ...body.items]);
        setMore(body.hasMore ? { ref, offset: offset + body.items.length } : null);
    }

    async function poll(ref: string, attempt: number) {
        if (!alive.current) return;
        const res = await fetch(`/api/runs/${encodeURIComponent(ref)}`, { cache: 'no-store' });
        if (!res.ok) {
            setPhase('error');
            setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not read the search status.');
            return;
        }
        const body = (await res.json()) as StatusResponse;
        const parsed = parseStage(body.statusMessage);
        if (parsed) lastStage.current = Math.max(lastStage.current, parsed.stage);
        setStatus(body);
        if (body.terminal) {
            setPhase('done');
            if ((body.summary?.delivered ?? 0) > 0) await loadItems(ref, 0);
            return; // stop polling at a terminal state
        }
        timer.current = setTimeout(() => poll(ref, attempt + 1), Math.min(4000, 1500 + attempt * 150));
    }

    async function start(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setPhase('starting');
        setError(null);
        setItems([]);
        setMore(null);
        setStatus(null);
        lastStage.current = 0;
        setStartedAt(Date.now());
        setNow(Date.now());
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
            setError(body.error ?? 'Could not start the search.');
            return;
        }
        setPhase('polling');
        poll(body.ref, 0);
    }

    const busy = phase === 'starting' || phase === 'polling';
    const s = status?.summary;
    const parsed = parseStage(status?.statusMessage ?? null);
    const current = status?.terminal ? (status.status === 'SUCCEEDED' ? 5 : lastStage.current) : Math.max(lastStage.current, status?.status === 'RUNNING' ? 1 : 0);
    const elapsed = startedAt ? Math.max(0, Math.round(((status?.terminal ? Date.parse(s?.finishedAt ?? '') || now : now) - startedAt) / 1000)) : 0;

    return (
        <div className="space-y-12">
            <form onSubmit={start} aria-describedby="privacy-note" className="overflow-hidden rounded-3xl border border-line bg-paper shadow-soft">
                <div className="grid gap-px bg-line lg:grid-cols-2">
                    <fieldset className="space-y-6 bg-paper p-6 sm:p-10">
                        <legend className="contents">
                            <span className="block font-display text-sm text-gold">01</span>
                            <span className="mt-1 block font-display text-2xl text-forest-deep">Roles &amp; location</span>
                        </legend>
                        <Field id="roleKeywords" label="Role keywords" hint="Comma-separated, e.g. data analyst, intern">
                            <input id="roleKeywords" name="roleKeywords" placeholder="software engineer, analyst" className={fieldCls} aria-describedby="roleKeywords-hint" />
                        </Field>
                        <Field id="countries" label="Countries you can work from" hint="ISO codes, e.g. NG, KE, GH, ZA">
                            <input id="countries" name="countries" required defaultValue="NG" className={fieldCls} aria-describedby="countries-hint" />
                        </Field>
                        <fieldset className="space-y-2">
                            <legend className={labelCls}>Work arrangement</legend>
                            <div className="flex flex-wrap gap-2 pt-1">
                                {['remote', 'hybrid', 'onsite'].map((w) => (
                                    <Choice key={w} name="workArrangements" value={w} />
                                ))}
                            </div>
                        </fieldset>
                        <fieldset className="space-y-2">
                            <legend className={labelCls}>Seniority</legend>
                            <div className="flex flex-wrap gap-2 pt-1">
                                {['internship', 'graduate', 'entry', 'junior', 'mid'].map((w) => (
                                    <Choice key={w} name="seniorityLevels" value={w} />
                                ))}
                            </div>
                        </fieldset>
                    </fieldset>

                    <fieldset className="space-y-6 bg-paper p-6 sm:p-10">
                        <legend className="contents">
                            <span className="block font-display text-sm text-gold">02</span>
                            <span className="mt-1 block font-display text-2xl text-forest-deep">
                                Match to your skills <span className="text-base text-muted">— optional</span>
                            </span>
                        </legend>
                        <Field id="skills" label="Skills" hint="Comma-separated, e.g. SQL, Excel, Python">
                            <input id="skills" name="skills" placeholder="SQL, Excel, Python" className={fieldCls} aria-describedby="skills-hint" />
                        </Field>
                        <div className="grid grid-cols-2 gap-4">
                            <Field id="yearsExperience" label="Years of experience">
                                <input id="yearsExperience" name="yearsExperience" type="number" min={0} max={40} step={0.5} className={fieldCls} />
                            </Field>
                            <Field id="candidateCountry" label="Your country">
                                <input id="candidateCountry" name="candidateCountry" maxLength={2} placeholder="NG" className={`${fieldCls} uppercase`} />
                            </Field>
                        </div>
                        <Field id="desiredRoles" label="Desired roles" hint="Defaults to your role keywords">
                            <input id="desiredRoles" name="desiredRoles" className={fieldCls} aria-describedby="desiredRoles-hint" />
                        </Field>
                        <Field id="studentStatus" label="Student status">
                            <select id="studentStatus" name="studentStatus" className={fieldCls} defaultValue="">
                                <option value="">Prefer not to say</option>
                                <option value="enrolled">Currently enrolled</option>
                                <option value="graduated">Graduated</option>
                                <option value="not_student">Not a student</option>
                            </select>
                        </Field>
                    </fieldset>
                </div>

                <div className="flex flex-col gap-6 border-t border-line bg-ivory/50 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-10">
                    <p id="privacy-note" className="max-w-xl text-xs leading-relaxed text-muted">
                        Please don&apos;t enter your name, contact details or CV. Skills, experience and country are used for this search only and kept in the site owner&apos;s Apify run storage under its retention settings. Matching needs skills, years and your country; otherwise the search discovers jobs only.
                    </p>
                    <button disabled={busy} className="h-12 shrink-0 rounded-full bg-forest px-8 text-sm font-medium text-paper shadow-soft transition hover:bg-forest-deep hover:shadow-lift disabled:opacity-60">
                        {busy ? 'Searching…' : 'Start live search'}
                    </button>
                </div>
            </form>

            {(phase !== 'idle' || status) && (
                <section aria-live="polite" aria-label="Search progress" className="rounded-3xl border border-line bg-paper p-6 shadow-soft sm:p-10">
                    <div className="flex flex-wrap items-baseline justify-between gap-4">
                        <div>
                            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">Live search</p>
                            <p className="mt-2 font-display text-2xl text-forest-deep">
                                {phase === 'starting' ? 'Starting on Apify…' : status?.terminal ? (TERMINAL_TEXT[status.status] ?? status.status) : status?.status === 'READY' ? 'Queued…' : phase === 'error' ? 'Something went wrong' : 'In progress'}
                            </p>
                        </div>
                        {startedAt && (
                            <p className="font-display text-3xl tabular-nums text-ink" aria-label={`${elapsed} seconds elapsed`}>
                                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
                            </p>
                        )}
                    </div>

                    <ol className="mt-8 grid gap-3 sm:grid-cols-4">
                        {STAGES.map((label, i) => {
                            const n = i + 1;
                            const done = current > n;
                            const now_ = current === n && !status?.terminal;
                            return (
                                <li
                                    key={label}
                                    className={`rounded-2xl border p-4 transition ${done ? 'border-sage bg-sage/60' : now_ ? 'border-gold bg-gold-soft/60' : 'border-line bg-ivory/40'}`}
                                    aria-current={now_ ? 'step' : undefined}
                                >
                                    <p className="flex items-center gap-2 text-xs text-muted">
                                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${done ? 'bg-sage-ink text-paper' : now_ ? 'bg-gold text-paper' : 'border border-line-strong'}`}>
                                            {done ? '✓' : n}
                                        </span>
                                        {done ? 'Done' : now_ ? 'Now' : 'Waiting'}
                                        {now_ && <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-gold" aria-hidden="true" />}
                                    </p>
                                    <p className="mt-2 text-sm font-medium text-ink">{label}</p>
                                    {now_ && <p className="mt-1 text-xs text-muted">{parsed?.detail ?? 'Starting the search engine…'}</p>}
                                </li>
                            );
                        })}
                    </ol>

                    {s && (
                        <div className="mt-8 space-y-3 border-t border-line pt-6 text-sm text-ink-soft">
                            <p>
                                <span className="font-display text-lg text-ink">{s.delivered}</span> opportunities from <span className="font-display text-lg text-ink">{s.listingsDiscovered}</span> listings read across {s.sources.length} boards.
                            </p>
                            <ul className="flex flex-wrap gap-2">
                                {s.sources.map((x) => (
                                    <li key={x.id} className={`rounded-full px-3 py-1 text-xs ${x.status === 'failed' ? 'bg-rose-wash text-rose-ink' : x.status === 'partial' ? 'bg-amber-wash text-amber-ink' : 'bg-sage text-sage-ink'}`}>
                                        {x.id.split(':')[1]} · {x.status === 'ok' ? `${x.listings} listings` : x.status}
                                    </li>
                                ))}
                            </ul>
                            {s.outcome === 'partial_source_failure' && <p className="text-amber-ink">Some sources failed; these results come from the others.</p>}
                            {s.outcome === 'total_source_failure' && <p className="text-rose-ink">All sources failed, so no results could be collected.</p>}
                            {s.outcome === 'no_matches' && <p>The search worked, but nothing matched these filters. Try more countries or fewer filters.</p>}
                            {s.warnings.map((w) => (
                                <p key={w} className="text-amber-ink">
                                    {w}
                                </p>
                            ))}
                        </div>
                    )}

                    {error && (
                        <p role="alert" className="mt-6 rounded-2xl bg-rose-wash px-5 py-4 text-sm text-rose-ink">
                            {error}
                        </p>
                    )}
                </section>
            )}

            {items.length > 0 && <OpportunityExplorer items={items} />}
            {more && (
                <div className="text-center">
                    <button onClick={() => loadItems(more.ref, more.offset)} className="rounded-full border border-line-strong px-6 py-3 text-sm font-medium text-ink transition hover:border-ink hover:bg-paper">
                        Load more results
                    </button>
                </div>
            )}
        </div>
    );
}
