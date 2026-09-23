import type { JobEmploymentType, JobSeniority, JobWorkArrangement } from '../normalization/classify.js';
import { canonicalizeSkill } from '../normalization/skills.js';
import type { CandidateProfile, EmploymentType, WorkArrangementPref } from '../schemas/input.js';
import type { MatchResult } from '../schemas/opportunity.js';
import { roleAlignment } from './roles.js';

/** Documented baseline weights (sum = 100). Geography is evaluated separately and never mixed in. */
export const WEIGHTS = {
    required_skills: 45,
    preferred_skills: 10,
    experience: 20,
    role_alignment: 15,
    preferences: 10,
} as const;

/** Below this share of weighted evidence the job gets no numeric score. */
export const MIN_EVIDENCE_COVERAGE = 0.5;

/** Expected minimum years implied by a seniority stated in the title (not by derived seniority). */
const SENIORITY_YEARS: Record<string, number> = {
    internship: 0, graduate: 0, entry: 0, junior: 1, mid: 3, senior: 5, lead: 7, executive: 10,
};

const EDUCATION_RANK: Record<string, number> = { secondary: 0, bootcamp: 0, other: 0, diploma: 1, bachelor: 2, master: 3, doctorate: 4 };

export interface MatchJobFacts {
    title: string;
    department: string | null;
    requiredSkills: string[];
    /** Each group counts as one required item, satisfied by any member. */
    requiredAlternatives: string[][];
    preferredSkills: string[];
    minYears: number | null;
    experienceEvidence: string | null;
    seniority: JobSeniority;
    seniorityFromTitle: boolean;
    employmentType: JobEmploymentType;
    workArrangement: JobWorkArrangement;
    studentRequired: boolean;
    studentEvidence: string | null;
    educationLevel: string | null;
    educationRequirement: 'required' | 'preferred' | 'not_stated';
    sectionsAmbiguous: boolean;
}

export interface MatchPreferences {
    employmentTypes: EmploymentType[];
    workArrangements: WorkArrangementPref[];
}

type Breakdown = MatchResult['scoreBreakdown'][number];

export type ScoredMatch = Omit<MatchResult, 'explanation' | 'suggestedNextSteps'>;

export function scoreMatch(job: MatchJobFacts, profile: CandidateProfile, prefs: MatchPreferences): ScoredMatch {
    const profileSkills = new Map(profile.skills.map((s) => [canonicalizeSkill(s).toLowerCase(), canonicalizeSkill(s)]));
    const has = (skill: string) => profileSkills.has(canonicalizeSkill(skill).toLowerCase());

    const matchedRequired = job.requiredSkills.filter(has);
    const matchedPreferred = job.preferredSkills.filter(has);
    const requiredNot = job.requiredSkills.filter((s) => !has(s));
    const preferredNot = job.preferredSkills.filter((s) => !has(s));
    const groupHits = job.requiredAlternatives.map((g) => g.filter(has));
    const groupsMet = groupHits.filter((h) => h.length > 0).length;
    job.requiredAlternatives.forEach((g, i) => {
        if (!groupHits[i]!.length) requiredNot.push(`one of: ${g.join(' / ')}`);
    });
    const requiredItems = job.requiredSkills.length + job.requiredAlternatives.length;
    const requiredMet = matchedRequired.length + groupsMet;
    const breakdown: Breakdown[] = [];

    // Required skills (an "any of" group counts as one item)
    if (requiredItems) {
        breakdown.push({
            dimension: 'required_skills',
            weight: WEIGHTS.required_skills,
            scored: true,
            value: round(requiredMet / requiredItems),
            note: `${requiredMet} of ${requiredItems} required skill items evidenced in your profile${job.requiredAlternatives.length ? ` (${job.requiredAlternatives.length} of them "any one of" groups)` : ''}${job.sectionsAmbiguous ? '; the posting does not separate required from preferred skills clearly' : ''}.`,
        });
    } else {
        breakdown.push({ dimension: 'required_skills', weight: WEIGHTS.required_skills, scored: false, value: null, note: 'No recognised required skills in the posting.' });
    }

    // Preferred skills
    if (job.preferredSkills.length) {
        breakdown.push({
            dimension: 'preferred_skills',
            weight: WEIGHTS.preferred_skills,
            scored: true,
            value: round(matchedPreferred.length / job.preferredSkills.length),
            note: `${matchedPreferred.length} of ${job.preferredSkills.length} preferred skills evidenced in your profile.`,
        });
    } else {
        breakdown.push({ dimension: 'preferred_skills', weight: WEIGHTS.preferred_skills, scored: false, value: null, note: 'No recognised preferred skills in the posting.' });
    }

    // Experience
    let experienceAssessment: MatchResult['experienceAssessment'];
    const expected = job.minYears ?? (job.seniorityFromTitle ? (SENIORITY_YEARS[job.seniority] ?? null) : null);
    if (expected !== null) {
        const basis = job.minYears !== null ? `the posting asks for at least ${job.minYears} year(s)` : `the title indicates a ${job.seniority}-level role (about ${expected}+ years assumed)`;
        const meets = profile.yearsExperience >= expected;
        // Partial credit only for small gaps; a gap of 3+ years scores zero on this dimension.
        const value = meets ? 1 : expected - profile.yearsExperience >= 3 ? 0 : profile.yearsExperience / expected;
        breakdown.push({ dimension: 'experience', weight: WEIGHTS.experience, scored: true, value: round(value), note: `You declared ${profile.yearsExperience} year(s); ${basis}.` });
        experienceAssessment = {
            status: meets ? 'meets' : 'below',
            note: `${meets ? 'Meets' : 'Below'}: you declared ${profile.yearsExperience} year(s); ${basis}.`,
        };
    } else {
        breakdown.push({ dimension: 'experience', weight: WEIGHTS.experience, scored: false, value: null, note: 'The posting does not state an experience level.' });
        experienceAssessment = { status: 'unknown', note: 'The posting does not state an experience requirement.' };
    }

    // Role alignment (always scorable: every job has a title)
    const target = `${job.title} ${job.department ?? ''}`;
    const best = Math.max(0, ...profile.desiredRoles.map((r) => roleAlignment(r, target)));
    breakdown.push({
        dimension: 'role_alignment',
        weight: WEIGHTS.role_alignment,
        scored: true,
        value: round(best),
        note: `Best overlap between your desired roles and "${job.title}" is ${Math.round(best * 100)}%.`,
    });

    // Preferences
    const prefParts: number[] = [];
    const prefNotes: string[] = [];
    if (prefs.employmentTypes.length && job.employmentType !== 'unknown') {
        const ok = prefs.employmentTypes.includes(job.employmentType as EmploymentType);
        prefParts.push(ok ? 1 : 0);
        prefNotes.push(`employment type ${job.employmentType} ${ok ? 'matches' : 'does not match'}`);
    }
    if (prefs.workArrangements.length && job.workArrangement !== 'unspecified') {
        const ok = prefs.workArrangements.includes(job.workArrangement as WorkArrangementPref);
        prefParts.push(ok ? 1 : 0);
        prefNotes.push(`work arrangement ${job.workArrangement} ${ok ? 'matches' : 'does not match'}`);
    }
    if (prefParts.length) {
        breakdown.push({
            dimension: 'preferences',
            weight: WEIGHTS.preferences,
            scored: true,
            value: round(prefParts.reduce((a, b) => a + b, 0) / prefParts.length),
            note: `${capitalize(prefNotes.join('; '))}.`,
        });
    } else {
        breakdown.push({ dimension: 'preferences', weight: WEIGHTS.preferences, scored: false, value: null, note: 'No comparable employment-type or work-arrangement preference.' });
    }

    const scoredWeight = breakdown.filter((b) => b.scored).reduce((a, b) => a + b.weight, 0);
    const weighted = breakdown.filter((b) => b.scored).reduce((a, b) => a + b.weight * (b.value ?? 0), 0);
    const evidenceCoverage = round(scoredWeight / 100);
    const sufficient = evidenceCoverage >= MIN_EVIDENCE_COVERAGE;

    return {
        status: sufficient ? 'scored' : 'insufficient_evidence',
        score: sufficient && scoredWeight > 0 ? Math.round((weighted / scoredWeight) * 100) : null,
        scoreBreakdown: breakdown,
        evidenceCoverage,
        matchedSkills: [...new Set([...matchedRequired, ...groupHits.flat(), ...matchedPreferred])],
        requiredSkillsNotEvidenced: requiredNot,
        preferredSkillsNotEvidenced: preferredNot,
        experienceAssessment,
        requirementChecks: requirementChecks(job, profile),
    };
}

function requirementChecks(job: MatchJobFacts, profile: CandidateProfile): MatchResult['requirementChecks'] {
    const checks: MatchResult['requirementChecks'] = [];
    if (job.studentRequired) {
        const status = profile.studentStatus === 'enrolled' ? 'met' : profile.studentStatus ? 'not_met' : 'unknown';
        checks.push({
            requirement: 'Current student status',
            status,
            note:
                status === 'met'
                    ? 'You declared that you are currently enrolled.'
                    : status === 'not_met'
                      ? `The posting is for current students; you declared "${profile.studentStatus}".`
                      : 'The posting is for current students; your student status is not declared.',
        });
    }
    if (job.educationLevel && job.educationRequirement === 'required') {
        const need = EDUCATION_RANK[job.educationLevel];
        const have = profile.educationLevel ? EDUCATION_RANK[profile.educationLevel] : undefined;
        const status = have === undefined || need === undefined ? 'unknown' : have >= need ? 'met' : 'not_met';
        checks.push({
            requirement: `Education: ${job.educationLevel}`,
            status,
            note: status === 'unknown' ? 'Education level not declared in your profile.' : `You declared ${profile.educationLevel}.`,
        });
    }
    return checks;
}

const round = (n: number) => Math.round(n * 100) / 100;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
