/**
 * The subset of the Actor's opportunity record the website shows, plus a sanitizer. Dataset content
 * is untrusted: only whitelisted fields are passed to the browser, strings are length-capped, and
 * links are kept only for HTTPS URLs on approved job-board or employer hosts.
 */

export interface MatchView {
    status: 'scored' | 'insufficient_evidence';
    score: number | null;
    evidenceCoverage: number;
    matchedSkills: string[];
    requiredSkillsNotEvidenced: string[];
    preferredSkillsNotEvidenced: string[];
    experienceNote: string;
    explanation: string;
    suggestedNextSteps: string[];
}

export interface OpportunityView {
    jobId: string;
    title: string;
    company: string;
    sourceId: string;
    applicationUrl: string | null;
    locationText: string;
    countries: string[];
    workArrangement: string;
    employmentType: string;
    seniority: string;
    earlyCareerFit: string;
    eligibility: 'explicitly_supported' | 'explicitly_restricted' | 'unknown';
    eligibilitySummary: string;
    eligibilityReasons: { code: string; message: string; evidence: string | null }[];
    unresolved: string[];
    requiredSkills: string[];
    requiredSkillAlternatives: string[][];
    preferredSkills: string[];
    experience: string | null;
    studentOnly: boolean;
    deadline: string | null;
    deadlineStatus: string;
    postedAt: string | null;
    retrievedAt: string | null;
    shortDescription: string;
    analysisMode: string;
    qualityWarnings: string[];
    match: MatchView | null;
}

export const APPROVED_LINK_HOSTS = new Set([
    'job-boards.greenhouse.io',
    'job-boards.eu.greenhouse.io',
    'boards.greenhouse.io',
    'jobs.lever.co',
    'jobs.eu.lever.co',
    'www.zipline.com',
    'moniepoint.com',
    'group.jumia.com',
    'careers.alxafrica.com',
    'canonical.com',
    'about.gitlab.com',
    'www.dlocal.com',
    'www.binance.com',
]);

export function safeLink(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    try {
        const u = new URL(raw);
        if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
        if (!APPROVED_LINK_HOSTS.has(u.hostname.toLowerCase())) return null;
        return u.toString();
    } catch {
        return null;
    }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 300): string => (typeof v === 'string' ? v.slice(0, max) : '');
const strOrNull = (v: unknown, max = 300): string | null => (typeof v === 'string' && v ? v.slice(0, max) : null);
const strArr = (v: unknown, maxItems = 40, max = 120): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, maxItems).map((x) => x.slice(0, max)) : [];
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const ELIG = new Set(['explicitly_supported', 'explicitly_restricted', 'unknown']);

export function sanitizeOpportunity(raw: unknown): OpportunityView | null {
    if (!isObj(raw)) return null;
    const title = str(raw.title, 200);
    const jobId = str(raw.jobId, 64);
    if (!title || !jobId) return null;
    const geo = isObj(raw.geographicEligibility) ? raw.geographicEligibility : {};
    const exp = isObj(raw.experience) ? raw.experience : {};
    const student = isObj(raw.studentStatusRequired) ? raw.studentStatusRequired : {};
    const source = isObj(raw.source) ? raw.source : {};
    const prov = isObj(raw.provenance) ? raw.provenance : {};
    const eligibility = ELIG.has(String(geo.status)) ? (geo.status as OpportunityView['eligibility']) : 'unknown';
    const minYears = num(exp.minYears);

    let match: MatchView | null = null;
    if (isObj(raw.match)) {
        const m = raw.match;
        const ea = isObj(m.experienceAssessment) ? m.experienceAssessment : {};
        match = {
            status: m.status === 'scored' ? 'scored' : 'insufficient_evidence',
            score: num(m.score),
            evidenceCoverage: num(m.evidenceCoverage) ?? 0,
            matchedSkills: strArr(m.matchedSkills),
            requiredSkillsNotEvidenced: strArr(m.requiredSkillsNotEvidenced),
            preferredSkillsNotEvidenced: strArr(m.preferredSkillsNotEvidenced),
            experienceNote: str(ea.note, 300),
            explanation: str(m.explanation, 1500),
            suggestedNextSteps: strArr(m.suggestedNextSteps, 2, 300),
        };
    }

    return {
        jobId,
        title,
        company: str(raw.company, 120),
        sourceId: str(source.id, 60),
        applicationUrl: safeLink(raw.applicationUrl),
        locationText: str(raw.locationText, 300),
        countries: strArr(raw.countries, 30, 2),
        workArrangement: str(raw.workArrangement, 20),
        employmentType: str(raw.employmentType, 20),
        seniority: str(raw.seniority, 20),
        earlyCareerFit: str(raw.earlyCareerFit, 20),
        eligibility,
        eligibilitySummary: str(geo.summary, 400),
        eligibilityReasons: Array.isArray(raw.eligibilityReasons)
            ? raw.eligibilityReasons.filter(isObj).slice(0, 8).map((r) => ({ code: str(r.code, 60), message: str(r.message, 400), evidence: strOrNull(r.evidence, 400) }))
            : [],
        unresolved: strArr(raw.unresolvedRequirements, 10, 300),
        requiredSkills: strArr(raw.requiredSkills),
        requiredSkillAlternatives: Array.isArray(raw.requiredSkillAlternatives) ? raw.requiredSkillAlternatives.slice(0, 6).map((g) => strArr(g, 12)) : [],
        preferredSkills: strArr(raw.preferredSkills),
        experience: minYears === null ? null : `${minYears}${num(exp.maxYears) !== null ? `–${num(exp.maxYears)}` : '+'} years`,
        studentOnly: student.required === true,
        deadline: strOrNull(raw.deadline, 10),
        deadlineStatus: str(raw.deadlineStatus, 20),
        postedAt: strOrNull(raw.sourcePostedAt, 40),
        retrievedAt: strOrNull(prov.retrievedAt, 40),
        shortDescription: str(raw.shortDescription, 600),
        analysisMode: str(raw.analysisMode, 20),
        qualityWarnings: strArr(raw.qualityWarnings, 10, 60),
        match,
    };
}

export function sanitizeList(items: unknown): OpportunityView[] {
    return Array.isArray(items) ? items.map(sanitizeOpportunity).filter((x): x is OpportunityView => x !== null) : [];
}
