import { describe, expect, it } from 'vitest';

import examplesDiscover from '../examples/discover-input.json' with { type: 'json' };
import examplesMatch from '../examples/match-input.json' with { type: 'json' };
import { InputValidationError, parseInput } from '../src/schemas/input.js';

const profile = { skills: ['React'], yearsExperience: 1, desiredRoles: ['frontend engineer'], country: 'NG' };

describe('input validation', () => {
    it('applies documented defaults', () => {
        const input = parseInput({ countries: ['ng'] });
        expect(input).toMatchObject({ mode: 'discover', countries: ['NG'], maxResults: 20, maxRequests: 60, maxRuntimeSeconds: 180 });
        expect(input.ai).toEqual({ enabled: false, maxAnalyses: 10 });
    });

    it('accepts both example inputs', () => {
        expect(() => parseInput(examplesDiscover)).not.toThrow();
        expect(() => parseInput(examplesMatch)).not.toThrow();
    });

    it('requires a candidate profile in match mode', () => {
        expect(() => parseInput({ mode: 'match', countries: ['NG'] })).toThrow(/candidateProfile is required/);
        expect(() => parseInput({ mode: 'match', countries: ['NG'], candidateProfile: profile })).not.toThrow();
    });

    it.each([
        [{ countries: [] }, /countries/],
        [{ countries: ['Nigeria'] }, /ISO 3166/],
        [{ countries: ['NG'], maxResults: 101 }, /maxResults/],
        [{ countries: ['NG'], maxRequests: 10_000 }, /maxRequests/],
        [{ countries: ['NG'], maxRuntimeSeconds: 5 }, /maxRuntimeSeconds/],
        [{ countries: ['NG'], ai: { enabled: true, maxAnalyses: 500 } }, /ai.maxAnalyses/],
        [{ countries: ['NG'], employmentTypes: ['gig'] }, /employmentTypes/],
        [{ countries: ['NG'], unexpected: true }, /unrecognized|Unrecognized/],
    ])('rejects invalid or excessive input %#', (raw, pattern) => {
        expect(() => parseInput(raw)).toThrow(pattern);
    });

    it('rejects identifying fields that are not part of the profile contract', () => {
        expect(() =>
            parseInput({ mode: 'match', countries: ['NG'], candidateProfile: { ...profile, email: 'someone@example.com' } }),
        ).toThrow(InputValidationError);
    });
});
