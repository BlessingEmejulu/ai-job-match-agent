import { BoundedAiAnalyzer, type AiUsage } from '../ai/analyzer.js';
import type { AiProvider } from '../ai/provider.js';
import type { DeliveryQueue, DeliveryReport } from '../billing/delivery.js';
import { DELIVERY_EVENT } from '../billing/delivery.js';
import { Deduplicator } from '../dedup/index.js';
import type { EligibilityContext, EligibilityResult } from '../eligibility/assess.js';
import { explainMatch } from '../matching/explain.js';
import { keywordMatches, roleAlignment } from '../matching/roles.js';
import { scoreMatch } from '../matching/score.js';
import type { ActorInput } from '../schemas/input.js';
import { type Opportunity, opportunitySchema } from '../schemas/opportunity.js';
import { BudgetedHttpClient, type FetchLike } from '../sources/http.js';
import type { RegistryEntry } from '../sources/registry.js';
import type { SourceFetchResult } from '../sources/types.js';
import { type AnalyzedListing, analyzeListing, applyAiResult, assessJob, toOpportunity, uncertaintyScore } from './analyze.js';
import { fetchSources, planSources, type SourcePlan } from './sources.js';

export interface Logger {
    info(msg: string, data?: Record<string, unknown>): void;
    warning(msg: string, data?: Record<string, unknown>): void;
}

export interface PipelineDeps {
    now: () => Date;
    fetchImpl?: FetchLike;
    aiProvider: AiProvider | null;
    aiDisabledReason: string | null;
    delivery: DeliveryQueue;
    log: Logger;
    /** Time reserved at the end of the run for delivery and summary writes. */
    reserveMs?: number;
    /** Live progress for the run status message. Format: "Stage n/4 · text". Must not throw. */
    progress?: (message: string) => void;
}

export type Outcome = 'results_delivered' | 'no_matches' | 'partial_source_failure' | 'total_source_failure' | 'budget_limited';
export type StopReason =
    | 'completed'
    | 'max_results_reached'
    | 'charge_limit_reached'
    | 'request_budget_exhausted'
    | 'runtime_budget_exhausted'
    | 'all_sources_failed';

export interface SourceReport {
    id: string;
    family: string;
    employer: string;
    status: 'ok' | 'partial' | 'failed';
    listings: number;
    requests: number;
    error: string | null;
    phase: 'initial' | 'expansion';
}

export interface RunSummary {
    summaryVersion: '1.0';
    runStartedAt: string;
    runFinishedAt: string;
    durationSeconds: number;
    mode: ActorInput['mode'];
    input: Record<string, unknown>;
    outcome: Outcome;
    resultStatus: 'results_delivered' | 'no_matches';
    stopReason: StopReason;
    sources: {
        ranking: SourcePlan['ranking'];
        attempted: number;
        succeeded: number;
        failed: number;
        reports: SourceReport[];
        expansion: { triggered: boolean; reason: string; sourceIds: string[] };
    };
    requests: { used: number; limit: number };
    counts: {
        listingsDiscovered: number;
        duplicatesRemoved: number;
        invalidListings: number;
        expiredExcluded: number;
        excludedByReason: Record<string, number>;
        candidates: number;
        shortlisted: number;
        invalidRecords: number;
        opportunitiesDelivered: number;
    };
    eligibilityCounts: Record<'explicitly_supported' | 'explicitly_restricted' | 'unknown', number>;
    ai: AiUsage & { rulesOnlyFallbacks: number };
    billing: DeliveryReport & { eventName: string; note: string };
    decisions: string[];
    warnings: string[];
}

interface Candidate {
    job: AnalyzedListing;
    filterElig: EligibilityResult;
    outElig: EligibilityResult;
}

const ELIG_RANK = { explicitly_supported: 0, unknown: 1, explicitly_restricted: 2 } as const;
const EARLY_RANK = { suitable: 0, possible: 1, unknown: 2, unlikely: 3 } as const;

export async function runPipeline(input: ActorInput, deps: PipelineDeps): Promise<RunSummary> {
    const startedAt = deps.now();
    const startMs = startedAt.getTime();
    const reserve = deps.reserveMs ?? 15_000;
    const deadline = startMs + Math.max(10_000, input.maxRuntimeSeconds * 1000 - reserve);
    const http = new BudgetedHttpClient({ maxRequests: input.maxRequests, deadline, fetchImpl: deps.fetchImpl, now: () => deps.now().getTime() });
    const profile = input.mode === 'match' ? input.candidateProfile! : null;
    const decisions: string[] = [];
    const warnings: string[] = [];
    const progress = (stage: number, text: string) => {
        try {
            deps.progress?.(`Stage ${stage}/4 · ${text}`);
        } catch {
            // progress is best-effort
        }
    };
    const decide = (msg: string) => {
        decisions.push(msg);
        deps.log.info(msg);
    };

    // ---------------- DISCOVER ----------------
    const plan = planSources(input.countries, input.sourceIds);
    decide(`DISCOVER: reading ${plan.initial.map((e) => e.id).join(', ')} (ranked by relevance to ${input.countries.join(', ')}).`);

    const discoverCtx: EligibilityContext = { baseCountries: input.countries, authorizationCountries: undefined, mode: 'discover' };
    const outputCtx: EligibilityContext = profile
        ? { baseCountries: [profile.country], authorizationCountries: profile.workAuthorizationCountries, mode: 'match' }
        : discoverCtx;
    const keywords = input.roleKeywords.length ? input.roleKeywords : (profile?.desiredRoles ?? []);
    if (!input.roleKeywords.length && keywords.length) decide(`DECIDE: no roleKeywords given; filtering titles by the candidate's desired roles.`);

    const dedup = new Deduplicator();
    const byPrimary = new Map<string, AnalyzedListing>();
    const candidates: Candidate[] = [];
    const excluded: Record<string, number> = {};
    const exclude = (code: string) => (excluded[code] = (excluded[code] ?? 0) + 1);
    const reports: SourceReport[] = [];
    let listingsDiscovered = 0;
    let duplicatesRemoved = 0;
    let invalidListings = 0;
    let expiredExcluded = 0;
    const discoveredAt = startedAt.toISOString();

    const processResults = (results: SourceFetchResult[], phase: SourceReport['phase']) => {
        for (const r of results) {
            const status: SourceReport['status'] = r.error && !r.listings.length ? 'failed' : r.error || r.truncated ? 'partial' : 'ok';
            reports.push({ id: r.entry.id, family: r.entry.family, employer: r.entry.employer, status, listings: r.listings.length, requests: r.requestsUsed, error: r.error, phase });
            if (status === 'failed') deps.log.warning(`SOURCE ${r.entry.id} failed: ${r.error}`);
            else deps.log.info(`SOURCE ${r.entry.id}: ${r.listings.length} listings (${r.requestsUsed} request(s))${r.error ? `; ${r.error}` : ''}`);

            for (const raw of r.listings) {
                listingsDiscovered++;
                const d = dedup.checkAndAdd({
                    sourceId: raw.sourceId,
                    sourceJobId: raw.sourceJobId,
                    applyUrl: raw.applyUrl,
                    company: raw.company,
                    title: raw.title,
                    locationText: raw.locationTexts.join('; '),
                });
                if (d.duplicate) {
                    duplicatesRemoved++;
                    exclude(`DUPLICATE_${d.matchedOn!.toUpperCase()}`);
                    const primary = d.duplicateOf ? byPrimary.get(d.duplicateOf) : undefined;
                    if (primary && !(primary.raw.sourceId === raw.sourceId && primary.raw.sourceJobId === raw.sourceJobId)) {
                        primary.duplicateRefs.push({ sourceId: raw.sourceId, sourceJobId: raw.sourceJobId, url: raw.jobUrl });
                    }
                    continue;
                }
                const reasons: string[] = [];
                if (keywords.length) {
                    const hit = keywords.find((k) => keywordMatches(k, raw.title, raw.department));
                    if (!hit) {
                        exclude('ROLE_KEYWORD_MISMATCH');
                        continue;
                    }
                    reasons.push(`ROLE_KEYWORD_MATCH:${hit}`);
                }
                const analyzed = analyzeListing(raw, deps.now());
                if (!analyzed.ok) {
                    invalidListings++;
                    exclude(analyzed.reason);
                    continue;
                }
                const job = analyzed.job;
                byPrimary.set(dedup.primaryKey({ sourceId: raw.sourceId, sourceJobId: raw.sourceJobId, applyUrl: '', company: '', title: '', locationText: '' }), job);

                if (input.employmentTypes.length) {
                    if (job.employment.value === 'unknown') reasons.push('EMPLOYMENT_TYPE_UNKNOWN_KEPT');
                    else if (!input.employmentTypes.includes(job.employment.value)) {
                        exclude('EMPLOYMENT_TYPE_MISMATCH');
                        continue;
                    } else reasons.push(`EMPLOYMENT_TYPE_MATCH:${job.employment.value}`);
                }
                if (input.seniorityLevels.length) {
                    if (job.seniority.value === 'unknown') reasons.push('SENIORITY_UNKNOWN_KEPT');
                    else if (!input.seniorityLevels.includes(job.seniority.value)) {
                        exclude('SENIORITY_MISMATCH');
                        continue;
                    } else reasons.push(`SENIORITY_MATCH:${job.seniority.value}`);
                }
                if (input.workArrangements.length) {
                    if (job.arrangement.value === 'unspecified') reasons.push('WORK_ARRANGEMENT_UNSPECIFIED_KEPT');
                    else if (!input.workArrangements.includes(job.arrangement.value)) {
                        exclude('WORK_ARRANGEMENT_MISMATCH');
                        continue;
                    } else reasons.push(`WORK_ARRANGEMENT_MATCH:${job.arrangement.value}`);
                }
                if (job.deadlineStatus === 'expired') {
                    expiredExcluded++;
                    exclude('DEADLINE_EXPIRED');
                    continue;
                }
                if (job.deadlineStatus === 'unknown') {
                    if (!input.includeUnknownDeadline) {
                        exclude('DEADLINE_UNKNOWN');
                        continue;
                    }
                    reasons.push('DEADLINE_UNKNOWN_KEPT');
                } else reasons.push(`DEADLINE_${job.deadlineStatus.toUpperCase()}`);

                const filterElig = assessJob(job, discoverCtx);
                if (filterElig.status === 'explicitly_restricted') {
                    exclude('LOCATION_OUTSIDE_SELECTED_COUNTRIES');
                    continue;
                }
                const outElig = profile ? assessJob(job, outputCtx) : filterElig;
                if (outElig.status === 'unknown' && !input.includeUnknownEligibility) {
                    exclude('ELIGIBILITY_UNKNOWN');
                    continue;
                }
                reasons.push(`LOCATION_${filterElig.status.toUpperCase()}`);
                job.decisionReasons = reasons;
                candidates.push({ job, filterElig, outElig });
            }
        }
    };

    progress(1, `Reading ${plan.initial.length} verified employer boards`);
    const initialResults = await fetchSources(plan.initial, http, deps.now);
    processResults(initialResults, 'initial');

    // ---------------- DECIDE: one bounded expansion ----------------
    let expansion = { triggered: false, reason: '', sourceIds: [] as string[] };
    if (candidates.length >= input.maxResults) {
        expansion.reason = `Not needed: ${candidates.length} candidates for ${input.maxResults} requested results.`;
    } else if (!plan.expansion.length) {
        expansion.reason = 'No further verified sources match the selection.';
    } else if (http.requestsRemaining < 2) {
        expansion.reason = 'Request budget too low to expand.';
    } else if (http.timeRemainingMs < 30_000) {
        expansion.reason = 'Runtime budget too low to expand.';
    } else {
        const next: RegistryEntry[] = plan.expansion.slice(0, 2);
        expansion = {
            triggered: true,
            reason: `Only ${candidates.length} candidate(s) for ${input.maxResults} requested; adding the next most relevant verified sources.`,
            sourceIds: next.map((e) => e.id),
        };
        decide(`DECIDE: expand once → ${expansion.sourceIds.join(', ')}. ${expansion.reason}`);
        progress(1, `Too few matches so far — also reading ${next.map((e) => e.employer).join(" and ")}`);
        processResults(await fetchSources(next, http, deps.now), 'expansion');
    }
    if (!expansion.triggered) decide(`DECIDE: no source expansion. ${expansion.reason}`);

    const topExcluded = Object.entries(excluded)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ');
    decide(`DECIDE: ${listingsDiscovered} listings → ${candidates.length} candidates (${duplicatesRemoved} duplicates removed${topExcluded ? `; excluded: ${topExcluded}` : ''}).`);

    progress(2, `Filtered ${listingsDiscovered} listings to ${candidates.length} candidates`);

    // ---------------- ANALYZE (bounded AI on the most uncertain shortlisted records) ----------------
    const prelim = (c: Candidate) => [
        ELIG_RANK[c.outElig.status],
        profile ? -Math.max(0, ...profile.desiredRoles.map((r) => roleAlignment(r, `${c.job.raw.title} ${c.job.raw.department ?? ''}`))) : 0,
        EARLY_RANK[earlyFit(c.job)],
        -(Date.parse(c.job.raw.updatedAt ?? c.job.raw.postedAt ?? '') || 0),
    ];
    candidates.sort((a, b) => cmp(prelim(a), prelim(b)) || a.job.jobId.localeCompare(b.job.jobId));
    const shortlist = candidates.slice(0, Math.max(input.maxResults * 2, input.maxResults + 5));

    const analyzer = new BoundedAiAnalyzer(
        input.ai.enabled ? deps.aiProvider : null,
        input.ai.maxAnalyses,
        input.ai.enabled ? deps.aiDisabledReason : 'ai.enabled is false',
        45_000,
        () => deps.now().getTime(),
    );
    let rulesOnlyFallbacks = 0;
    if (analyzer.usage.enabled) {
        const queue = shortlist
            .map((c) => ({ c, u: uncertaintyScore(c.job, c.outElig) }))
            .filter((x) => x.u > 0)
            .sort((a, b) => b.u - a.u || a.c.job.jobId.localeCompare(b.c.job.jobId))
            .slice(0, analyzer.remaining);
        decide(`ANALYZE: AI requested for ${queue.length} most-uncertain shortlisted record(s) (limit ${input.ai.maxAnalyses}).`);
        for (const { c } of queue) {
            const res = await analyzer.analyze(c.job.raw.title, c.job.plainText, deadline);
            if (!res) {
                rulesOnlyFallbacks++;
                continue;
            }
            analyzer.usage.groundedItemsAdded += applyAiResult(c.job, res.result, res.truncated);
            c.filterElig = assessJob(c.job, discoverCtx);
            c.outElig = profile ? assessJob(c.job, outputCtx) : c.filterElig;
        }
        decide(`ANALYZE: AI succeeded ${analyzer.usage.succeeded}, failed ${analyzer.usage.failed}; ${analyzer.usage.groundedItemsAdded} grounded item(s) added, ${analyzer.usage.ungroundedItemsDropped} ungrounded dropped.`);
    } else {
        decide(`ANALYZE: rules-only (${analyzer.usage.disabledReason ?? 'AI disabled'}).`);
    }
    // AI can only add restrictions; re-apply the country filter to anything it changed.
    const finalists = shortlist.filter((c) => {
        if (c.filterElig.status === 'explicitly_restricted') {
            exclude('LOCATION_RESTRICTION_FOUND_BY_AI');
            return false;
        }
        return true;
    });

    // ---------------- MATCH + EXPLAIN ----------------
    progress(3, profile ? `Scoring and explaining ${finalists.length} shortlisted opportunities` : `Analysing ${finalists.length} shortlisted opportunities`);
    const now = deps.now();
    const records: Opportunity[] = [];
    let invalidRecords = 0;
    for (const c of finalists) {
        let opp = toOpportunity(c.job, c.outElig, null, discoveredAt, now);
        if (profile) {
            const scored = scoreMatch(
                {
                    title: c.job.raw.title,
                    department: c.job.raw.department,
                    requiredSkills: opp.requiredSkills,
                    requiredAlternatives: opp.requiredSkillAlternatives,
                    preferredSkills: opp.preferredSkills,
                    minYears: opp.experience.minYears,
                    experienceEvidence: opp.experience.evidence,
                    seniority: c.job.seniority.value,
                    seniorityFromTitle: c.job.seniority.origin === 'title',
                    employmentType: c.job.employment.value,
                    workArrangement: c.job.arrangement.value,
                    studentRequired: opp.studentStatusRequired.required,
                    studentEvidence: opp.studentStatusRequired.evidence,
                    educationLevel: opp.education.level,
                    educationRequirement: opp.education.requirement,
                    sectionsAmbiguous: c.job.requirements.sectionsAmbiguous,
                },
                profile,
                { employmentTypes: input.employmentTypes, workArrangements: input.workArrangements },
            );
            const { explanation, suggestedNextSteps } = explainMatch(opp, scored);
            opp = { ...opp, match: { ...scored, explanation, suggestedNextSteps } };
        }
        const valid = opportunitySchema.safeParse(opp);
        if (!valid.success) {
            invalidRecords++;
            exclude('INVALID_RECORD');
            deps.log.warning(`Record ${opp.jobId} failed validation: ${valid.error.issues[0]?.path.join('.')} ${valid.error.issues[0]?.message}`);
            continue;
        }
        records.push(valid.data);
    }

    const finalKey = (o: Opportunity) => [
        ELIG_RANK[o.geographicEligibility.status],
        o.match ? -(o.match.score ?? -1) : 0,
        EARLY_RANK[o.earlyCareerFit],
        -(Date.parse(o.sourceUpdatedAt ?? o.sourcePostedAt ?? '') || 0),
    ];
    records.sort((a, b) => cmp(finalKey(a), finalKey(b)) || a.jobId.localeCompare(b.jobId));
    const toDeliver = records.slice(0, input.maxResults);

    // ---------------- DELIVER (PPE) ----------------
    for (const [i, rec] of toDeliver.entries()) {
        if (deps.delivery.isStopped) break;
        await deps.delivery.deliver(rec.jobId, rec as unknown as Record<string, unknown>);
        if (i === 0 || (i + 1) % 5 === 0 || i === toDeliver.length - 1) progress(4, `Delivered ${deps.delivery.report.delivered} of ${toDeliver.length} opportunities`);
    }
    const report = deps.delivery.report;
    decide(`DELIVER: ${report.delivered} opportunit${report.delivered === 1 ? 'y' : 'ies'} written; ${report.billedEvents} '${DELIVERY_EVENT}' event(s) charged${report.payPerEvent ? '' : ' (run is not pay-per-event, so nothing was charged)'}.`);

    const deliveredIds = new Set(deps.delivery.deliveredIds);
    const deliveredRecords = toDeliver.filter((r) => deliveredIds.has(r.jobId));
    const eligibilityCounts = { explicitly_supported: 0, explicitly_restricted: 0, unknown: 0 };
    for (const r of deliveredRecords) eligibilityCounts[r.geographicEligibility.status]++;

    // ---------------- SUMMARY ----------------
    const attempted = reports.length;
    const failed = reports.filter((r) => r.status === 'failed').length;
    const budgetErrors = reports.map((r) => r.error ?? '').join(' ');
    let stopReason: StopReason = 'completed';
    if (attempted > 0 && failed === attempted) stopReason = 'all_sources_failed';
    else if (report.stoppedByChargeLimit) stopReason = 'charge_limit_reached';
    else if (/requests budget exhausted/.test(budgetErrors)) stopReason = 'request_budget_exhausted';
    else if (/runtime budget exhausted/.test(budgetErrors)) stopReason = 'runtime_budget_exhausted';
    else if (records.length > input.maxResults) stopReason = 'max_results_reached';

    const resultStatus = report.delivered > 0 ? 'results_delivered' : 'no_matches';
    const outcome: Outcome =
        stopReason === 'all_sources_failed'
            ? 'total_source_failure'
            : stopReason === 'charge_limit_reached'
              ? 'budget_limited'
              : failed > 0
                ? 'partial_source_failure'
                : resultStatus;
    if (failed > 0 && failed < attempted) warnings.push(`${failed} of ${attempted} sources failed; results come from the remaining sources only.`);
    if (stopReason === 'request_budget_exhausted') warnings.push('The request budget ran out before every planned source was read.');
    if (analyzer.usage.failed > 0) warnings.push(`${analyzer.usage.failed} AI analysis call(s) failed; those records use rules-only extraction.`);

    const finished = deps.now();
    return {
        summaryVersion: '1.0',
        runStartedAt: startedAt.toISOString(),
        runFinishedAt: finished.toISOString(),
        durationSeconds: Math.round((finished.getTime() - startMs) / 100) / 10,
        mode: input.mode,
        input: {
            mode: input.mode,
            roleKeywords: input.roleKeywords,
            countries: input.countries,
            employmentTypes: input.employmentTypes,
            seniorityLevels: input.seniorityLevels,
            workArrangements: input.workArrangements,
            includeUnknownEligibility: input.includeUnknownEligibility,
            includeUnknownDeadline: input.includeUnknownDeadline,
            sourceIds: input.sourceIds ?? null,
            maxResults: input.maxResults,
            maxRequests: input.maxRequests,
            maxRuntimeSeconds: input.maxRuntimeSeconds,
            ai: input.ai,
            // The candidate profile itself is never stored in the summary.
            candidateProfileProvided: Boolean(input.candidateProfile),
        },
        outcome,
        resultStatus,
        stopReason,
        sources: { ranking: plan.ranking, attempted, succeeded: attempted - failed, failed, reports, expansion },
        requests: { used: http.requestsUsed, limit: input.maxRequests },
        counts: {
            listingsDiscovered,
            duplicatesRemoved,
            invalidListings,
            expiredExcluded,
            excludedByReason: excluded,
            candidates: candidates.length,
            shortlisted: shortlist.length,
            invalidRecords,
            opportunitiesDelivered: report.delivered,
        },
        eligibilityCounts,
        ai: { ...analyzer.usage, rulesOnlyFallbacks },
        billing: {
            ...report,
            eventName: DELIVERY_EVENT,
            note: report.payPerEvent
                ? 'billedEvents is the sum of chargedCount returned by Actor.pushData(record, eventName) in this run.'
                : 'The run was not in pay-per-event mode; records were written without charges.',
        },
        decisions,
        warnings,
    };
}

function earlyFit(job: AnalyzedListing) {
    const s = job.seniority.value;
    if (job.employment.value === 'internship' || ['internship', 'graduate', 'entry', 'junior'].includes(s)) return 'suitable' as const;
    if (['senior', 'lead', 'executive'].includes(s)) return 'unlikely' as const;
    return s === 'mid' ? ('possible' as const) : ('unknown' as const);
}

function cmp(a: number[], b: number[]): number {
    for (let i = 0; i < a.length; i++) {
        const d = (a[i] ?? 0) - (b[i] ?? 0);
        if (d !== 0) return d;
    }
    return 0;
}
