import type { OpportunityView } from '@/lib/opportunity';

const ELIG: Record<OpportunityView['eligibility'], { text: string; dot: string; cls: string }> = {
    explicitly_supported: { text: 'Location includes you', dot: 'bg-sage-ink', cls: 'bg-sage text-sage-ink' },
    unknown: { text: 'Eligibility unknown', dot: 'bg-amber-ink', cls: 'bg-amber-wash text-amber-ink' },
    explicitly_restricted: { text: 'Location restricted', dot: 'bg-rose-ink', cls: 'bg-rose-wash text-rose-ink' },
};

const pretty = (s: string) => s.replace(/_/g, ' ');

function fmtDate(iso: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function ScoreRing({ score, coverage }: { score: number | null; coverage: number }) {
    const r = 26;
    const c = 2 * Math.PI * r;
    const pct = score === null ? 0 : score / 100;
    return (
        <div className="flex shrink-0 flex-col items-center gap-1.5" role="img" aria-label={score === null ? 'Not scored: insufficient evidence' : `Relevance ${score} out of 100, based on ${Math.round(coverage * 100)} percent evidence`}>
            <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-line)" strokeWidth="4" />
                <circle
                    cx="32"
                    cy="32"
                    r={r}
                    fill="none"
                    stroke="var(--color-gold)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${c * pct} ${c}`}
                    transform="rotate(-90 32 32)"
                />
                <text x="32" y="37" textAnchor="middle" className="fill-forest-deep font-display" fontSize={score === null ? 11 : 18}>
                    {score === null ? 'n/a' : score}
                </text>
            </svg>
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted" aria-hidden="true">
                {Math.round(coverage * 100)}% evidence
            </span>
        </div>
    );
}

function Tag({ children }: { children: React.ReactNode }) {
    return <span className="rounded-full border border-line px-2.5 py-1 text-xs capitalize text-ink-soft">{children}</span>;
}

function SkillGroup({ label, items, tone }: { label: string; items: string[]; tone: 'plain' | 'good' | 'gap' }) {
    if (!items.length) return null;
    const cls = tone === 'good' ? 'bg-sage text-sage-ink' : tone === 'gap' ? 'bg-amber-wash text-amber-ink' : 'bg-ivory text-ink-soft';
    return (
        <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{label}</p>
            <ul className="flex flex-wrap gap-1.5">
                {items.map((s) => (
                    <li key={s} className={`rounded-md px-2 py-1 text-xs ${cls}`}>
                        {s}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function OpportunityCard({ o }: { o: OpportunityView }) {
    const base = ELIG[o.eligibility];
    // Without a profile, eligibility was assessed against the searched countries, not a person.
    const elig = !o.match && o.eligibility === 'explicitly_supported' ? { ...base, text: 'Fits selected countries' } : base;
    const host = o.applicationUrl ? new URL(o.applicationUrl).hostname.replace(/^www\./, '') : null;
    const posted = fmtDate(o.postedAt);
    const retrieved = fmtDate(o.retrievedAt);
    const titleId = `job-${o.jobId}`;

    return (
        <article aria-labelledby={titleId} className="group flex h-full flex-col rounded-3xl border border-line bg-paper p-6 shadow-soft transition duration-300 hover:-translate-y-0.5 hover:shadow-lift sm:p-8">
            <div className="flex items-start justify-between gap-5">
                <div className="min-w-0 space-y-2">
                    <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold">{o.company}</p>
                    <h3 id={titleId} className="font-display text-xl leading-snug text-ink sm:text-[1.35rem]">
                        {o.title}
                    </h3>
                    <p className="text-sm text-muted">{o.locationText || 'Location not stated'}</p>
                </div>
                {o.match && <ScoreRing score={o.match.score} coverage={o.match.evidenceCoverage} />}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${elig.cls}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${elig.dot}`} aria-hidden="true" />
                    {elig.text}
                </span>
                {o.workArrangement && o.workArrangement !== 'unspecified' && <Tag>{pretty(o.workArrangement)}</Tag>}
                {o.employmentType !== 'unknown' && <Tag>{pretty(o.employmentType)}</Tag>}
                {o.seniority !== 'unknown' && <Tag>{pretty(o.seniority)}</Tag>}
                {o.earlyCareerFit === 'suitable' && <Tag>early-career friendly</Tag>}
                {o.studentOnly && <Tag>students only</Tag>}
                {o.deadline && (
                    <Tag>
                        deadline {o.deadline}
                        {o.deadlineStatus === 'closing_soon' ? ' · soon' : ''}
                    </Tag>
                )}
            </div>

            {o.shortDescription && <p className="mt-5 line-clamp-3 text-sm leading-relaxed text-ink-soft">{o.shortDescription}</p>}

            <details className="mt-6 rounded-2xl border border-line bg-ivory/60 [&[open]>summary_span:last-child]:rotate-45">
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4 text-sm font-medium text-ink">
                    <span>{o.match ? 'Why this match, and what to confirm' : 'Requirements, evidence and unknowns'}</span>
                    <span aria-hidden="true" className="text-lg leading-none text-gold transition">
                        +
                    </span>
                </summary>
                <div className="space-y-6 border-t border-line px-5 py-5 text-sm leading-relaxed">
                    {o.match && <p className="text-ink-soft">{o.match.explanation}</p>}
                    {o.match && o.match.suggestedNextSteps.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Suggested next steps</p>
                            <ol className="space-y-1.5">
                                {o.match.suggestedNextSteps.map((s, i) => (
                                    <li key={s} className="flex gap-3 text-ink-soft">
                                        <span className="font-display text-gold">{i + 1}.</span>
                                        {s}
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}
                    {o.match ? (
                        <>
                            <SkillGroup label="Evidenced in your profile" items={o.match.matchedSkills} tone="good" />
                            <SkillGroup label="Required · not evidenced in your profile" items={o.match.requiredSkillsNotEvidenced} tone="gap" />
                            <SkillGroup label="Preferred · not evidenced in your profile" items={o.match.preferredSkillsNotEvidenced} tone="plain" />
                        </>
                    ) : (
                        <>
                            <SkillGroup label="Required skills" items={o.requiredSkills} tone="plain" />
                            {o.requiredSkillAlternatives.map((g, i) => (
                                <SkillGroup key={i} label="Required · any one of" items={g} tone="plain" />
                            ))}
                            <SkillGroup label="Preferred skills" items={o.preferredSkills} tone="plain" />
                        </>
                    )}
                    {o.experience && <p className="text-ink-soft">Experience asked for: {o.experience}</p>}
                    <div className="space-y-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Location evidence</p>
                        <ul className="space-y-3">
                            {o.eligibilityReasons.map((r, i) => (
                                <li key={i} className="text-ink-soft">
                                    {r.message}
                                    {r.evidence && <q className="mt-1.5 block border-l-2 border-gold/60 pl-3 text-xs italic text-muted">{r.evidence}</q>}
                                </li>
                            ))}
                        </ul>
                        <p className="text-xs text-muted">{o.eligibilitySummary}</p>
                    </div>
                    {o.unresolved.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Confirm before applying</p>
                            <ul className="list-disc space-y-1 pl-5 text-ink-soft marker:text-gold">
                                {o.unresolved.map((u) => (
                                    <li key={u}>{u}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </details>

            <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-6">
                <p className="text-xs leading-relaxed text-muted">
                    {o.sourceId}
                    {posted && <> · posted {posted}</>}
                    {retrieved && (
                        <>
                            <br />
                            retrieved {retrieved}
                        </>
                    )}
                    {o.analysisMode === 'ai_assisted' && <> · AI-assisted</>}
                </p>
                {o.applicationUrl ? (
                    <a
                        href={o.applicationUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="inline-flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-forest-deep"
                    >
                        Apply on {host}
                        <span aria-hidden="true">↗</span>
                        <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                ) : (
                    <span className="text-xs text-muted">Application link unavailable</span>
                )}
            </div>
        </article>
    );
}
