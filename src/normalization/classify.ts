import type { EmploymentType, SeniorityLevel } from '../schemas/input.js';

export type JobEmploymentType = EmploymentType | 'unknown';
export type JobSeniority = SeniorityLevel | 'unknown';
export type JobWorkArrangement = 'remote' | 'hybrid' | 'onsite' | 'unspecified';

export interface Classified<T> {
    value: T;
    evidence: string | null;
    origin: 'structured_field' | 'title' | 'location' | 'description' | 'derived' | null;
}

export function classifyEmploymentType(structured: string | null, title: string): Classified<JobEmploymentType> {
    const fromText = (s: string): JobEmploymentType | null => {
        if (/\bintern(ship)?\b/i.test(s)) return 'internship';
        if (/\bapprentice(ship)?\b/i.test(s)) return 'apprenticeship';
        if (/\bpart[\s-]?time\b/i.test(s)) return 'part_time';
        if (/\b(contract(or)?|freelance|fixed[\s-]term)\b/i.test(s)) return 'contract';
        if (/\b(temporary|temp|seasonal)\b/i.test(s)) return 'temporary';
        if (/\b(full[\s-]?time|permanent|regular)\b/i.test(s)) return 'full_time';
        return null;
    };
    if (structured) {
        const v = fromText(structured);
        if (v) return { value: v, evidence: structured, origin: 'structured_field' };
    }
    const t = fromText(title);
    if (t && t !== 'full_time') return { value: t, evidence: title, origin: 'title' };
    return { value: 'unknown', evidence: null, origin: null };
}

const SENIORITY_TITLE_RULES: [SeniorityLevel, RegExp][] = [
    ['executive', /\b(chief|c[etofi]o|vp|vice president|director|head of|head,|general manager|country manager)\b/i],
    ['lead', /\b(lead|principal|staff (?:engineer|software|data|designer)|engineering manager|tech lead|team lead)\b/i],
    ['senior', /\b(senior|sr\.?|snr)\b/i],
    ['internship', /\bintern(ship)?\b/i],
    ['graduate', /\b(graduate|new grad|trainee|accelerator program(?:me)?|early[\s-]careers?|apprentice(ship)?|fellowship|campus)\b/i],
    ['entry', /\bentry[\s-]level\b/i],
    ['junior', /\b(junior|jr\.?)\b/i],
    ['mid', /\b(mid[\s-]level|intermediate)\b|\b(engineer|developer|analyst)\s+(ii|2)\b/i],
];

export function classifySeniority(title: string, minYears: number | null): Classified<JobSeniority> {
    for (const [level, re] of SENIORITY_TITLE_RULES) {
        if (re.test(title)) return { value: level, evidence: title, origin: 'title' };
    }
    if (minYears !== null) {
        const value: SeniorityLevel = minYears <= 1 ? 'entry' : minYears <= 4 ? 'mid' : 'senior';
        return { value, evidence: `derived from a stated minimum of ${minYears} year(s) of experience`, origin: 'derived' };
    }
    return { value: 'unknown', evidence: null, origin: null };
}

export type EarlyCareerFit = 'suitable' | 'possible' | 'unlikely' | 'unknown';

export function earlyCareerFit(seniority: JobSeniority, minYears: number | null, employmentType: JobEmploymentType): EarlyCareerFit {
    if (employmentType === 'internship' || employmentType === 'apprenticeship') return 'suitable';
    if (['internship', 'graduate', 'entry', 'junior'].includes(seniority)) {
        return minYears !== null && minYears >= 3 ? 'possible' : 'suitable';
    }
    if (['senior', 'lead', 'executive'].includes(seniority)) return 'unlikely';
    if (minYears !== null) return minYears <= 1 ? 'suitable' : minYears <= 3 ? 'possible' : 'unlikely';
    if (seniority === 'mid') return 'possible';
    return 'unknown';
}

const REMOTE_RE = /\b(remote|home[\s-]based|work from home|wfh|anywhere|distributed|telecommute)\b/i;
const HYBRID_RE = /\bhybrid\b/i;
const ONSITE_RE = /\b(on[\s-]?site|in[\s-]office|office[\s-]based|in[\s-]person)\b/i;

/**
 * Work arrangement from structured fields and location text first; the description is only
 * consulted for explicit statements ("this is a fully remote role").
 */
export function classifyWorkArrangement(
    structuredWorkplace: string | null,
    locationTexts: string[],
    description: string,
): Classified<JobWorkArrangement> {
    if (structuredWorkplace) {
        const w = structuredWorkplace.toLowerCase();
        if (w === 'remote') return { value: 'remote', evidence: `workplaceType: ${structuredWorkplace}`, origin: 'structured_field' };
        if (w === 'hybrid') return { value: 'hybrid', evidence: `workplaceType: ${structuredWorkplace}`, origin: 'structured_field' };
        if (w === 'on-site' || w === 'onsite') return { value: 'onsite', evidence: `workplaceType: ${structuredWorkplace}`, origin: 'structured_field' };
    }
    const loc = locationTexts.join('; ');
    if (HYBRID_RE.test(loc)) return { value: 'hybrid', evidence: loc, origin: 'location' };
    if (REMOTE_RE.test(loc)) return { value: 'remote', evidence: loc, origin: 'location' };
    if (ONSITE_RE.test(loc)) return { value: 'onsite', evidence: loc, origin: 'location' };

    const explicit =
        /\b(this (?:is an? |role is )?(?:fully |100% )?remote (?:role|position)|(?:fully|100%) remote\b|remote[\s-]first)/i.exec(description) ??
        /\b(this is an? hybrid (?:role|position)|hybrid (?:role|position|working model))\b/i.exec(description) ??
        /\b(this (?:role|position) is (?:based )?on[\s-]?site|must work (?:from|in) (?:the|our) office)\b/i.exec(description);
    if (explicit) {
        const text = explicit[0];
        const value: JobWorkArrangement = /hybrid/i.test(text) ? 'hybrid' : /remote/i.test(text) ? 'remote' : 'onsite';
        return { value, evidence: text, origin: 'description' };
    }
    return { value: 'unspecified', evidence: null, origin: null };
}
