import { createHash } from 'node:crypto';

import type { GroundedAiResult } from '../ai/validate.js';
import { assessEligibility, type EligibilityContext, type EligibilityResult } from '../eligibility/assess.js';
import { type ParsedGeo, parseGeo } from '../eligibility/countries.js';
import { findRestrictions, type Restriction } from '../eligibility/restrictions.js';
import {
    type Classified,
    classifyEmploymentType,
    classifySeniority,
    classifyWorkArrangement,
    earlyCareerFit,
    type JobEmploymentType,
    type JobSeniority,
    type JobWorkArrangement,
} from '../normalization/classify.js';
import { daysSince, type DeadlineInfo, deadlineStatus, type DeadlineStatus, findDeadline } from '../normalization/dates.js';
import { type ExtractedRequirements, extractRequirements, extractStudentRequirement } from '../normalization/requirements.js';
import { type ClassifiedLine, classifyBlocks, classifyNamedLists } from '../normalization/sections.js';
import { blocksToText, cleanLine, htmlToBlocks, truncate } from '../normalization/text.js';
import { isSafePublicUrl } from '../normalization/urls.js';
import { getRegistryEntry } from '../sources/registry.js';
import type { RawListing } from '../sources/types.js';
import type { Evidence, MatchResult, Opportunity } from '../schemas/opportunity.js';
import { SCHEMA_VERSION } from '../schemas/opportunity.js';

export const STALE_AFTER_DAYS = 90;

export interface AnalyzedListing {
    raw: RawListing;
    jobId: string;
    lines: ClassifiedLine[];
    plainText: string;
    locationText: string;
    geo: ParsedGeo;
    arrangement: Classified<JobWorkArrangement>;
    employment: Classified<JobEmploymentType>;
    seniority: Classified<JobSeniority>;
    requirements: ExtractedRequirements;
    restrictions: Restriction[];
    deadline: DeadlineInfo;
    deadlineStatus: DeadlineStatus;
    applicationUrl: string;
    sourceUrl: string;
    qualityWarnings: string[];
    analysisMode: 'rules_only' | 'ai_assisted';
    aiEvidence: Evidence[];
    duplicateRefs: Opportunity['duplicateSourceReferences'];
    decisionReasons: string[];
}

export type AnalyzeOutcome = { ok: true; job: AnalyzedListing } | { ok: false; reason: string };

export function makeJobId(sourceId: string, sourceJobId: string): string {
    return createHash('sha256').update(`${sourceId}:${sourceJobId}`).digest('hex').slice(0, 20);
}

export function analyzeListing(raw: RawListing, now: Date): AnalyzeOutcome {
    if (!raw.title || !raw.sourceJobId) return { ok: false, reason: 'INVALID_MISSING_FIELDS' };
    const sourceUrl = isSafePublicUrl(raw.jobUrl) ? raw.jobUrl : null;
    const applicationUrl = isSafePublicUrl(raw.applyUrl) ? raw.applyUrl : sourceUrl;
    if (!sourceUrl || !applicationUrl) return { ok: false, reason: 'INVALID_UNSAFE_URL' };

    const blocks = htmlToBlocks(raw.descriptionHtml);
    const lines = [...classifyBlocks(blocks), ...classifyNamedLists(raw.namedLists)];
    const plainText = [
        blocksToText(blocks),
        ...raw.namedLists.map((l) => [l.title, ...l.items.map((i) => `- ${i}`)].join('\n')),
    ]
        .filter(Boolean)
        .join('\n');

    const locationText = raw.locationTexts.join('; ');
    let geo = parseGeo(locationText);
    if (!geo.countries.length && !geo.regions.length && !geo.worldwide && raw.structuredCountryCode) {
        geo = { ...geo, countries: [raw.structuredCountryCode] };
    }
    const requirements = extractRequirements(lines);
    requirements.studentOnly = extractStudentRequirement(lines, raw.title);
    const arrangement = classifyWorkArrangement(raw.structuredWorkplaceType, raw.locationTexts, plainText);
    const employment = classifyEmploymentType(raw.structuredEmploymentType, raw.title);
    const seniority = classifySeniority(raw.title, requirements.experience.minYears);
    const deadline = findDeadline(raw.structuredDeadline, lines);

    const qualityWarnings: string[] = [];
    if (!plainText) qualityWarnings.push('NO_DESCRIPTION');
    else if (requirements.sectionsAmbiguous) qualityWarnings.push('REQUIRED_PREFERRED_NOT_SEPARATED');
    if (!locationText) qualityWarnings.push('LOCATION_MISSING');
    if (raw.locationTexts.length > 3) qualityWarnings.push('MANY_LOCATIONS_LISTED');
    const age = daysSince(raw.updatedAt ?? raw.postedAt, now);
    if (age === null) qualityWarnings.push('NO_POSTING_DATE');
    else if (age > STALE_AFTER_DAYS) qualityWarnings.push(`STALE_POSTING_${age}_DAYS`);
    if (employment.value === 'unknown') qualityWarnings.push('EMPLOYMENT_TYPE_UNKNOWN');

    return {
        ok: true,
        job: {
            raw,
            jobId: makeJobId(raw.sourceId, raw.sourceJobId),
            lines,
            plainText,
            locationText,
            geo,
            arrangement,
            employment,
            seniority,
            requirements,
            restrictions: findRestrictions(plainText),
            deadline,
            deadlineStatus: deadlineStatus(deadline.deadline, now),
            applicationUrl,
            sourceUrl,
            qualityWarnings,
            analysisMode: 'rules_only',
            aiEvidence: [],
            duplicateRefs: [],
            decisionReasons: [],
        },
    };
}

/**
 * Merge grounded AI additions into the rules result. AI can add skills, a missing experience
 * minimum, a student-only requirement and extra restrictions. It never removes a rules finding,
 * never moves a required skill to preferred, and never relaxes a restriction.
 */
export function applyAiResult(job: AnalyzedListing, ai: GroundedAiResult, truncated: boolean): number {
    let added = 0;
    const req = job.requirements;
    const known = new Set([...req.required, ...req.preferred, ...req.requiredAlternatives.flatMap((g) => g.skills.map((skill) => ({ skill })))].map((s) => s.skill.toLowerCase()));
    for (const s of ai.required) {
        if (known.has(s.skill.toLowerCase())) continue;
        req.required.push({ skill: s.skill, evidence: s.evidence });
        known.add(s.skill.toLowerCase());
        job.aiEvidence.push({ field: `requiredSkills.${s.skill}`, excerpt: s.evidence, origin: 'ai_quoted_description' });
        added++;
    }
    for (const s of ai.preferred) {
        if (known.has(s.skill.toLowerCase())) continue;
        req.preferred.push({ skill: s.skill, evidence: s.evidence });
        known.add(s.skill.toLowerCase());
        job.aiEvidence.push({ field: `preferredSkills.${s.skill}`, excerpt: s.evidence, origin: 'ai_quoted_description' });
        added++;
    }
    if (req.experience.minYears === null && ai.minYears) {
        req.experience = { minYears: ai.minYears.years, maxYears: null, evidence: ai.minYears.evidence };
        job.aiEvidence.push({ field: 'experience.minYears', excerpt: ai.minYears.evidence, origin: 'ai_quoted_description' });
        if (job.seniority.value === 'unknown') job.seniority = classifySeniority(job.raw.title, ai.minYears.years);
        added++;
    }
    if (!req.studentOnly.required && ai.studentOnly) {
        req.studentOnly = { required: true, evidence: ai.studentOnly.evidence };
        job.aiEvidence.push({ field: 'studentStatusRequired', excerpt: ai.studentOnly.evidence, origin: 'ai_quoted_description' });
        added++;
    }
    for (const r of ai.restrictions) {
        const dup = job.restrictions.some((x) => x.kind === r.kind && x.countries.join() === r.countries.join() && x.regions.join() === r.regions.join());
        if (dup) continue;
        job.restrictions.push(r);
        job.aiEvidence.push({ field: `restriction.${r.kind}`, excerpt: r.quote, origin: 'ai_quoted_description' });
        added++;
    }
    job.analysisMode = 'ai_assisted';
    if (truncated) job.qualityWarnings.push('AI_INPUT_TRUNCATED');
    return added;
}

export function assessJob(job: AnalyzedListing, ctx: EligibilityContext): EligibilityResult {
    return assessEligibility(job.arrangement.value, job.geo, job.locationText, job.restrictions, ctx);
}

/** How uncertain the rules-only analysis is; used to prioritise the limited AI budget. */
export function uncertaintyScore(job: AnalyzedListing, eligibility: EligibilityResult): number {
    let score = 0;
    if (!job.plainText) return -1; // nothing for AI to read
    if (job.requirements.sectionsAmbiguous) score += 2;
    if (!job.requirements.required.length) score += 2;
    if (job.requirements.experience.minYears === null) score += 1;
    if (eligibility.status === 'unknown') score += 2;
    if (job.seniority.value === 'unknown') score += 1;
    return score;
}

export function toOpportunity(
    job: AnalyzedListing,
    eligibility: EligibilityResult,
    match: MatchResult | null,
    discoveredAt: string,
    now: Date,
): Opportunity {
    const raw = job.raw;
    const entry = getRegistryEntry(raw.sourceId);
    const req = job.requirements;
    const evidence: Evidence[] = [
        { field: 'title', excerpt: truncate(raw.title, 200), origin: 'structured_field' },
    ];
    if (job.locationText) evidence.push({ field: 'location', excerpt: truncate(job.locationText, 300), origin: 'structured_field' });
    const originOf = (o: Classified<unknown>['origin']): Evidence['origin'] => (o === 'description' ? 'description' : 'structured_field');
    if (job.employment.evidence) evidence.push({ field: 'employmentType', excerpt: truncate(job.employment.evidence, 200), origin: originOf(job.employment.origin) });
    if (job.arrangement.evidence) evidence.push({ field: 'workArrangement', excerpt: truncate(job.arrangement.evidence, 200), origin: originOf(job.arrangement.origin) });
    if (job.seniority.evidence) evidence.push({ field: 'seniority', excerpt: truncate(job.seniority.evidence, 200), origin: job.seniority.origin === 'title' ? 'structured_field' : 'description' });
    if (job.deadline.evidence) evidence.push({ field: 'deadline', excerpt: job.deadline.evidence, origin: job.deadline.origin ?? 'description' });
    if (req.experience.evidence && !job.aiEvidence.some((e) => e.field === 'experience.minYears')) {
        evidence.push({ field: 'experience', excerpt: req.experience.evidence, origin: 'description' });
    }
    if (req.education.evidence) evidence.push({ field: 'education', excerpt: req.education.evidence, origin: 'description' });
    for (const g of req.requiredAlternatives.slice(0, 4)) evidence.push({ field: `requiredSkillAlternatives.${g.skills.join("|")}`, excerpt: g.evidence, origin: "description" });
    if (req.studentOnly.evidence && !job.aiEvidence.some((e) => e.field === 'studentStatusRequired')) {
        evidence.push({ field: 'studentStatusRequired', excerpt: req.studentOnly.evidence, origin: 'description' });
    }
    const aiSkillFields = new Set(job.aiEvidence.map((e) => e.field));
    for (const s of req.required.slice(0, 12)) {
        if (!aiSkillFields.has(`requiredSkills.${s.skill}`)) evidence.push({ field: `requiredSkills.${s.skill}`, excerpt: s.evidence, origin: 'description' });
    }
    for (const s of req.preferred.slice(0, 8)) {
        if (!aiSkillFields.has(`preferredSkills.${s.skill}`)) evidence.push({ field: `preferredSkills.${s.skill}`, excerpt: s.evidence, origin: 'description' });
    }
    for (const r of job.restrictions.filter((x) => x.origin === 'description')) {
        evidence.push({ field: `restriction.${r.kind}`, excerpt: r.quote, origin: 'description' });
    }
    evidence.push(...job.aiEvidence);

    const unresolved = [...eligibility.unresolved];
    if (req.studentOnly.required) unresolved.push('The posting is for current students only.');
    if (req.education.requirement === 'required' && req.education.level) unresolved.push(`Education requirement: ${req.education.level}.`);

    // Prefer what the role involves over company boilerplate, which usually opens a posting.
    const describe = (section: string) => job.lines.filter((l) => l.section === section && l.text.length > 30).map((l) => l.text);
    const shortDescription = truncate(
        (describe('responsibilities').length ? describe('responsibilities') : describe('other')).slice(0, 3).join(' ') || cleanLine(job.plainText),
        480,
    );

    return {
        schemaVersion: SCHEMA_VERSION,
        jobId: job.jobId,
        sourceJobId: raw.sourceJobId,
        title: raw.title,
        company: raw.company,
        source: { id: raw.sourceId, family: raw.family, boardId: raw.boardId },
        sourceUrl: job.sourceUrl,
        applicationUrl: job.applicationUrl,
        discoveredAt,
        sourcePostedAt: raw.postedAt,
        sourceUpdatedAt: raw.updatedAt,
        freshnessDays: daysSince(raw.updatedAt ?? raw.postedAt, now),
        deadline: job.deadline.deadline,
        deadlineStatus: job.deadlineStatus,
        locationText: job.locationText,
        countries: job.geo.countries,
        regions: job.geo.worldwide ? [...job.geo.regions, 'Worldwide'] : job.geo.regions,
        workArrangement: job.arrangement.value,
        employmentType: job.employment.value,
        seniority: job.seniority.value,
        earlyCareerFit: earlyCareerFit(job.seniority.value, req.experience.minYears, job.employment.value),
        experience: req.experience,
        education: req.education,
        studentStatusRequired: req.studentOnly,
        requiredSkills: req.required.map((s) => s.skill),
        requiredSkillAlternatives: req.requiredAlternatives.map((g) => g.skills),
        preferredSkills: req.preferred.map((s) => s.skill),
        salary: raw.salary,
        shortDescription,
        geographicEligibility: {
            status: eligibility.status,
            basis: eligibility.basis,
            assessedFor: eligibility.assessedFor,
            summary: eligibility.summary,
        },
        eligibilityReasons: eligibility.reasons,
        unresolvedRequirements: [...new Set(unresolved)],
        evidence,
        provenance: {
            adapter: raw.family === 'greenhouse' ? 'greenhouse-job-board-api-v1' : 'lever-postings-api-v0',
            apiUrl: raw.apiUrl,
            retrievedAt: raw.retrievedAt,
            registryVerifiedAt: entry?.verifiedAt ?? 'unknown',
        },
        qualityWarnings: job.qualityWarnings,
        duplicateSourceReferences: job.duplicateRefs,
        analysisMode: job.analysisMode,
        decisionReasons: job.decisionReasons,
        match,
    };
}
