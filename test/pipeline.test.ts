import { describe, expect, it } from 'vitest';

import type { AiProvider } from '../src/ai/provider.js';
import { type DeliveryPort, DeliveryQueue } from '../src/billing/delivery.js';
import { runPipeline } from '../src/pipeline/run.js';
import { parseInput } from '../src/schemas/input.js';
import { type Opportunity, opportunitySchema } from '../src/schemas/opportunity.js';
import { fakeFetch, ghBoard, leverPosting, NOW } from './fixtures/builders.js';

// LABELED FIXTURE BOARDS (synthetic). Served for greenhouse:jumia and lever:dlocal only.
const GH_JOBS = [
    {
        id: 101,
        title: 'Junior Data Analyst',
        location: 'Lagos, Nigeria',
        employmentType: 'Full-time',
        content: '<h3>Requirements</h3><ul><li>1+ years with SQL and Excel</li><li>Power BI</li></ul><h3>Nice to have</h3><ul><li>Python</li></ul>',
    },
    {
        id: 102,
        title: 'Data Analyst (Remote US)',
        location: 'Remote - US',
        employmentType: 'Full-time',
        content: '<h3>Requirements</h3><ul><li>SQL, Excel, Power BI, Python</li></ul>',
    },
    {
        id: 103,
        title: 'Data Analyst Intern',
        location: 'Remote',
        employmentType: 'Internship',
        content: '<h3>Requirements</h3><ul><li>Must be currently enrolled in a degree program</li><li>SQL</li></ul>',
    },
    {
        id: 104,
        title: 'Data Analyst (expired)',
        location: 'Lagos, Nigeria',
        employmentType: 'Full-time',
        deadline: '2026-09-01T00:00:00Z',
        content: '<h3>Requirements</h3><ul><li>SQL</li></ul>',
    },
    {
        id: 105,
        title: 'Business Analyst',
        location: 'Nairobi, Kenya',
        employmentType: 'Full-time',
        content: '<h3>Requirements</h3><ul><li>SQL</li></ul>',
    },
    {
        id: 106,
        title: 'Analytics Engineer',
        location: 'Remote - Worldwide',
        employmentType: 'Full-time',
        url: 'https://jobs.lever.co/fixtureco/dup-1',
        content: '<h3>Requirements</h3><ul><li>SQL and dbt</li></ul><p>Candidates must be based in the United States.</p>',
    },
    { id: 107, title: 'Office Manager', location: 'Lagos, Nigeria', employmentType: 'Full-time' },
];
const LEVER_POSTINGS = [
    leverPosting({ id: 'dup-1', text: 'Analytics Engineer', location: 'Anywhere', workplaceType: 'remote', lists: [{ text: 'Requirements', content: '<li>SQL</li>' }] }),
    leverPosting({ id: 'lv-2', text: 'Graduate Data Analyst', location: 'Lagos', workplaceType: 'hybrid', lists: [{ text: 'What you need', content: '<li>Excel and SQL</li>' }] }),
];

function routes(overrides: { gh?: number; lever?: number } = {}) {
    return fakeFetch((url) => {
        if (url.includes('boards-api.greenhouse.io/v1/boards/jumia/')) return overrides.gh ? { status: overrides.gh } : { status: 200, body: ghBoard(GH_JOBS) };
        if (url.includes('api.lever.co/v0/postings/dlocal')) return overrides.lever ? { status: overrides.lever } : { status: 200, body: LEVER_POSTINGS };
        return { status: 404 };
    });
}

function port(budgetEvents?: number) {
    let charged = 0;
    const records: Opportunity[] = [];
    const p: DeliveryPort & { records: Opportunity[] } = {
        records,
        isPayPerEvent: () => budgetEvents !== undefined,
        maxChargeableEvents: () => (budgetEvents === undefined ? Infinity : budgetEvents - charged),
        pushData: async (r) => {
            records.push(r as unknown as Opportunity);
            if (budgetEvents === undefined) return { eventChargeLimitReached: false, chargedCount: 0, chargeableWithinLimit: {} };
            charged++;
            return { eventChargeLimitReached: budgetEvents - charged < 1, chargedCount: 1, chargeableWithinLimit: {} };
        },
        saveDeliveredIds: async () => {},
    };
    return p;
}

const baseInput = {
    countries: ['NG'],
    sourceIds: ['greenhouse:jumia', 'lever:dlocal'],
    roleKeywords: ['analyst', 'analytics'],
    maxRuntimeSeconds: 60,
};
const matchInput = {
    ...baseInput,
    mode: 'match',
    countries: ['NG', 'KE'],
    candidateProfile: { skills: ['SQL', 'Excel', 'Power BI'], yearsExperience: 1, desiredRoles: ['data analyst'], country: 'NG', studentStatus: 'graduated', workAuthorizationCountries: ['NG'] },
};

async function run(raw: Record<string, unknown>, opts: { fetch?: ReturnType<typeof fakeFetch>; budget?: number; ai?: AiProvider } = {}) {
    const p = port(opts.budget);
    const delivery = new DeliveryQueue(p);
    const logs: string[] = [];
    const summary = await runPipeline(parseInput(raw), {
        now: () => NOW,
        fetchImpl: opts.fetch ?? routes(),
        aiProvider: opts.ai ?? null,
        aiDisabledReason: null,
        delivery,
        log: { info: (m) => logs.push(m), warning: (m) => logs.push(`WARN ${m}`) },
    });
    return { summary, records: p.records, logs };
}

describe('pipeline (fixtures)', () => {
    it('discovers, decides, analyses and delivers valid records in discover mode', async () => {
        const { summary, records } = await run(baseInput);
        for (const r of records) expect(opportunitySchema.safeParse(r).success).toBe(true);
        const titles = records.map((r) => r.title);
        expect(titles).toContain('Junior Data Analyst');
        expect(titles).not.toContain('Data Analyst (expired)');
        expect(titles).not.toContain('Office Manager');
        expect(titles).not.toContain('Data Analyst (Remote US)'); // outside selected countries
        expect(summary.counts.expiredExcluded).toBe(1);
        expect(summary.counts.excludedByReason.LOCATION_OUTSIDE_SELECTED_COUNTRIES).toBeGreaterThanOrEqual(1);
        expect(summary.outcome).toBe('results_delivered');
        expect(records.every((r) => r.match === null)).toBe(true);
    });

    it('removes cross-source duplicates before delivery and keeps the reference', async () => {
        const { summary, records } = await run({ ...baseInput, countries: ['US'] });
        expect(summary.counts.duplicatesRemoved).toBe(1);
        expect(summary.counts.excludedByReason.DUPLICATE_APPLICATION_URL).toBe(1);
        const analytics = records.filter((r) => r.title === 'Analytics Engineer');
        expect(analytics).toHaveLength(1);
        expect(analytics[0]!.duplicateSourceReferences).toEqual([expect.objectContaining({ sourceId: 'lever:dlocal', sourceJobId: 'dup-1' })]);
    });

    it('in match mode keeps explicit conflicts visible and ranks them last', async () => {
        const { records } = await run(matchInput);
        const kenya = records.find((r) => r.title === 'Business Analyst')!;
        expect(kenya.geographicEligibility.status).toBe('explicitly_restricted');
        expect(kenya.match!.explanation).toMatch(/Location conflict/);
        expect(records.at(-1)!.geographicEligibility.status).toBe('explicitly_restricted');
        const top = records[0]!;
        expect(top.geographicEligibility.status).toBe('explicitly_supported');
        expect(top.match!.status).toBe('scored');
        const intern = records.find((r) => r.title === 'Data Analyst Intern')!;
        expect(intern.geographicEligibility.status).toBe('unknown');
        expect(intern.match!.requirementChecks).toContainEqual(expect.objectContaining({ requirement: 'Current student status', status: 'not_met' }));
        // The candidate profile never appears in delivered records.
        expect(JSON.stringify(records)).not.toContain('workAuthorizationCountries');
    });

    it('excludes unknown eligibility when asked', async () => {
        const { records } = await run({ ...matchInput, includeUnknownEligibility: false });
        expect(records.some((r) => r.geographicEligibility.status === 'unknown')).toBe(false);
    });

    it('reports partial source failure but still delivers the other source', async () => {
        const { summary, records } = await run(baseInput, { fetch: routes({ lever: 500 }) });
        expect(summary.outcome).toBe('partial_source_failure');
        expect(summary.resultStatus).toBe('results_delivered');
        expect(summary.sources.reports.find((r) => r.id === 'lever:dlocal')!.status).toBe('failed');
        expect(records.length).toBeGreaterThan(0);
    });

    it('reports total source failure explicitly', async () => {
        const { summary, records } = await run(baseInput, { fetch: routes({ gh: 404, lever: 404 }) });
        expect(summary.outcome).toBe('total_source_failure');
        expect(summary.stopReason).toBe('all_sources_failed');
        expect(records).toHaveLength(0);
    });

    it('distinguishes a successful search with no matches', async () => {
        const { summary, records } = await run({ ...baseInput, roleKeywords: ['astronaut'] });
        expect(records).toHaveLength(0);
        expect(summary.outcome).toBe('no_matches');
        expect(summary.billing.billedEvents).toBe(0);
    });

    it('relaxed filters keep preference misses, rank them after fits and still enforce countries', async () => {
        const prefs = { ...baseInput, seniorityLevels: ['executive'], workArrangements: ['hybrid'] };
        const strict = await run(prefs);
        const relaxed = await run({ ...prefs, filterMode: 'relaxed' });
        expect(relaxed.records.length).toBeGreaterThan(strict.records.length);
        expect(relaxed.summary.counts.excludedByReason.SENIORITY_MISMATCH ?? 0).toBe(0);
        expect(relaxed.summary.counts.excludedByReason.WORK_ARRANGEMENT_MISMATCH ?? 0).toBe(0);
        const titles = relaxed.records.map((r) => r.title);
        expect(titles).not.toContain('Data Analyst (Remote US)');
        expect(titles).not.toContain('Data Analyst (expired)');
        const misses = relaxed.records.map((r) => r.decisionReasons.filter((d) => d.includes('PREFERENCE_MISSED') || d.includes('PARTIAL_MATCH')).length);
        expect(misses.some((m) => m > 0)).toBe(true);
        expect(misses).toEqual([...misses].sort((a, b) => a - b));
    });

    it('relaxed filters accept titles sharing half of a multi-word keyword, after full matches', async () => {
        const strict = await run({ ...baseInput, roleKeywords: ['data scientist'] });
        const relaxed = await run({ ...baseInput, roleKeywords: ['data scientist'], filterMode: 'relaxed' });
        expect(relaxed.records.length).toBeGreaterThan(strict.records.length);
        expect(relaxed.records.some((r) => r.decisionReasons.some((d) => d.startsWith('ROLE_KEYWORD_PARTIAL_MATCH:')))).toBe(true);
    });

    it('stops at the charge limit and labels the run budget-limited', async () => {
        const { summary, records } = await run(baseInput, { budget: 1 });
        expect(records).toHaveLength(1);
        expect(summary.outcome).toBe('budget_limited');
        expect(summary.stopReason).toBe('charge_limit_reached');
        expect(summary.billing).toMatchObject({ delivered: 1, billedEvents: 1, stoppedByChargeLimit: true });
    });

    it('respects the request budget', async () => {
        const f = routes();
        const { summary } = await run({ ...baseInput, maxRequests: 1 }, { fetch: f });
        expect(f.calls).toHaveLength(1);
        expect(summary.requests.used).toBe(1);
        expect(summary.stopReason).toBe('request_budget_exhausted');
    });

    it('uses AI only within budget and falls back to rules when it fails', async () => {
        let calls = 0;
        const failing: AiProvider = { name: 'fake', extract: async () => { calls++; throw new Error('timeout'); } };
        const { summary, records } = await run({ ...matchInput, ai: { enabled: true, maxAnalyses: 1 } }, { ai: failing });
        expect(calls).toBe(1);
        expect(summary.ai).toMatchObject({ attempted: 1, failed: 1, rulesOnlyFallbacks: 1 });
        expect(records.every((r) => r.analysisMode === 'rules_only')).toBe(true);
        expect(summary.warnings.join(' ')).toMatch(/AI analysis call\(s\) failed/);
    });
});
