import type { ClassifiedLine } from './sections.js';
import { extractSkills } from './skills.js';
import { truncate } from './text.js';

export interface SkillRequirement {
    skill: string;
    evidence: string;
}

export interface ExtractedRequirements {
    required: SkillRequirement[];
    /** "One of Python, Go or Java" — each group is satisfied by any one member. */
    requiredAlternatives: { skills: string[]; evidence: string }[];
    preferred: SkillRequirement[];
    experience: { minYears: number | null; maxYears: number | null; evidence: string | null };
    education: { level: string | null; requirement: 'required' | 'preferred' | 'not_stated'; evidence: string | null };
    studentOnly: { required: boolean; evidence: string | null };
    /** True when there was no heading-level signal separating required from preferred skills. */
    sectionsAmbiguous: boolean;
}

const WORD_NUM: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
const NUM = String.raw`(\d{1,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten)`;
const toNum = (s: string) => (s in WORD_NUM ? WORD_NUM[s]! : Number.parseInt(s, 10));

const RANGE_RE = new RegExp(String.raw`\b${NUM}\s*\+?\s*(?:-|–|—|to)\s*${NUM}\s*\+?\s*years?`, 'i');
const MIN_RE = new RegExp(
    String.raw`(?:\bat least|\bminimum(?: of)?|\bmin\.?|\bover|\bmore than)\s*${NUM}\s*\+?\s*years?|\b${NUM}\s*\+\s*years?|\b${NUM}\s*(?:or more\s*)?years?(?:'|’)?\s*(?:of\s+)?(?:[\w/&,-]+\s+){0,6}?experience`,
    'i',
);
const NO_EXPERIENCE_RE = /\bno (?:prior |previous |professional )?(?:work )?experience (?:is )?(?:required|needed|necessary)\b/i;

const STUDENT_RE =
    /\b(currently enrolled|current(?:ly)? (?:an? )?(?:university |college |undergraduate |graduate )?students?|must be (?:a )?(?:current |full[- ]time )?(?:university |college )?student|enrolled in an? (?:accredited )?(?:degree|university|bachelor'?s?|master'?s?|undergraduate|graduate) (?:program|programme|course)?|for current university students|penultimate[- ]year|final[- ]year students?)\b/i;

const EDUCATION_RULES: [string, RegExp][] = [
    ['doctorate', /\b(ph\.?d|doctorate|doctoral)\b/i],
    ['master', /\b(master'?s|msc|m\.sc|mba|m\.s\.)\b/i],
    ['bachelor', /\b(bachelor'?s?|bsc|b\.sc|b\.s\.|b\.tech|beng|b\.eng|undergraduate degree|university degree|college degree|degree in)\b/i],
    ['diploma', /\b(hnd|ond|higher national diploma|diploma)\b/i],
];
const PREFERENCE_WORDS = /\b(preferred|or equivalent|nice to have|a plus|desirable|ideally|advantage)\b/i;

function lineEvidence(line: ClassifiedLine): string {
    return truncate(line.text, 220);
}

/**
 * Deterministic requirement extraction. Skills in "required" sections are required; skills in
 * "preferred" sections (or lines flagged "nice to have", "a plus", ...) are preferred. When a
 * description has no section signal at all, skills are reported as required-by-mention and the
 * result is flagged ambiguous so downstream scoring can lower confidence.
 */
/** Phrases that turn the skills after them into examples / alternatives rather than a checklist. */
const ALTERNATIVES_RE = /\b(?:(?:one|any|either)\s+(?:or more\s+)?of(?: the following)?|such as|e\.g\.?|for example|for instance|at least one)\b|\(e\.g/i;

export function extractRequirements(lines: ClassifiedLine[]): ExtractedRequirements {
    const required = new Map<string, string>();
    const preferred = new Map<string, string>();
    const alternatives: { skills: string[]; evidence: string }[] = [];
    const hasSectionSignal = lines.some((l) => l.section === 'required' || l.section === 'preferred');

    for (const line of lines) {
        const targetSection =
            line.section === 'preferred'
                ? 'preferred'
                : line.section === 'required'
                  ? 'required'
                  : !hasSectionSignal && (line.section === 'other' || line.section === 'responsibilities')
                    ? 'required'
                    : null;
        if (!targetSection) continue;
        const hits = extractSkills(line.text);
        if (targetSection === 'preferred') {
            for (const hit of hits) if (!preferred.has(hit.skill)) preferred.set(hit.skill, lineEvidence(line));
            continue;
        }
        // Required line: skills after an "e.g. / one of / such as" phrase are alternatives. A bare
        // "A or B" (with no "and") is also an alternative group.
        const alt = ALTERNATIVES_RE.exec(line.text);
        const bareOr = !alt && hits.length >= 2 && /\bor\b/i.test(line.text) && !/\band\b/i.test(line.text);
        const groupStart = alt ? alt.index : bareOr ? 0 : Infinity;
        const grouped = hits.filter((h) => h.index >= groupStart);
        const individual = grouped.length >= 2 ? hits.filter((h) => h.index < groupStart) : hits;
        for (const hit of individual) if (!required.has(hit.skill)) required.set(hit.skill, lineEvidence(line));
        if (grouped.length >= 2) alternatives.push({ skills: grouped.map((h) => h.skill), evidence: lineEvidence(line) });
    }
    // A skill explicitly required is never downgraded to preferred, and is not also an alternative.
    for (const skill of required.keys()) preferred.delete(skill);
    const requiredAlternatives = alternatives
        .map((g) => ({ ...g, skills: g.skills.filter((s) => !required.has(s)) }))
        .filter((g) => g.skills.length >= 2);
    for (const g of requiredAlternatives) for (const s of g.skills) preferred.delete(s);

    return {
        required: [...required].map(([skill, evidence]) => ({ skill, evidence })),
        requiredAlternatives,
        preferred: [...preferred].map(([skill, evidence]) => ({ skill, evidence })),
        experience: extractExperience(lines),
        education: extractEducation(lines),
        studentOnly: extractStudentRequirement(lines),
        sectionsAmbiguous: !hasSectionSignal,
    };
}

export function extractExperience(lines: ClassifiedLine[]): ExtractedRequirements['experience'] {
    const ordered = [
        ...lines.filter((l) => l.section === 'required'),
        ...lines.filter((l) => l.section === 'other' || l.section === 'responsibilities'),
        ...lines.filter((l) => l.section === 'preferred'),
    ];
    for (const line of ordered) {
        if (NO_EXPERIENCE_RE.test(line.text)) return { minYears: 0, maxYears: null, evidence: lineEvidence(line) };
    }
    for (const line of ordered) {
        if (!/experience|years/i.test(line.text)) continue;
        const range = RANGE_RE.exec(line.text);
        if (range) {
            const a = toNum(range[1]!.toLowerCase());
            const b = toNum(range[2]!.toLowerCase());
            if (a <= b && b <= 40) return { minYears: a, maxYears: b, evidence: lineEvidence(line) };
        }
        const min = MIN_RE.exec(line.text);
        if (min) {
            const raw = (min[1] ?? min[2] ?? min[3])!.toLowerCase();
            const n = toNum(raw);
            if (n <= 40) return { minYears: n, maxYears: null, evidence: lineEvidence(line) };
        }
    }
    return { minYears: null, maxYears: null, evidence: null };
}

export function extractEducation(lines: ClassifiedLine[]): ExtractedRequirements['education'] {
    for (const line of lines) {
        if (line.section === 'about' || line.section === 'benefits') continue;
        for (const [level, re] of EDUCATION_RULES) {
            if (!re.test(line.text)) continue;
            const requirement = line.section === 'preferred' || PREFERENCE_WORDS.test(line.text) ? 'preferred' : 'required';
            return { level, requirement, evidence: lineEvidence(line) };
        }
    }
    return { level: null, requirement: 'not_stated', evidence: null };
}

export function extractStudentRequirement(lines: ClassifiedLine[], title = ''): ExtractedRequirements['studentOnly'] {
    if (STUDENT_RE.test(title)) return { required: true, evidence: truncate(title, 220) };
    for (const line of lines) {
        if (line.section === 'about' || line.section === 'benefits') continue;
        if (STUDENT_RE.test(line.text)) return { required: true, evidence: lineEvidence(line) };
    }
    return { required: false, evidence: null };
}
