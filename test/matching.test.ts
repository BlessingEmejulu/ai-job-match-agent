import { describe, expect, it } from 'vitest';

import { type MatchJobFacts, MIN_EVIDENCE_COVERAGE, scoreMatch, WEIGHTS } from '../src/matching/score.js';
import type { CandidateProfile } from '../src/schemas/input.js';

const profile: CandidateProfile = {
    skills: ['JavaScript', 'reactjs', 'SQL'],
    yearsExperience: 1,
    desiredRoles: ['frontend engineer'],
    country: 'NG',
    studentStatus: 'graduated',
    educationLevel: 'bachelor',
};

const job = (over: Partial<MatchJobFacts> = {}): MatchJobFacts => ({
    title: 'Frontend Engineer',
    department: 'Engineering',
    requiredSkills: ['JavaScript', 'React', 'TypeScript'],
    requiredAlternatives: [],
    preferredSkills: ['React Native'],
    minYears: 1,
    experienceEvidence: '1+ years',
    seniority: 'junior',
    seniorityFromTitle: false,
    employmentType: 'full_time',
    workArrangement: 'remote',
    studentRequired: false,
    studentEvidence: null,
    educationLevel: null,
    educationRequirement: 'not_stated',
    sectionsAmbiguous: false,
    ...over,
});
const prefs = { employmentTypes: ['full_time' as const], workArrangements: ['remote' as const] };

describe('matching', () => {
    it('weights sum to 100', () => {
        expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    });

    it('scores evidence-supported dimensions and reports gaps as "not evidenced"', () => {
        const m = scoreMatch(job(), profile, prefs);
        expect(m.status).toBe('scored');
        expect(m.evidenceCoverage).toBe(1);
        expect(m.matchedSkills).toEqual(['JavaScript', 'React']);
        expect(m.requiredSkillsNotEvidenced).toEqual(['TypeScript']);
        expect(m.preferredSkillsNotEvidenced).toEqual(['React Native']);
        // (45*2/3 + 10*0 + 20*1 + 15*1 + 10*1) / 100
        expect(m.score).toBe(75);
    });

    it('keeps React Native distinct from React', () => {
        const m = scoreMatch(job({ requiredSkills: ['React Native'], preferredSkills: [] }), profile, prefs);
        expect(m.requiredSkillsNotEvidenced).toEqual(['React Native']);
    });

    it('returns insufficient evidence for sparse postings', () => {
        const m = scoreMatch(job({ requiredSkills: [], preferredSkills: [], minYears: null, seniority: 'unknown' }), profile, prefs);
        expect(m.evidenceCoverage).toBeLessThan(MIN_EVIDENCE_COVERAGE);
        expect(m.status).toBe('insufficient_evidence');
        expect(m.score).toBeNull();
    });

    it('treats "any one of" groups as a single required item', () => {
        const m = scoreMatch(job({ requiredSkills: [], requiredAlternatives: [['Python', 'JavaScript', 'Go']] }), profile, prefs);
        expect(m.scoreBreakdown.find((b) => b.dimension === 'required_skills')!.value).toBe(1);
        const miss = scoreMatch(job({ requiredSkills: [], requiredAlternatives: [['Python', 'Go']] }), profile, prefs);
        expect(miss.requiredSkillsNotEvidenced).toEqual(['one of: Python / Go']);
    });

    it('gives no experience credit for a gap of three years or more', () => {
        const m = scoreMatch(job({ minYears: 5 }), profile, prefs);
        expect(m.experienceAssessment.status).toBe('below');
        expect(m.scoreBreakdown.find((b) => b.dimension === 'experience')!.value).toBe(0);
    });

    it('checks student-only and education requirements against declared facts', () => {
        const m = scoreMatch(job({ studentRequired: true, educationLevel: 'master', educationRequirement: 'required' }), profile, prefs);
        expect(m.requirementChecks).toEqual([
            expect.objectContaining({ requirement: 'Current student status', status: 'not_met' }),
            expect.objectContaining({ requirement: 'Education: master', status: 'not_met' }),
        ]);
        const unknown = scoreMatch(job({ studentRequired: true }), { ...profile, studentStatus: undefined }, prefs);
        expect(unknown.requirementChecks[0]!.status).toBe('unknown');
    });

    it('is reproducible', () => {
        expect(scoreMatch(job(), profile, prefs)).toEqual(scoreMatch(job(), profile, prefs));
    });
});
