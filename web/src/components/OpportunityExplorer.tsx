'use client';

import { useId, useMemo, useState } from 'react';

import type { OpportunityView } from '@/lib/opportunity';

import { OpportunityCard } from './OpportunityCard';

type Sort = 'rank' | 'match' | 'recent';
type Filters = { q: string; country: string; arrangement: string; seniority: string; employment: string; eligibility: string; deadline: string; sort: Sort };

const ALL = '';
const EMPTY: Omit<Filters, 'sort'> = { q: '', country: ALL, arrangement: ALL, seniority: ALL, employment: ALL, eligibility: ALL, deadline: ALL };
const ELIG_LABEL: Record<string, string> = { explicitly_supported: 'Fits / includes you', unknown: 'Unknown', explicitly_restricted: 'Restricted' };

function Select({ label, value, onChange, options, labels }: { label: string; value: string; onChange: (v: string) => void; options: string[]; labels?: Record<string, string> }) {
    const id = useId();
    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                {label}
            </label>
            <select
                id={id}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-11 rounded-xl border border-line bg-paper px-3 text-sm capitalize text-ink transition hover:border-line-strong focus:border-gold"
            >
                <option value={ALL}>All</option>
                {options.map((o) => (
                    <option key={o} value={o}>
                        {labels?.[o] ?? o.replace(/_/g, ' ')}
                    </option>
                ))}
            </select>
        </div>
    );
}

const uniq = (xs: string[]) => [...new Set(xs.filter((x) => x && x !== 'unknown' && x !== 'unspecified'))].sort();

export function OpportunityExplorer({ items }: { items: OpportunityView[] }) {
    const hasMatch = items.some((i) => i.match);
    const [f, setF] = useState<Filters>({ ...EMPTY, sort: 'rank' });
    const set = (k: keyof Filters) => (v: string) => setF((p) => ({ ...p, [k]: v }));
    const searchId = useId();
    const active = Object.entries(EMPTY).some(([k, v]) => f[k as keyof Filters] !== v);

    const options = useMemo(
        () => ({
            country: uniq(items.flatMap((i) => i.countries)),
            arrangement: uniq(items.map((i) => i.workArrangement)),
            seniority: uniq(items.map((i) => i.seniority)),
            employment: uniq(items.map((i) => i.employmentType)),
            deadline: uniq(items.map((i) => i.deadlineStatus)),
        }),
        [items],
    );

    const shown = useMemo(() => {
        const q = f.q.trim().toLowerCase();
        const out = items.filter(
            (i) =>
                (!q || `${i.title} ${i.company} ${i.locationText} ${i.requiredSkills.join(' ')}`.toLowerCase().includes(q)) &&
                (!f.country || i.countries.includes(f.country)) &&
                (!f.arrangement || i.workArrangement === f.arrangement) &&
                (!f.seniority || i.seniority === f.seniority) &&
                (!f.employment || i.employmentType === f.employment) &&
                (!f.eligibility || i.eligibility === f.eligibility) &&
                (!f.deadline || i.deadlineStatus === f.deadline),
        );
        if (f.sort === 'rank') return out; // the Actor's own ranking: eligibility, score, early-career fit, freshness
        if (f.sort === 'match') return [...out].sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1));
        return [...out].sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''));
    }, [items, f]);

    const sorts: Sort[] = hasMatch ? ['rank', 'match', 'recent'] : ['rank', 'recent'];

    return (
        <section aria-label="Opportunities" className="space-y-8">
            <form role="search" onSubmit={(e) => e.preventDefault()} className="space-y-6 rounded-3xl border border-line bg-paper/80 p-5 shadow-soft sm:p-7">
                <div className="flex flex-col gap-1.5">
                    <label htmlFor={searchId} className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                        Search
                    </label>
                    <input
                        id={searchId}
                        type="search"
                        value={f.q}
                        onChange={(e) => set('q')(e.target.value)}
                        placeholder="Title, company or skill"
                        className="h-12 rounded-xl border border-line bg-paper px-4 text-base text-ink placeholder:text-muted/70 transition hover:border-line-strong focus:border-gold"
                    />
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                    <Select label="Country" value={f.country} onChange={set('country')} options={options.country} />
                    <Select label="Arrangement" value={f.arrangement} onChange={set('arrangement')} options={options.arrangement} />
                    <Select label="Seniority" value={f.seniority} onChange={set('seniority')} options={options.seniority} />
                    <Select label="Employment" value={f.employment} onChange={set('employment')} options={options.employment} />
                    <Select label="Eligibility" value={f.eligibility} onChange={set('eligibility')} options={['explicitly_supported', 'unknown', 'explicitly_restricted']} labels={ELIG_LABEL} />
                    <Select label="Deadline" value={f.deadline} onChange={set('deadline')} options={options.deadline} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
                    <fieldset className="flex flex-wrap items-center gap-2">
                        <legend className="sr-only">Sort by</legend>
                        {sorts.map((s) => (
                            <label
                                key={s}
                                className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold ${f.sort === s ? 'border-forest bg-forest text-paper' : 'border-line text-ink-soft hover:border-line-strong'}`}
                            >
                                <input type="radio" name="sort" className="sr-only" checked={f.sort === s} onChange={() => setF((p) => ({ ...p, sort: s }))} />
                                {s === 'rank' ? 'Recommended' : s === 'match' ? 'Match score' : 'Most recent'}
                            </label>
                        ))}
                    </fieldset>
                    <div className="flex items-center gap-4">
                        <p aria-live="polite" className="text-sm text-muted">
                            <span className="font-display text-lg text-ink">{shown.length}</span> of {items.length} shown
                        </p>
                        {active && (
                            <button type="button" onClick={() => setF((p) => ({ ...EMPTY, sort: p.sort }))} className="text-sm text-gold underline-offset-4 hover:underline">
                                Clear filters
                            </button>
                        )}
                    </div>
                </div>
            </form>

            {shown.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-line-strong bg-paper/60 px-6 py-16 text-center">
                    <p className="font-display text-xl text-ink">Nothing matches these filters</p>
                    <p className="mt-2 text-sm text-muted">Try widening the country or seniority filters.</p>
                </div>
            ) : (
                <ul className="grid gap-6 lg:grid-cols-2">
                    {shown.map((o, i) => (
                        <li key={o.jobId} className="animate-rise" style={{ animationDelay: `${Math.min(i, 12) * 70}ms` }}>
                            <OpportunityCard o={o} />
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
