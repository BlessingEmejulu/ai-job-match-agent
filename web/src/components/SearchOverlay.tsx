'use client';

import { useEffect, useRef } from 'react';

export const STAGES = [
    { label: 'Reading verified employer boards', note: 'Fetching live postings from Greenhouse and Lever job boards' },
    { label: 'Filtering for your search', note: 'Keeping roles that fit your keywords, seniority and countries' },
    { label: 'Analysing each opportunity', note: 'Checking location eligibility and required versus preferred skills' },
    { label: 'Preparing your results', note: 'Ranking and delivering the best matches' },
];

/** The verified boards the search can read. Shown as sources, not as a claim that each is being read now. */
const BOARDS = ['Moniepoint', 'Jumia', 'ALX Africa', 'Zipline', 'Canonical', 'GitLab', 'dLocal', 'Binance'];

export type OverlayState = { kind: 'searching'; stage: number; detail: string | null; elapsed: number } | { kind: 'done'; found: number; listings: number } | { kind: 'error'; message: string };

function Radar({ done }: { done: boolean }) {
    return (
        <svg viewBox="0 0 200 200" className="h-32 w-32 sm:h-48 sm:w-48" aria-hidden="true">
            <defs>
                <radialGradient id="radar-bg" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="var(--color-gold-soft)" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="var(--color-paper)" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="radar-sweep" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--color-gold)" stopOpacity="0" />
                    <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0.55" />
                </linearGradient>
            </defs>
            <circle cx="100" cy="100" r="92" fill="url(#radar-bg)" />
            {[30, 55, 80].map((r) => (
                <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="var(--color-line-strong)" strokeWidth="1" />
            ))}
            <line x1="100" y1="12" x2="100" y2="188" stroke="var(--color-line)" strokeWidth="1" />
            <line x1="12" y1="100" x2="188" y2="100" stroke="var(--color-line)" strokeWidth="1" />
            {!done && (
                <>
                    <circle cx="100" cy="100" r="80" fill="none" stroke="var(--color-gold)" strokeWidth="1.5" className="animate-ring" />
                    <circle cx="100" cy="100" r="80" fill="none" stroke="var(--color-gold)" strokeWidth="1.5" className="animate-ring" style={{ animationDelay: '1.2s' }} />
                    <g className="animate-sweep">
                        <path d="M100 100 L100 20 A80 80 0 0 1 169 60 Z" fill="url(#radar-sweep)" />
                    </g>
                    {[
                        [140, 70, 0],
                        [62, 128, 0.5],
                        [128, 142, 0.9],
                        [70, 64, 1.3],
                        [158, 118, 0.3],
                    ].map(([x, y, d], i) => (
                        <circle key={i} cx={x} cy={y} r="3.5" fill="var(--color-forest)" className="animate-blip" style={{ animationDelay: `${d}s` }} />
                    ))}
                </>
            )}
            <circle cx="100" cy="100" r={done ? 26 : 7} fill={done ? 'var(--color-forest)' : 'var(--color-gold)'} style={{ transition: 'r 0.4s ease' }} />
            {done && <path d="M88 100 l8 9 l17 -19" fill="none" stroke="var(--color-paper)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="animate-fade-in" />}
        </svg>
    );
}

export function SearchOverlay({ state, onHide }: { state: OverlayState; onHide: () => void }) {
    const hideRef = useRef<HTMLButtonElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // preventScroll: on short screens focusing the footer button would scroll the card's top out of view.
        hideRef.current?.focus({ preventScroll: true });
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onHide();
        window.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [onHide]);

    // Content height changes between states; always show each new state from the top.
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: 0 });
    }, [state.kind]);

    const searching = state.kind === 'searching';
    const stage = searching ? Math.max(1, state.stage) : 4;
    const current = STAGES[stage - 1]!;

    return (
        <div ref={scrollRef} role="dialog" aria-modal="true" aria-labelledby="search-overlay-title" className="animate-fade-in fixed inset-0 z-50 overflow-y-auto bg-ink/40 backdrop-blur-sm">
            <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
            <div className="animate-rise w-full max-w-lg overflow-hidden rounded-[2rem] border border-line bg-paper shadow-lift">
                <div className="flex flex-col items-center gap-5 px-6 pb-7 pt-8 text-center sm:gap-6 sm:px-10 sm:pb-8 sm:pt-10">
                    <Radar done={state.kind === 'done'} />

                    <div className="space-y-2" aria-live="polite">
                        {state.kind === 'searching' && (
                            <>
                                <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-gold">
                                    Step {stage} of 4 · {Math.floor(state.elapsed / 60)}:{String(state.elapsed % 60).padStart(2, '0')}
                                </p>
                                <h2 id="search-overlay-title" className="font-display text-2xl text-forest-deep sm:text-[1.7rem]">
                                    {current.label}
                                </h2>
                                <p key={state.detail ?? current.note} className="animate-float-text min-h-[2.5rem] text-sm leading-relaxed text-muted">
                                    {state.detail ?? (state.stage === 0 ? 'Starting the search engine…' : current.note)}
                                </p>
                            </>
                        )}
                        {state.kind === 'done' && (
                            <>
                                <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-gold">Search complete</p>
                                <h2 id="search-overlay-title" className="font-display text-3xl text-forest-deep">
                                    {state.found === 0 ? 'No exact matches' : `${state.found} ${state.found === 1 ? 'opportunity' : 'opportunities'} found`}
                                </h2>
                                <p className="text-sm text-muted">
                                    {state.found === 0
                                        ? `Read ${state.listings.toLocaleString()} live listings — see which filters removed them below`
                                        : `from ${state.listings.toLocaleString()} live listings`}
                                </p>
                            </>
                        )}
                        {state.kind === 'error' && (
                            <>
                                <h2 id="search-overlay-title" className="font-display text-2xl text-rose-ink">
                                    The search could not finish
                                </h2>
                                <p role="alert" className="text-sm text-muted">
                                    {state.message}
                                </p>
                            </>
                        )}
                    </div>

                    {searching && (
                        <div className="w-full space-y-3">
                            <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
                                {STAGES.map((s, i) => (
                                    <div key={s.label} className="relative h-1.5 overflow-hidden rounded-full bg-line">
                                        {i + 1 < stage && <div className="absolute inset-0 bg-forest" />}
                                        {i + 1 === stage && <div className="animate-shimmer absolute inset-y-0 w-1/2 rounded-full bg-gold" />}
                                    </div>
                                ))}
                            </div>
                            <ul className="flex flex-wrap justify-center gap-1.5 pt-2" aria-label="Verified boards this search can read">
                                {BOARDS.map((b, i) => (
                                    <li key={b} className="animate-fade-in rounded-full border border-line bg-ivory/70 px-2.5 py-1 text-[11px] text-ink-soft" style={{ animationDelay: `${i * 90}ms` }}>
                                        {b}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-line bg-ivory/60 px-6 py-4 sm:px-10">
                    <p className="text-xs text-muted">{searching ? 'Live results come straight from employers’ boards.' : ' '}</p>
                    <button ref={hideRef} type="button" onClick={onHide} className="rounded-full border border-line-strong px-4 py-1.5 text-sm text-ink transition hover:border-ink hover:bg-paper">
                        {searching ? 'Hide' : state.kind === 'done' ? 'View results' : 'Close'}
                    </button>
                </div>
            </div>
            </div>
        </div>
    );
}
