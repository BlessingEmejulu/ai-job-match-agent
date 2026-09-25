'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { OpportunityView } from '@/lib/opportunity';
import type { SummaryView } from '@/lib/summary';

import { OpportunityExplorer } from './OpportunityExplorer';
import { type OverlayState, SearchOverlay } from './SearchOverlay';

type Phase = 'idle' | 'searching' | 'done' | 'error';
interface StatusResponse {
    status: string;
    statusMessage: string | null;
    terminal: boolean;
    summary: SummaryView | null;
}

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
    const [overlayOpen, setOverlayOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<SummaryView | null>(null);
    const [stage, setStage] = useState<{ stage: number; detail: string | null }>({ stage: 0, detail: null });
    const [items, setItems] = useState<OpportunityView[]>([]);
    const [more, setMore] = useState<{ ref: string; offset: number } | null>(null);
    const [startedAt, setStartedAt] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const alive = useRef(true);
    const resultsRef = useRef<HTMLElement>(null);
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            if (timer.current) clearTimeout(timer.current);
            if (closeTimer.current) clearTimeout(closeTimer.current);
        };
    }, []);

    useEffect(() => {
        if (phase !== 'searching') return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [phase]);

    // Until React hydrates, a click would fall back to a native GET that reloads the page and shows nothing.
    const [hydrated, setHydrated] = useState(false);
    useEffect(() => setHydrated(true), []);

    const [revealPending, setRevealPending] = useState(false);
    const revealResults = useCallback(() => {
        setOverlayOpen(false);
        setRevealPending(true);
    }, []);

    // Scroll only after the overlay has unmounted and restored page scrolling.
    useEffect(() => {
        if (!revealPending || overlayOpen) return;
        setRevealPending(false);
        const el = resultsRef.current;
        if (!el) return;
        const startY = window.scrollY;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Fallback when smooth scrolling doesn't run (e.g. a background tab): jump instead.
        setTimeout(() => {
            if (alive.current && window.scrollY === startY && el.getBoundingClientRect().top > 120) el.scrollIntoView({ block: 'start' });
        }, 900);
    }, [revealPending, overlayOpen]);

    const hideOverlay = useCallback(() => setOverlayOpen(false), []);

    async function loadItems(ref: string, offset: number) {
        const res = await fetch(`/api/runs/${encodeURIComponent(ref)}/items?offset=${offset}`);
        if (!res.ok) {
            setError('Could not load results.');
            return;
        }
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
            setOverlayOpen(true);
            return;
        }
        const body = (await res.json()) as StatusResponse;
        const parsed = parseStage(body.statusMessage);
        if (parsed) setStage((s) => (parsed.stage >= s.stage ? parsed : s));
        else if (body.status === 'RUNNING') setStage((s) => (s.stage === 0 ? { stage: 1, detail: null } : s));

        if (body.terminal) {
            setSummary(body.summary);
            if ((body.summary?.delivered ?? 0) > 0) await loadItems(ref, 0);
            if (body.status !== 'SUCCEEDED' && !(body.summary?.delivered ?? 0)) {
                setPhase('error');
                setError(body.summary?.outcome === 'total_source_failure' ? 'All job boards failed to respond. Please try again shortly.' : 'The search did not complete. Please try again.');
                return;
            }
            setPhase('done');
            // Let the "found" moment land, then reveal the results.
            closeTimer.current = setTimeout(revealResults, 1600);
            return; // stop polling at a terminal state
        }
        timer.current = setTimeout(() => poll(ref, attempt + 1), Math.min(3500, 1200 + attempt * 150));
    }

    async function start(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (timer.current) clearTimeout(timer.current);
        if (closeTimer.current) clearTimeout(closeTimer.current);
        setPhase('searching');
        setOverlayOpen(true);
        setError(null);
        setItems([]);
        setMore(null);
        setSummary(null);
        setStage({ stage: 0, detail: null });
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
        poll(body.ref, 0);
    }

    const elapsed = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
    const overlayState: OverlayState =
        phase === 'error'
            ? { kind: 'error', message: error ?? 'Something went wrong.' }
            : phase === 'done'
              ? { kind: 'done', found: summary?.delivered ?? items.length, listings: summary?.listingsDiscovered ?? 0 }
              : { kind: 'searching', stage: stage.stage, detail: stage.detail, elapsed };
    const busy = phase === 'searching';

    return (
        <div className="space-y-14">
            <form ref={formRef} onSubmit={start} aria-describedby="privacy-note" className="overflow-hidden rounded-3xl border border-line bg-paper shadow-soft">
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
                            <legend className={labelCls}>Only show work arrangement</legend>
                            <p className="text-xs text-muted">Optional — leave all unselected to include every arrangement.</p>
                            <div className="flex flex-wrap gap-2 pt-1">
                                {['remote', 'hybrid', 'onsite'].map((w) => (
                                    <Choice key={w} name="workArrangements" value={w} />
                                ))}
                            </div>
                        </fieldset>
                        <fieldset className="space-y-2">
                            <legend className={labelCls}>Only show seniority</legend>
                            <p className="text-xs text-muted">Optional — each extra filter narrows the results.</p>
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
                        Please don&apos;t enter your name, contact details or CV. Skills, experience and country are used for this search only. Matching needs skills, years and your country; otherwise the search discovers jobs only.
                    </p>
                    <button disabled={busy || !hydrated} className="group relative h-12 shrink-0 overflow-hidden rounded-full bg-forest px-8 text-sm font-medium text-paper shadow-soft transition hover:bg-forest-deep hover:shadow-lift disabled:opacity-70">
                        <span className="relative z-10">{busy ? 'Searching…' : hydrated ? 'Search live jobs' : 'Loading…'}</span>
                        {busy && <span className="animate-shimmer absolute inset-y-0 left-0 w-1/3 bg-paper/20" aria-hidden="true" />}
                    </button>
                </div>
            </form>

            {overlayOpen && phase !== 'idle' && <SearchOverlay state={overlayState} onHide={phase === 'done' ? revealResults : hideOverlay} />}

            {busy && !overlayOpen && (
                <button
                    type="button"
                    onClick={() => setOverlayOpen(true)}
                    className="animate-rise fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full bg-forest px-5 py-3 text-sm text-paper shadow-lift"
                >
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ring absolute inset-0 rounded-full bg-gold" />
                        <span className="relative h-2.5 w-2.5 rounded-full bg-gold" />
                    </span>
                    Searching… {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} · show progress
                </button>
            )}

            {phase === 'error' && !overlayOpen && error && (
                <p role="alert" className="animate-rise rounded-2xl bg-rose-wash px-5 py-4 text-sm text-rose-ink">
                    {error}
                </p>
            )}

            {phase === 'done' && summary && (
                <section ref={resultsRef} aria-labelledby="results-heading" className="scroll-mt-24 space-y-8">
                    <div className="animate-rise flex flex-col gap-6 rounded-3xl border border-line bg-paper p-6 shadow-soft sm:flex-row sm:items-end sm:justify-between sm:p-10">
                        <div className="space-y-3">
                            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-gold">Live results · just now</p>
                            <h2 id="results-heading" className="font-display text-3xl tracking-tight text-forest-deep sm:text-4xl">
                                {summary.delivered} {summary.delivered === 1 ? 'opportunity' : 'opportunities'} found
                            </h2>
                            <p className="text-sm text-muted">
                                Read {summary.listingsDiscovered.toLocaleString()} live listings across {summary.sources.length} verified boards in {elapsed}s.
                            </p>
                        </div>
                        <ul className="flex flex-wrap gap-2 sm:max-w-sm sm:justify-end">
                            {summary.sources.map((x, i) => (
                                <li
                                    key={x.id}
                                    style={{ animationDelay: `${150 + i * 80}ms` }}
                                    className={`animate-rise rounded-full px-3 py-1 text-xs ${x.status === 'failed' ? 'bg-rose-wash text-rose-ink' : x.status === 'partial' ? 'bg-amber-wash text-amber-ink' : 'bg-sage text-sage-ink'}`}
                                >
                                    {x.id.split(':')[1]} · {x.status === 'ok' ? `${x.listings} listings` : x.status}
                                </li>
                            ))}
                        </ul>
                    </div>
                    {summary.outcome === 'partial_source_failure' && <p className="text-sm text-amber-ink">Some boards didn&apos;t respond; these results come from the others.</p>}
                    {summary.delivered === 0 ? (
                        <NoResults summary={summary} formRef={formRef} busy={busy} />
                    ) : (
                        <OpportunityExplorer items={items} />
                    )}
                    {more && (
                        <div className="text-center">
                            <button onClick={() => loadItems(more.ref, more.offset)} className="rounded-full border border-line-strong px-6 py-3 text-sm font-medium text-ink transition hover:border-ink hover:bg-paper">
                                Load more results
                            </button>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}

const REASON_TEXT: Record<string, string> = {
    ROLE_KEYWORD_MISMATCH: "didn't match your role keywords",
    SENIORITY_MISMATCH: "weren't at the seniority you selected",
    WORK_ARRANGEMENT_MISMATCH: "weren't in the work arrangement you selected",
    EMPLOYMENT_TYPE_MISMATCH: "weren't the employment type you selected",
    LOCATION_OUTSIDE_SELECTED_COUNTRIES: 'are located outside your countries',
    DEADLINE_EXPIRED: 'had an expired deadline',
    ELIGIBILITY_UNKNOWN: "didn't state which countries can apply",
};

/**
 * Zero-result state: shows which filters removed how many roles (from the Actor's run summary) and
 * offers explicit one-click re-searches. Filters are never loosened without the user's click.
 */
function NoResults({ summary, formRef, busy }: { summary: SummaryView; formRef: React.RefObject<HTMLFormElement | null>; busy: boolean }) {
    const ex = summary.excluded;
    const keywordMatched = Math.max(0, summary.listingsDiscovered - (ex.ROLE_KEYWORD_MISMATCH ?? 0) - Object.entries(ex).filter(([k]) => k.startsWith('DUPLICATE')).reduce((a, [, v]) => a + v, 0));
    const reasons = Object.entries(ex)
        .filter(([k, v]) => v > 0 && REASON_TEXT[k] && k !== 'ROLE_KEYWORD_MISMATCH')
        .sort((a, b) => b[1] - a[1]);
    const bySeniority = (ex.SENIORITY_MISMATCH ?? 0) > 0;
    const byArrangement = (ex.WORK_ARRANGEMENT_MISMATCH ?? 0) > 0;
    const byEmployment = (ex.EMPLOYMENT_TYPE_MISMATCH ?? 0) > 0;

    // Clear the chosen filter groups in the visible form, then run the search again.
    const retryWithout = (names: string[]) => {
        const form = formRef.current;
        if (!form) return;
        for (const name of names) form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`).forEach((i) => (i.checked = false));
        form.requestSubmit();
    };

    const btn = 'rounded-full bg-forest px-5 py-2.5 text-sm font-medium text-paper shadow-soft transition hover:bg-forest-deep disabled:opacity-60';
    const btnGhost = 'rounded-full border border-line-strong px-5 py-2.5 text-sm font-medium text-ink transition hover:border-ink hover:bg-paper disabled:opacity-60';

    return (
        <div className="animate-rise space-y-6 rounded-3xl border border-line bg-paper p-6 shadow-soft sm:p-10">
            <div className="space-y-2">
                <p className="font-display text-2xl text-forest-deep">No jobs matched every filter this time</p>
                <p className="text-sm leading-relaxed text-muted">
                    We read {summary.listingsDiscovered.toLocaleString()} live listings.
                    {keywordMatched > 0 ? (
                        <>
                            {' '}
                            <strong className="font-medium text-ink">{keywordMatched}</strong> matched your role keywords, but your other filters removed them:
                        </>
                    ) : (
                        <> None matched your role keywords — try broader words like “engineer”, “analyst” or “developer”.</>
                    )}
                </p>
            </div>

            {keywordMatched > 0 && reasons.length > 0 && (
                <ul className="space-y-2">
                    {reasons.map(([k, v], i) => (
                        <li key={k} className="animate-rise flex items-baseline gap-3 text-sm text-ink-soft" style={{ animationDelay: `${120 + i * 80}ms` }}>
                            <span className="min-w-[3ch] text-right font-display text-lg text-gold">{v}</span>
                            {REASON_TEXT[k]}
                        </li>
                    ))}
                </ul>
            )}

            <div className="flex flex-wrap gap-3 border-t border-line pt-6">
                {byArrangement && (
                    <button type="button" disabled={busy} onClick={() => retryWithout(['workArrangements'])} className={bySeniority ? btnGhost : btn}>
                        Search again with all work arrangements
                    </button>
                )}
                {bySeniority && (
                    <button type="button" disabled={busy} onClick={() => retryWithout(['seniorityLevels'])} className={byArrangement ? btnGhost : btn}>
                        Search again with all seniority levels
                    </button>
                )}
                {(byArrangement || bySeniority || byEmployment) && (
                    <button type="button" disabled={busy} onClick={() => retryWithout(['workArrangements', 'seniorityLevels'])} className={byArrangement && bySeniority ? btn : btnGhost}>
                        Remove these filters and search again
                    </button>
                )}
                {!byArrangement && !bySeniority && (
                    <button type="button" onClick={() => document.getElementById('roleKeywords')?.focus()} className={btnGhost}>
                        Edit role keywords
                    </button>
                )}
            </div>
        </div>
    );
}
