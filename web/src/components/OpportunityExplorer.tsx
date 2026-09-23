'use client';

import { useId, useMemo, useState } from 'react';

import type { OpportunityView } from '@/lib/opportunity';

import { OpportunityCard } from './OpportunityCard';

type Filters = {
    q: string;
    country: string;
    arrangement: string;
    seniority: string;
    employment: string;
    eligibility: string;
    deadline: string;
    sort: 'rank' | 'match' | 'recent';
};

const ALL = '';

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
    const id = useId();
    return (
        <div className="flex flex-col">
            <label htmlFor={id} className="text-xs font-medium text-slate-700">
                {label}
            </label>
            <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
                <option value={ALL}>All</option>
                {options.map((o) => (
                    <option key={o} value={o}>
                        {o.replace(/_/g, ' ')}
                    </option>
                ))}
            </select>
        </div>
    );
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort();

export function OpportunityExplorer({ items }: { items: OpportunityView[] }) {
    const hasMatch = items.some((i) => i.match);
    const [f, setF] = useState<Filters>({ q: '', country: ALL, arrangement: ALL, seniority: ALL, employment: ALL, eligibility: ALL, deadline: ALL, sort: 'rank' });
    const set = (k: keyof Filters) => (v: string) => setF((p) => ({ ...p, [k]: v }));
    const searchId = useId();

    const options = useMemo(
        () => ({
            country: uniq(items.flatMap((i) => i.countries)),
            arrangement: uniq(items.map((i) => i.workArrangement)),
            seniority: uniq(items.map((i) => i.seniority)),
            employment: uniq(items.map((i) => i.employmentType)),
            eligibility: ['explicitly_supported', 'unknown', 'explicitly_restricted'],
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
        if (f.sort === 'rank') return out; // the Actor's own ranking (eligibility, score, early-career fit, freshness)
        if (f.sort === 'match') return [...out].sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1));
        return [...out].sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''));
    }, [items, f]);

    return (
        <section aria-label="Opportunities">
            <form role="search" onSubmit={(e) => e.preventDefault()} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-4 lg:grid-cols-8">
                <div className="col-span-2 flex flex-col">
                    <label htmlFor={searchId} className="text-xs font-medium text-slate-700">
                        Search
                    </label>
                    <input id={searchId} type="search" value={f.q} onChange={(e) => set('q')(e.target.value)} placeholder="Title, company, skill" className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                </div>
                <Select label="Country" value={f.country} onChange={set('country')} options={options.country} />
                <Select label="Arrangement" value={f.arrangement} onChange={set('arrangement')} options={options.arrangement} />
                <Select label="Seniority" value={f.seniority} onChange={set('seniority')} options={options.seniority} />
                <Select label="Employment" value={f.employment} onChange={set('employment')} options={options.employment} />
                <Select label="Eligibility" value={f.eligibility} onChange={set('eligibility')} options={options.eligibility} />
                <Select label="Deadline" value={f.deadline} onChange={set('deadline')} options={options.deadline} />
                <fieldset className="col-span-2 flex flex-wrap items-center gap-3 text-sm sm:col-span-4 lg:col-span-8">
                    <legend className="sr-only">Sort by</legend>
                    <span aria-hidden="true" className="text-xs font-medium text-slate-700">
                        Sort by
                    </span>
                    {(hasMatch ? (['rank', 'match', 'recent'] as const) : (['rank', 'recent'] as const)).map((s) => (
                        <label key={s} className="inline-flex items-center gap-1">
                            <input type="radio" name="sort" checked={f.sort === s} onChange={() => setF((p) => ({ ...p, sort: s }))} /> {s === 'rank' ? 'Recommended order' : s === 'match' ? 'Match score' : 'Most recent'}
                        </label>
                    ))}
                </fieldset>
            </form>

            <p aria-live="polite" className="mt-3 text-sm text-slate-700">
                Showing {shown.length} of {items.length} opportunities
            </p>

            {shown.length === 0 ? (
                <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">No opportunities match these filters.</p>
            ) : (
                <ul className="mt-3 grid gap-3 lg:grid-cols-2">
                    {shown.map((o) => (
                        <li key={o.jobId}>
                            <OpportunityCard o={o} />
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
