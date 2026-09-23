import type { Region } from '../eligibility/countries.js';

export type SourceFamily = 'greenhouse' | 'lever';

export interface RegistryEntry {
    /** Stable id used in input `sourceIds` and in output provenance. */
    id: string;
    family: SourceFamily;
    employer: string;
    /** Board token (Greenhouse) or site name (Lever) as used by the public API. */
    boardId: string;
    officialCareersUrl: string;
    verifiedAt: string;
    verificationMethod: string;
    /** Countries/regions measured on the board (scripts/coverage-report.ts, 2026-09-23). Used only to rank sources. */
    observedCountries: string[];
    observedRegions: Region[];
    hasWorldwideRoles: boolean;
    /** Listings with a worldwide/anywhere location in the 2026-09-23 measurement. */
    measuredWorldwideListings: number;
    notes: string;
}

/**
 * Verified employer boards. Every identifier was checked on 2026-09-23 against the employer's own
 * careers page (link or matching job IDs) or, for Zipline, against the API's `absolute_url`
 * pointing at the employer's own domain. Do not add entries without the same verification.
 */
export const REGISTRY: RegistryEntry[] = [
    {
        id: 'greenhouse:moniepoint',
        family: 'greenhouse',
        employer: 'Moniepoint',
        boardId: 'moniepoint',
        officialCareersUrl: 'https://moniepoint.com/careers',
        verifiedAt: '2026-09-23',
        verificationMethod: 'Job IDs listed on moniepoint.com/careers (e.g. /careers/roles/4941669101) match Greenhouse API job IDs.',
        observedCountries: ['NG', 'KE', 'ZA', 'ES', 'PL', 'PT', 'IN', 'GB'],
        observedRegions: ['Africa', 'Europe'],
        hasWorldwideRoles: false,
        measuredWorldwideListings: 0,
        notes: 'Nigerian fintech. Many Nigeria state-level field roles plus remote country-specific tech roles.',
    },
    {
        id: 'greenhouse:jumia',
        family: 'greenhouse',
        employer: 'Jumia',
        boardId: 'jumia',
        officialCareersUrl: 'https://group.jumia.com/careers',
        verifiedAt: '2026-09-23',
        verificationMethod: 'group.jumia.com/careers links to job-boards.eu.greenhouse.io/jumia/jobs/<id>; IDs match the API.',
        observedCountries: ['GH', 'NG', 'SN', 'KE', 'EG', 'UG', 'CI', 'PT'],
        observedRegions: ['Africa'],
        hasWorldwideRoles: false,
        measuredWorldwideListings: 0,
        notes: 'Pan-African e-commerce. Board hosted on the Greenhouse EU instance; served by the same public API host.',
    },
    {
        id: 'greenhouse:alxafrica',
        family: 'greenhouse',
        employer: 'ALX Africa',
        boardId: 'alxafrica',
        officialCareersUrl: 'https://careers.alxafrica.com/',
        verifiedAt: '2026-09-23',
        verificationMethod: 'careers.alxafrica.com links to job-boards.greenhouse.io/alxafrica/jobs/<id>; IDs match the API.',
        observedCountries: ['ZA', 'RW', 'NG'],
        observedRegions: ['Africa'],
        hasWorldwideRoles: false,
        measuredWorldwideListings: 0,
        notes: 'Tech skills and careers organisation. Small board; several roles say only "Remote".',
    },
    {
        id: 'greenhouse:flyzipline',
        family: 'greenhouse',
        employer: 'Zipline',
        boardId: 'flyzipline',
        officialCareersUrl: 'https://www.zipline.com/careers',
        verifiedAt: '2026-09-23',
        verificationMethod: 'Every API job absolute_url points to www.zipline.com/open-roles/<id>, the employer domain.',
        observedCountries: ['US', 'CI', 'RW', 'NG', 'GB'],
        observedRegions: ['Africa'],
        hasWorldwideRoles: true,
        measuredWorldwideListings: 1,
        notes: 'Drone logistics. Large board, mostly US; a minority of African field/ops roles and some "Remote in Africa".',
    },
    {
        id: 'greenhouse:canonical',
        family: 'greenhouse',
        employer: 'Canonical',
        boardId: 'canonical',
        officialCareersUrl: 'https://canonical.com/careers',
        verifiedAt: '2026-09-23',
        verificationMethod: 'canonical.com/careers references greenhouse.io/canonical.',
        observedCountries: ['TW', 'GB', 'CN'],
        observedRegions: ['EMEA', 'Americas', 'APAC'],
        hasWorldwideRoles: true,
        measuredWorldwideListings: 96,
        notes: 'Ubuntu publisher. Many "Home based - Worldwide/EMEA" roles; includes graduate roles.',
    },
    {
        id: 'greenhouse:gitlab',
        family: 'greenhouse',
        employer: 'GitLab',
        boardId: 'gitlab',
        officialCareersUrl: 'https://about.gitlab.com/jobs/all-jobs/',
        verifiedAt: '2026-09-23',
        verificationMethod: 'about.gitlab.com/jobs/all-jobs links to job-boards.greenhouse.io/gitlab/jobs/<id>.',
        observedCountries: ['US', 'CA', 'GB', 'IN', 'PL', 'DE', 'IL', 'IE'],
        observedRegions: ['EMEA'],
        hasWorldwideRoles: false,
        measuredWorldwideListings: 0,
        notes: 'All-remote company but most roles are country-restricted; useful for testing restriction handling.',
    },
    {
        id: 'lever:dlocal',
        family: 'lever',
        employer: 'dLocal',
        boardId: 'dlocal',
        officialCareersUrl: 'https://www.dlocal.com/careers/',
        verifiedAt: '2026-09-23',
        verificationMethod: 'dlocal.com/careers links to jobs.lever.co/dlocal/<id>; IDs match the API.',
        observedCountries: ['UY', 'BR', 'AR', 'ES', 'ZA', 'NG', 'KE', 'SN', 'EG', 'MA'],
        observedRegions: ['Africa'],
        hasWorldwideRoles: false,
        measuredWorldwideListings: 0,
        notes: 'Emerging-markets payments. Offices in Lagos, Nairobi, Cape Town, Dakar, Cairo.',
    },
    {
        id: 'lever:binance',
        family: 'lever',
        employer: 'Binance',
        boardId: 'binance',
        officialCareersUrl: 'https://www.binance.com/en/careers/job-openings',
        verifiedAt: '2026-09-23',
        verificationMethod: 'Job IDs on binance.com/en/careers/job?id=<uuid> match Lever API posting IDs.',
        observedCountries: ['HK', 'TW', 'AU', 'AE', 'ZA'],
        observedRegions: ['MENA', 'APAC', 'Europe'],
        hasWorldwideRoles: true,
        measuredWorldwideListings: 7,
        notes: 'Large board with an "Accelerator Program" early-career track, some student-only.',
    },
];

export function getRegistryEntry(id: string): RegistryEntry | undefined {
    return REGISTRY.find((e) => e.id === id);
}
