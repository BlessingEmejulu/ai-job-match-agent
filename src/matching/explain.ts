import { truncate } from '../normalization/text.js';
import type { Opportunity } from '../schemas/opportunity.js';
import type { ScoredMatch } from './score.js';

const list = (items: string[], max = 5) =>
    items.length <= max ? items.join(', ') : `${items.slice(0, max).join(', ')} and ${items.length - max} more`;

/**
 * Deterministic, evidence-backed explanation. Every clause is derived from validated fields of the
 * record; nothing here is generated free-form. The score is described as relevance, not as a
 * hiring probability.
 */
export function explainMatch(job: Opportunity, m: ScoredMatch): { explanation: string; suggestedNextSteps: string[] } {
    const parts: string[] = [];
    const geo = job.geographicEligibility;

    if (geo.status === 'explicitly_restricted') {
        const r = job.eligibilityReasons.find((x) => /RESTRICT|ELSEWHERE|EXCLUDES/.test(x.code));
        parts.push(`Location conflict: ${r?.message ?? geo.summary} A strong skills overlap does not remove this restriction.`);
    }

    if (m.status === 'scored' && m.score !== null) {
        parts.push(`Relevance ${m.score}/100, based on ${Math.round(m.evidenceCoverage * 100)}% of the weighted criteria the posting provides evidence for (not a hiring probability).`);
    } else {
        parts.push(`Not scored: the posting gives evidence for only ${Math.round(m.evidenceCoverage * 100)}% of the weighted criteria, which is too little for a reliable score.`);
    }

    const requiredItems = job.requiredSkills.length + job.requiredSkillAlternatives.length;
    if (requiredItems) {
        const matchedReq = job.requiredSkills.filter((s) => m.matchedSkills.includes(s));
        const groupMatches = job.requiredSkillAlternatives.map((g) => g.find((s) => m.matchedSkills.includes(s))).filter((s): s is string => !!s);
        const met = matchedReq.length + groupMatches.length;
        const shown = [...matchedReq, ...groupMatches.map((s) => `${s} (one-of group)`)];
        parts.push(
            `Your profile shows ${met} of ${requiredItems} required skill items${shown.length ? ` (${list(shown)})` : ''}.` +
                (m.requiredSkillsNotEvidenced.length ? ` Not evidenced in your profile: ${list(m.requiredSkillsNotEvidenced)}.` : ''),
        );
    }
    if (m.preferredSkillsNotEvidenced.length) {
        parts.push(`Preferred but not evidenced: ${list(m.preferredSkillsNotEvidenced, 4)}.`);
    }
    if (m.experienceAssessment.status !== 'unknown') {
        const quote = job.experience.evidence ? ` ("${truncate(job.experience.evidence, 120)}")` : '';
        parts.push(`${m.experienceAssessment.note}${quote}`);
    }
    if (geo.status === 'explicitly_supported') {
        parts.push(`Location: ${job.eligibilityReasons[0]?.message ?? geo.summary} This does not confirm work authorization.`);
    } else if (geo.status === 'unknown') {
        parts.push(`Location eligibility is unknown: ${job.eligibilityReasons[0]?.message ?? geo.summary}`);
    }
    for (const c of m.requirementChecks.filter((x) => x.status !== 'met')) parts.push(`${c.requirement}: ${c.note}`);

    return { explanation: truncate(parts.join(' '), 1200), suggestedNextSteps: nextSteps(job, m) };
}

function nextSteps(job: Opportunity, m: ScoredMatch): string[] {
    const steps: string[] = [];
    const geo = job.geographicEligibility;
    if (geo.status === 'explicitly_restricted') {
        steps.push('Before investing time, confirm with the employer whether applicants in your location can be hired for this role.');
    }
    const student = m.requirementChecks.find((c) => c.requirement === 'Current student status' && c.status !== 'met');
    if (student) {
        steps.push(
            student.status === 'not_met'
                ? 'This posting targets current students; look for the graduate or entry-level equivalent instead.'
                : 'Check the student-status requirement and add your enrollment status to your profile if it applies.',
        );
    }
    if (m.requiredSkillsNotEvidenced.length) {
        const s = m.requiredSkillsNotEvidenced.slice(0, 2).join(' and ');
        steps.push(`If you have used ${s}, add a concrete project or work example to your CV; otherwise review the fundamentals before applying.`);
    }
    if (geo.status === 'unknown' && job.unresolvedRequirements.length) {
        steps.push(`Ask the recruiter to confirm: ${job.unresolvedRequirements[0]}`);
    }
    if (m.experienceAssessment.status === 'below') {
        steps.push('Lead your application with projects that show equivalent hands-on experience.');
    }
    if (job.deadlineStatus === 'closing_soon' && job.deadline) steps.push(`Apply before the stated deadline (${job.deadline}).`);
    if (!steps.length) steps.push('Tailor your CV to the responsibilities in the posting and apply on the employer’s page.');
    return steps.slice(0, 2);
}
