import type { JobWorkArrangement } from '../normalization/classify.js';
import type { EligibilityStatus, Reason } from '../schemas/opportunity.js';
import { countryName, type ParsedGeo, regionIncludes, type Region } from './countries.js';
import type { Restriction } from './restrictions.js';

/**
 * Who the eligibility is assessed for.
 * - `baseCountries`: where the applicant is (match mode: candidate country; discover mode: the
 *   countries the user searched for).
 * - `authorizationCountries`: countries the candidate *declared* work authorization for. Never
 *   inferred from nationality, timezone or location. Undefined means "not declared".
 */
export interface EligibilityContext {
    baseCountries: string[];
    authorizationCountries: string[] | undefined;
    mode: 'discover' | 'match';
}

export interface EligibilityResult {
    status: EligibilityStatus;
    basis: 'worldwide' | 'country' | 'region' | 'none';
    assessedFor: string[];
    summary: string;
    reasons: Reason[];
    unresolved: string[];
}

const names = (codes: string[]) => codes.map(countryName).join(', ');

export function assessEligibility(
    arrangement: JobWorkArrangement,
    geo: ParsedGeo,
    locationText: string,
    restrictions: Restriction[],
    ctx: EligibilityContext,
): EligibilityResult {
    const reasons: Reason[] = [];
    const unresolved: string[] = [];
    const base = new Set(ctx.baseCountries);
    const declaredAuth = new Set(ctx.authorizationCountries ?? []);
    // Countries where presence is acceptable for this applicant: where they are, plus declared authorization.
    const acceptable = new Set([...base, ...declaredAuth]);
    const who = ctx.mode === 'match' ? 'your declared location' : 'the selected countries';

    let supported = false;
    let restricted = false;
    let basis: EligibilityResult['basis'] = 'none';

    const regionHit = (regions: Region[]) => regions.find((r) => [...acceptable].some((c) => regionIncludes(r, c)));

    // 1. Structured location / arrangement.
    if (arrangement === 'remote') {
        if (geo.countries.length) {
            const hit = geo.countries.filter((c) => acceptable.has(c));
            if (hit.length) {
                supported = true;
                basis = 'country';
                reasons.push({ code: 'REMOTE_COUNTRY_LISTED', message: `Remote role lists ${names(hit)}.`, evidence: locationText });
            } else if (!geo.worldwide && !regionHit(geo.regions)) {
                restricted = true;
                basis = 'country';
                reasons.push({
                    code: 'REMOTE_COUNTRY_RESTRICTED',
                    message: `Remote role is listed for ${names(geo.countries)}, which does not include ${who}.`,
                    evidence: locationText,
                });
            }
        }
        if (!supported && !restricted && geo.worldwide) {
            supported = true;
            basis = 'worldwide';
            reasons.push({ code: 'REMOTE_WORLDWIDE', message: 'Location is stated as worldwide / anywhere.', evidence: locationText });
        }
        if (!supported && !restricted && geo.regions.length) {
            const r = regionHit(geo.regions);
            if (r) {
                supported = true;
                basis = 'region';
                reasons.push({ code: 'REMOTE_REGION_INCLUDES', message: `Remote region "${r}" includes ${who}.`, evidence: locationText });
                unresolved.push(`The posting names the region ${r} but not the specific hiring or payroll countries.`);
            } else {
                restricted = true;
                basis = 'region';
                reasons.push({
                    code: 'REMOTE_REGION_EXCLUDES',
                    message: `Remote region (${geo.regions.join(', ')}) does not include ${who}.`,
                    evidence: locationText,
                });
            }
        }
        if (!supported && !restricted) {
            reasons.push({ code: 'REMOTE_SCOPE_UNSPECIFIED', message: 'Remote, but the posting does not say which countries are eligible.', evidence: locationText || null });
            unresolved.push('Which countries remote applicants may work from.');
        }
    } else if (geo.countries.length) {
        const hit = geo.countries.filter((c) => acceptable.has(c));
        const presence = arrangement === 'unspecified' ? 'is listed in' : 'requires attendance in';
        if (hit.length) {
            supported = true;
            basis = 'country';
            reasons.push({
                code: arrangement === 'unspecified' ? 'LOCATION_LISTED' : 'PHYSICAL_PRESENCE_REQUIRED',
                message: `Role ${presence} ${locationText || names(hit)}${arrangement === 'unspecified' ? '; remote work is not stated' : ''}.`,
                evidence: locationText,
            });
            const outsideBase = hit.filter((c) => !base.has(c));
            if (outsideBase.length) unresolved.push(`Relocation to ${names(outsideBase)} would be needed.`);
        } else {
            restricted = true;
            basis = 'country';
            reasons.push({
                code: 'PRESENCE_REQUIRED_ELSEWHERE',
                message: `Role ${presence} ${names(geo.countries)}, outside ${who}${ctx.mode === 'match' ? ' and your declared work-authorization countries' : ''}.`,
                evidence: locationText,
            });
        }
    } else if (geo.regions.length) {
        const r = regionHit(geo.regions);
        if (r) {
            basis = 'region';
            reasons.push({ code: 'REGION_LISTED', message: `Region "${r}" is listed, but no specific office country.`, evidence: locationText });
            unresolved.push('Which office or country the role is based in.');
        } else {
            restricted = true;
            basis = 'region';
            reasons.push({ code: 'REGION_EXCLUDES', message: `Listed region (${geo.regions.join(', ')}) does not include ${who}.`, evidence: locationText });
        }
    } else {
        reasons.push({ code: 'LOCATION_UNKNOWN', message: 'The posting does not state a usable location.', evidence: locationText || null });
        unresolved.push('Where the role is based.');
    }

    // 2. Explicit statements in the description. Restrictions always win over support.
    let needsAuthConfirmation = false;
    for (const r of restrictions) {
        if (r.kind === 'location_required') {
            const hit = r.countries.some((c) => acceptable.has(c)) || !!regionHit(r.regions);
            if (hit) {
                reasons.push({ code: 'TEXT_LOCATION_INCLUDES', message: 'The description names a required location that includes you.', evidence: r.quote });
            } else {
                if (supported) {
                    reasons.push({
                        code: 'CONFLICTING_STATEMENTS',
                        message: 'The location field suggests you are eligible, but the description restricts where applicants must be based. The restriction is used.',
                        evidence: r.quote,
                    });
                }
                restricted = true;
                reasons.push({ code: 'TEXT_LOCATION_RESTRICTED', message: `The description requires being based in ${describe(r)}.`, evidence: r.quote });
            }
        } else if (r.kind === 'work_authorization_required') {
            const declared = r.countries.some((c) => declaredAuth.has(c));
            if (declared) {
                reasons.push({ code: 'WORK_AUTH_DECLARED', message: `Requires work authorization for ${describe(r)}, which you declared.`, evidence: r.quote });
            } else {
                needsAuthConfirmation = true;
                reasons.push({
                    code: 'WORK_AUTH_REQUIRED',
                    message: `Requires authorization to work in ${describe(r)}; this is not declared${ctx.mode === 'discover' ? ' (discover mode has no profile)' : ' in your profile'}.`,
                    evidence: r.quote,
                });
                unresolved.push(`Authorization to work in ${describe(r)}.`);
            }
        } else if (r.kind === 'no_sponsorship') {
            reasons.push({ code: 'NO_VISA_SPONSORSHIP', message: 'The employer states it does not sponsor visas.', evidence: r.quote });
        } else if (r.kind === 'worldwide_open' && !restricted && !supported) {
            supported = true;
            basis = 'worldwide';
            reasons.push({ code: 'TEXT_WORLDWIDE', message: 'The description says the team hires from anywhere.', evidence: r.quote });
        }
    }

    const status: EligibilityStatus = restricted ? 'explicitly_restricted' : supported && !needsAuthConfirmation ? 'explicitly_supported' : 'unknown';
    const summary =
        status === 'explicitly_restricted'
            ? 'Explicit location or eligibility restriction conflicts with the assessed location.'
            : status === 'explicitly_supported'
              ? `Location evidence includes ${ctx.mode === 'match' ? 'your declared location' : 'the selected countries'}. This does not confirm legal work authorization or that the employer will hire there.`
              : 'Geographic eligibility could not be confirmed from the posting.';
    return { status, basis, assessedFor: [...acceptable], summary, reasons, unresolved: [...new Set(unresolved)] };
}

function describe(r: Restriction): string {
    const parts = [...r.countries.map(countryName), ...r.regions];
    return parts.length ? parts.join(', ') : 'a specific location';
}
