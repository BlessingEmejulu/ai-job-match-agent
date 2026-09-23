import { parseGeo } from '../eligibility/countries.js';
import type { Restriction } from '../eligibility/restrictions.js';
import { canonicalizeSkill, extractSkills } from '../normalization/skills.js';
import { truncate } from '../normalization/text.js';
import type { AiExtraction } from './provider.js';

export interface GroundedAiResult {
    required: { skill: string; evidence: string }[];
    preferred: { skill: string; evidence: string }[];
    minYears: { years: number; evidence: string } | null;
    studentOnly: { evidence: string } | null;
    restrictions: Restriction[];
    /** Items dropped because their quote was not found in the posting or did not support the claim. */
    dropped: number;
}

const MAX_ITEMS = 25;
const squash = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s ]+/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim();

/** A quote is grounded when it is a verbatim (whitespace/case-insensitive) substring of the posting. */
export function isGrounded(quote: string, postingText: string): boolean {
    const q = squash(quote);
    return q.length >= 3 && q.length <= 400 && squash(postingText).includes(q);
}

function skillSupported(skill: string, quote: string): boolean {
    const canonical = canonicalizeSkill(skill);
    if (!canonical || canonical.length > 60) return false;
    if (extractSkills(quote).some((h) => h.skill === canonical)) return true;
    return squash(quote).includes(squash(skill));
}

/**
 * Keep only AI claims that are grounded in the posting text. The model's output is treated as
 * untrusted: unknown fields are ignored (schema), counts are capped, and every claim must quote
 * the posting.
 */
export function groundAiResult(ai: AiExtraction, postingText: string): GroundedAiResult {
    let dropped = 0;
    const skills = (items: AiExtraction['requiredSkills']) => {
        const out: { skill: string; evidence: string }[] = [];
        for (const item of items.slice(0, MAX_ITEMS)) {
            if (isGrounded(item.quote, postingText) && skillSupported(item.skill, item.quote)) {
                out.push({ skill: canonicalizeSkill(item.skill), evidence: truncate(item.quote, 220) });
            } else dropped++;
        }
        dropped += Math.max(0, items.length - MAX_ITEMS);
        return out;
    };
    const required = skills(ai.requiredSkills);
    const preferred = skills(ai.preferredSkills);

    let minYears: GroundedAiResult['minYears'] = null;
    if (ai.minYearsExperience) {
        const { years, quote } = ai.minYearsExperience;
        if (Number.isInteger(years) && years >= 0 && years <= 40 && isGrounded(quote, postingText) && /\d|one|two|three|four|five|six|seven|eight|nine|ten/i.test(quote)) {
            minYears = { years, evidence: truncate(quote, 220) };
        } else dropped++;
    }

    let studentOnly: GroundedAiResult['studentOnly'] = null;
    if (ai.studentOnly) {
        if (isGrounded(ai.studentOnly.quote, postingText) && /student|enrol|enroll/i.test(ai.studentOnly.quote)) {
            studentOnly = { evidence: truncate(ai.studentOnly.quote, 220) };
        } else dropped++;
    }

    const restrictions: Restriction[] = [];
    for (const r of ai.locationRestrictions.slice(0, 10)) {
        if (!isGrounded(r.quote, postingText)) {
            dropped++;
            continue;
        }
        // Places must be resolvable from the quote itself, not from the model's paraphrase.
        const geo = parseGeo(r.quote);
        if (!geo.countries.length && !geo.regions.length) {
            dropped++;
            continue;
        }
        restrictions.push({ kind: r.type, countries: geo.countries, regions: geo.regions, quote: truncate(r.quote, 300), origin: 'ai_quoted_description' });
    }

    return { required, preferred, minYears, studentOnly, restrictions, dropped };
}
