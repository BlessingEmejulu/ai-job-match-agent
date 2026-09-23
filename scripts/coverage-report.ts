/**
 * Live coverage measurement for every verified board. Not part of the Actor or CI.
 * Usage: npx tsx scripts/coverage-report.ts > docs/coverage-snapshot.json
 */
import { parseGeo } from '../src/eligibility/countries.js';
import { analyzeListing } from '../src/pipeline/analyze.js';
import { fetchSources } from '../src/pipeline/sources.js';
import { BudgetedHttpClient } from '../src/sources/http.js';
import { REGISTRY } from '../src/sources/registry.js';

const AFRICA = new Set(['DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CV', 'CM', 'CF', 'TD', 'KM', 'CG', 'CD', 'CI', 'DJ', 'EG', 'GQ', 'ER', 'SZ', 'ET', 'GA', 'GM', 'GH', 'GN', 'GW', 'KE', 'LS', 'LR', 'LY', 'MG', 'MW', 'ML', 'MR', 'MU', 'MA', 'MZ', 'NA', 'NE', 'NG', 'RW', 'ST', 'SN', 'SC', 'SL', 'SO', 'ZA', 'SS', 'SD', 'TZ', 'TG', 'TN', 'UG', 'ZM', 'ZW']);

const now = new Date();
const http = new BudgetedHttpClient({ maxRequests: 100, deadline: Date.now() + 300_000 });
const results = await fetchSources(REGISTRY, http, () => new Date(), 2);

const report = results.map((r) => {
    const countries: Record<string, number> = {};
    const stats = { listings: r.listings.length, africaCountryListings: 0, worldwide: 0, remote: 0, earlyCareer: 0, withDeadline: 0, withSalary: 0, withPostedDate: 0, withRequiredSkills: 0 };
    for (const raw of r.listings) {
        const geo = parseGeo(raw.locationTexts.join('; '));
        for (const c of geo.countries) countries[c] = (countries[c] ?? 0) + 1;
        if (geo.countries.some((c) => AFRICA.has(c)) || geo.regions.includes('Africa')) stats.africaCountryListings++;
        if (geo.worldwide) stats.worldwide++;
        if (raw.salary) stats.withSalary++;
        if (raw.postedAt) stats.withPostedDate++;
        const a = analyzeListing(raw, now);
        if (!a.ok) continue;
        if (a.job.arrangement.value === 'remote') stats.remote++;
        if (['internship', 'graduate', 'entry', 'junior'].includes(a.job.seniority.value) || a.job.employment.value === 'internship') stats.earlyCareer++;
        if (a.job.deadline.deadline) stats.withDeadline++;
        if (a.job.requirements.required.length) stats.withRequiredSkills++;
    }
    const topCountries = Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 12);
    return { id: r.entry.id, error: r.error, requests: r.requestsUsed, ...stats, topCountries };
});

console.log(JSON.stringify({ measuredAt: now.toISOString(), requestsUsed: http.requestsUsed, boards: report }, null, 2));
