import { describe, expect, it } from 'vitest';

import { assessEligibility, type EligibilityContext } from '../src/eligibility/assess.js';
import { parseGeo } from '../src/eligibility/countries.js';
import { findRestrictions } from '../src/eligibility/restrictions.js';
import type { JobWorkArrangement } from '../src/normalization/classify.js';

const nigeria: EligibilityContext = { baseCountries: ['NG'], authorizationCountries: ['NG'], mode: 'match' };
const nigeriaUndeclared: EligibilityContext = { baseCountries: ['NG'], authorizationCountries: undefined, mode: 'match' };

function assess(arrangement: JobWorkArrangement, location: string, description = '', ctx = nigeria) {
    return assessEligibility(arrangement, parseGeo(location), location, findRestrictions(description), ctx);
}

describe('location parsing', () => {
    it('reads countries, cities, regions and worldwide statements', () => {
        expect(parseGeo('Remote, Nigeria')).toMatchObject({ countries: ['NG'], worldwide: false });
        expect(parseGeo('Lagos')).toMatchObject({ countries: ['NG'] });
        expect(parseGeo('Remote - US')).toMatchObject({ countries: ['US'] });
        expect(parseGeo('Home based - EMEA').regions).toEqual(['EMEA']);
        expect(parseGeo('Home based - Worldwide').worldwide).toBe(true);
        expect(parseGeo('Middle East & North Africa').regions).toEqual(['MENA']);
        expect(parseGeo('South Sudan').countries).toEqual(['SS']);
        expect(parseGeo('Remote MI').countries).toEqual([]);
    });
});

describe('geographic eligibility', () => {
    it('remote worldwide supports access', () => {
        const r = assess('remote', 'Remote - Worldwide');
        expect(r).toMatchObject({ status: 'explicitly_supported', basis: 'worldwide' });
        expect(r.summary).toMatch(/does not confirm legal work authorization/);
    });

    it('remote US-only conflicts with a Nigeria-based applicant', () => {
        const r = assess('remote', 'Remote - US');
        expect(r.status).toBe('explicitly_restricted');
        expect(r.reasons[0]!.code).toBe('REMOTE_COUNTRY_RESTRICTED');
    });

    it('bare "Remote" is unknown, never assumed eligible', () => {
        const r = assess('remote', 'Remote');
        expect(r.status).toBe('unknown');
        expect(r.unresolved).toContain('Which countries remote applicants may work from.');
    });

    it('EMEA includes Nigeria regionally but leaves payroll countries unresolved', () => {
        const r = assess('remote', 'Home based - EMEA');
        expect(r).toMatchObject({ status: 'explicitly_supported', basis: 'region' });
        expect(r.unresolved.join(' ')).toMatch(/hiring or payroll countries/);
    });

    it('Lagos hybrid requires physical attendance', () => {
        const r = assess('hybrid', 'Lagos, Nigeria');
        expect(r.status).toBe('explicitly_supported');
        expect(r.reasons[0]).toMatchObject({ code: 'PHYSICAL_PRESENCE_REQUIRED' });
        expect(r.reasons[0]!.message).toMatch(/requires attendance in Lagos, Nigeria/);
    });

    it('an on-site role in another country is a visible conflict', () => {
        expect(assess('onsite', 'Nairobi, Kenya').status).toBe('explicitly_restricted');
    });

    it('declared work authorization makes another country acceptable, with relocation unresolved', () => {
        const r = assess('onsite', 'Nairobi, Kenya', '', { baseCountries: ['NG'], authorizationCountries: ['NG', 'KE'], mode: 'match' });
        expect(r.status).toBe('explicitly_supported');
        expect(r.unresolved.join(' ')).toMatch(/Relocation to Kenya/);
    });

    it('a description restriction overrides a worldwide location field', () => {
        const r = assess('remote', 'Anywhere', 'We are remote-first. Candidates must be based in the United States.');
        expect(r.status).toBe('explicitly_restricted');
        expect(r.reasons.map((x) => x.code)).toContain('CONFLICTING_STATEMENTS');
        expect(r.reasons.find((x) => x.code === 'TEXT_LOCATION_RESTRICTED')!.evidence).toMatch(/must be based in the United States/);
    });

    it('never infers work authorization from location', () => {
        const r = assess('hybrid', 'Lagos, Nigeria', 'You must be authorized to work in Nigeria.', nigeriaUndeclared);
        expect(r.status).toBe('unknown');
        expect(r.reasons.map((x) => x.code)).toContain('WORK_AUTH_REQUIRED');
        const declared = assess('hybrid', 'Lagos, Nigeria', 'You must be authorized to work in Nigeria.', nigeria);
        expect(declared.status).toBe('explicitly_supported');
    });

    it('records no-sponsorship statements as evidence without inventing restrictions', () => {
        const r = assess('remote', 'Remote - Worldwide', 'We are unable to provide visa sponsorship.');
        expect(r.status).toBe('explicitly_supported');
        expect(r.reasons.map((x) => x.code)).toContain('NO_VISA_SPONSORSHIP');
    });

    it('discover mode assesses against the selected countries', () => {
        const ctx: EligibilityContext = { baseCountries: ['KE', 'GH'], authorizationCountries: undefined, mode: 'discover' };
        expect(assess('remote', 'Remote, Kenya', '', ctx).status).toBe('explicitly_supported');
        expect(assess('remote', 'Remote, Nigeria', '', ctx).status).toBe('explicitly_restricted');
    });
});
