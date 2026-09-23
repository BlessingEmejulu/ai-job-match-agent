/**
 * LIVE smoke tests: call the real public Greenhouse and Lever APIs for every verified board.
 * Run with `npm run test:live`. Not part of ordinary CI because results depend on live postings.
 */
import { describe, expect, it } from 'vitest';

import { analyzeListing } from '../../src/pipeline/analyze.js';
import { fetchSources } from '../../src/pipeline/sources.js';
import { BudgetedHttpClient } from '../../src/sources/http.js';
import { REGISTRY } from '../../src/sources/registry.js';
import { opportunitySchema } from '../../src/schemas/opportunity.js';
import { toOpportunity, assessJob } from '../../src/pipeline/analyze.js';

describe('live sources', () => {
    it('every verified board responds with parseable listings', async () => {
        const http = new BudgetedHttpClient({ maxRequests: 40, deadline: Date.now() + 55_000 });
        const results = await fetchSources(REGISTRY, http, () => new Date());
        for (const r of results) {
            expect(r.error, `${r.entry.id}: ${r.error}`).toBeNull();
            expect(r.listings.length, r.entry.id).toBeGreaterThan(0);
        }
        // Every live listing that analyses must produce a schema-valid record.
        const now = new Date();
        let checked = 0;
        for (const r of results) {
            for (const raw of r.listings.slice(0, 25)) {
                const a = analyzeListing(raw, now);
                if (!a.ok) continue;
                const elig = assessJob(a.job, { baseCountries: ['NG'], authorizationCountries: undefined, mode: 'discover' });
                const rec = toOpportunity(a.job, elig, null, now.toISOString(), now);
                const parsed = opportunitySchema.safeParse(rec);
                expect(parsed.success, `${raw.sourceId}/${raw.sourceJobId}: ${parsed.success ? '' : parsed.error.message}`).toBe(true);
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(50);
    });
});
