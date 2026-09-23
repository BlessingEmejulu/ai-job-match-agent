import type { OpportunityView } from '@/lib/opportunity';

const ELIG_LABEL: Record<OpportunityView['eligibility'], { text: string; icon: string; cls: string }> = {
    explicitly_supported: { text: 'Location includes you', icon: '✓', cls: 'bg-emerald-50 text-emerald-900 ring-emerald-200' },
    unknown: { text: 'Location eligibility unknown', icon: '?', cls: 'bg-amber-50 text-amber-900 ring-amber-200' },
    explicitly_restricted: { text: 'Location restricted', icon: '✕', cls: 'bg-rose-50 text-rose-900 ring-rose-200' },
};

const pretty = (s: string) => s.replace(/_/g, ' ');

function fmtDate(iso: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function Chip({ children }: { children: React.ReactNode }) {
    return <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{children}</span>;
}

function SkillList({ label, items, tone }: { label: string; items: string[]; tone: 'plain' | 'good' | 'gap' }) {
    if (!items.length) return null;
    const cls = tone === 'good' ? 'bg-emerald-50 text-emerald-900' : tone === 'gap' ? 'bg-amber-50 text-amber-900' : 'bg-slate-100 text-slate-800';
    return (
        <div>
            <p className="text-xs font-medium text-slate-600">{label}</p>
            <ul className="mt-1 flex flex-wrap gap-1">
                {items.map((s) => (
                    <li key={s} className={`rounded px-1.5 py-0.5 text-xs ${cls}`}>
                        {s}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function OpportunityCard({ o }: { o: OpportunityView }) {
    const base = ELIG_LABEL[o.eligibility];
    // Without a profile, eligibility was assessed against the searched countries, not a person.
    const elig = !o.match && o.eligibility === 'explicitly_supported' ? { ...base, text: 'Location fits selected countries' } : base;
    const host = o.applicationUrl ? new URL(o.applicationUrl).hostname : null;
    const posted = fmtDate(o.postedAt);
    const retrieved = fmtDate(o.retrievedAt);
    const titleId = `job-${o.jobId}`;

    return (
        <article aria-labelledby={titleId} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 id={titleId} className="text-base font-semibold text-slate-900">
                        {o.title}
                    </h3>
                    <p className="text-sm text-slate-700">
                        {o.company} · {o.locationText || 'Location not stated'}
                    </p>
                </div>
                {o.match && (
                    <p className="shrink-0 rounded-md bg-slate-900 px-2 py-1 text-center text-white" aria-label={o.match.score === null ? 'Not scored: insufficient evidence' : `Relevance ${o.match.score} out of 100`}>
                        {o.match.score === null ? <span className="text-xs">Not scored</span> : <span className="text-lg font-semibold">{o.match.score}</span>}
                        <span className="block text-[10px] uppercase tracking-wide text-slate-300">{Math.round(o.match.evidenceCoverage * 100)}% evidence</span>
                    </p>
                )}
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ${elig.cls}`}>
                    <span aria-hidden="true">{elig.icon}</span> {elig.text}
                </span>
                {o.workArrangement && <Chip>{pretty(o.workArrangement)}</Chip>}
                {o.employmentType !== 'unknown' && <Chip>{pretty(o.employmentType)}</Chip>}
                {o.seniority !== 'unknown' && <Chip>{pretty(o.seniority)}</Chip>}
                {o.earlyCareerFit === 'suitable' && <Chip>early-career friendly</Chip>}
                {o.studentOnly && <Chip>students only</Chip>}
                {o.deadline && <Chip>deadline {o.deadline}{o.deadlineStatus === 'closing_soon' ? ' (soon)' : ''}</Chip>}
            </div>

            {o.shortDescription && <p className="mt-2 line-clamp-3 text-sm text-slate-700">{o.shortDescription}</p>}

            <details className="group mt-3 rounded-md bg-slate-50 p-3 text-sm">
                <summary className="cursor-pointer font-medium text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
                    {o.match ? 'Why this match, and what to confirm' : 'Requirements, eligibility evidence and unknowns'}
                </summary>
                <div className="mt-3 space-y-3">
                    {o.match && <p className="text-slate-800">{o.match.explanation}</p>}
                    {o.match && o.match.suggestedNextSteps.length > 0 && (
                        <div>
                            <p className="text-xs font-medium text-slate-600">Suggested next steps</p>
                            <ul className="mt-1 list-disc pl-5 text-slate-800">
                                {o.match.suggestedNextSteps.map((s) => (
                                    <li key={s}>{s}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {o.match ? (
                        <>
                            <SkillList label="Evidenced in your profile" items={o.match.matchedSkills} tone="good" />
                            <SkillList label="Required, not evidenced in your profile" items={o.match.requiredSkillsNotEvidenced} tone="gap" />
                            <SkillList label="Preferred, not evidenced in your profile" items={o.match.preferredSkillsNotEvidenced} tone="plain" />
                        </>
                    ) : (
                        <>
                            <SkillList label="Required skills" items={o.requiredSkills} tone="plain" />
                            {o.requiredSkillAlternatives.map((g, i) => (
                                <SkillList key={i} label="Required: any one of" items={g} tone="plain" />
                            ))}
                            <SkillList label="Preferred skills" items={o.preferredSkills} tone="plain" />
                        </>
                    )}
                    {o.experience && <p className="text-slate-800">Experience asked for: {o.experience}</p>}
                    <div>
                        <p className="text-xs font-medium text-slate-600">Location evidence</p>
                        <ul className="mt-1 space-y-1">
                            {o.eligibilityReasons.map((r, i) => (
                                <li key={i} className="text-slate-800">
                                    {r.message}
                                    {r.evidence && <q className="mt-0.5 block text-xs text-slate-600">{r.evidence}</q>}
                                </li>
                            ))}
                        </ul>
                        <p className="mt-1 text-xs text-slate-600">{o.eligibilitySummary}</p>
                    </div>
                    {o.unresolved.length > 0 && (
                        <div>
                            <p className="text-xs font-medium text-slate-600">Confirm before applying</p>
                            <ul className="mt-1 list-disc pl-5 text-slate-800">
                                {o.unresolved.map((u) => (
                                    <li key={u}>{u}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </details>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <p>
                    Source: {o.sourceId}
                    {posted && <> · posted {posted}</>}
                    {retrieved && <> · retrieved {retrieved}</>}
                    {o.analysisMode === 'ai_assisted' && <> · AI-assisted extraction</>}
                </p>
                {o.applicationUrl ? (
                    <a
                        href={o.applicationUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="rounded-md bg-teal-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                    >
                        Apply on {host}
                        <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                ) : (
                    <span>Application link unavailable</span>
                )}
            </div>
        </article>
    );
}
