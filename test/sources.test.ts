import { describe, expect, it } from 'vitest';

import { planSources, UnknownSourceError } from '../src/pipeline/sources.js';
import { fetchGreenhouse, parseGreenhouseResponse } from '../src/sources/greenhouse.js';
import { BudgetedHttpClient, BudgetExceededError, SourceHttpError } from '../src/sources/http.js';
import { fetchLever, LEVER_PAGE_SIZE } from '../src/sources/lever.js';
import { getRegistryEntry, REGISTRY } from '../src/sources/registry.js';
import { fakeFetch, ghBoard, leverPosting } from './fixtures/builders.js';

const gh = getRegistryEntry('greenhouse:jumia')!;
const lv = getRegistryEntry('lever:dlocal')!;
const now = () => new Date('2026-09-23T12:00:00Z');
const client = (fetchImpl: ReturnType<typeof fakeFetch>, maxRequests = 20) =>
    new BudgetedHttpClient({ maxRequests, deadline: Date.now() + 60_000, fetchImpl, sleep: async () => {} });

describe('registry', () => {
    it('has verified entries for two source families', () => {
        expect(new Set(REGISTRY.map((e) => e.family))).toEqual(new Set(['greenhouse', 'lever']));
        for (const e of REGISTRY) {
            expect(e.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(e.officialCareersUrl).toMatch(/^https:\/\//);
            expect(e.verificationMethod.length).toBeGreaterThan(20);
        }
    });

    it('plans both families first and keeps the rest for one expansion', () => {
        const plan = planSources(['NG'], undefined);
        expect(new Set(plan.initial.slice(0, 2).map((e) => e.family))).toEqual(new Set(['greenhouse', 'lever']));
        expect(plan.initial.length + plan.expansion.length).toBe(REGISTRY.length);
    });

    it('rejects unknown source ids instead of silently ignoring them', () => {
        expect(() => planSources(['NG'], ['greenhouse:not-real'])).toThrow(UnknownSourceError);
    });
});

describe('Greenhouse adapter', () => {
    it('parses jobs, structured fields and deadlines', () => {
        const { listings, malformed } = parseGreenhouseResponse(
            gh,
            ghBoard([{ id: 1, title: 'Data Analyst', location: 'Lagos, Nigeria', employmentType: 'Full-time', deadline: '2026-10-01T00:00:00Z' }]),
            '2026-09-23T12:00:00.000Z',
        );
        expect(malformed).toBe(0);
        expect(listings[0]).toMatchObject({
            sourceId: 'greenhouse:jumia',
            sourceJobId: '1',
            title: 'Data Analyst',
            locationTexts: ['Lagos, Nigeria'],
            structuredEmploymentType: 'Full-time',
            structuredDeadline: '2026-10-01T00:00:00Z',
            salary: null,
        });
        expect(listings[0]!.postedAt).toMatch(/^2026-09-01/);
    });

    it('skips malformed records without failing the board', () => {
        const body = { jobs: [{ id: 1 }, ...ghBoard([{ id: 2, title: 'Analyst', location: 'Accra, Ghana' }]).jobs] };
        const { listings, malformed } = parseGreenhouseResponse(gh, body, '2026-09-23T12:00:00.000Z');
        expect(listings).toHaveLength(1);
        expect(malformed).toBe(1);
    });

    it('reports a failed board as an error, not as an empty success', async () => {
        const f = fakeFetch(() => ({ status: 404 }));
        const res = await fetchGreenhouse(gh, client(f), now);
        expect(res.listings).toEqual([]);
        expect(res.error).toMatch(/HTTP 404/);
    });
});

describe('Lever adapter', () => {
    it('follows skip/limit pagination until a short page', async () => {
        const page = (n: number, from: number) => Array.from({ length: n }, (_, i) => leverPosting({ id: `p${from + i}`, text: `Engineer ${from + i}`, location: 'Lagos' }));
        const f = fakeFetch((url) => {
            const skip = Number(new URL(url).searchParams.get('skip'));
            return { status: 200, body: skip === 0 ? page(LEVER_PAGE_SIZE, 0) : page(7, LEVER_PAGE_SIZE) };
        });
        const res = await fetchLever(lv, client(f), now);
        expect(res.listings).toHaveLength(LEVER_PAGE_SIZE + 7);
        expect(f.calls).toHaveLength(2);
        expect(res.requestsUsed).toBe(2);
        expect(res.error).toBeNull();
    });

    it('keeps partial results when a later page fails', async () => {
        const f = fakeFetch((url) =>
            new URL(url).searchParams.get('skip') === '0'
                ? { status: 200, body: Array.from({ length: LEVER_PAGE_SIZE }, (_, i) => leverPosting({ id: `p${i}`, text: 'Analyst', location: 'Nairobi' })) }
                : { status: 403 },
        );
        const res = await fetchLever(lv, client(f), now);
        expect(res.listings).toHaveLength(LEVER_PAGE_SIZE);
        expect(res.truncated).toBe(true);
        expect(res.error).toMatch(/HTTP 403/);
    });

    it('maps lists, workplace type and salary only when provided', async () => {
        const p = { ...leverPosting({ id: 'a', text: 'Intern', location: 'Cape Town', workplaceType: 'hybrid', lists: [{ text: 'Requirements', content: '<li>SQL</li>' }] }), salaryRange: { min: 1000, max: 2000, currency: 'ZAR', interval: 'per-month-salary' } };
        const f = fakeFetch(() => ({ status: 200, body: [p, leverPosting({ id: 'b', text: 'Other', location: 'Cape Town' })] }));
        const res = await fetchLever(lv, client(f), now);
        expect(res.listings[0]).toMatchObject({ structuredWorkplaceType: 'hybrid', namedLists: [{ title: 'Requirements', items: ['SQL'] }], salary: { min: 1000, max: 2000, currency: 'ZAR' } });
        expect(res.listings[1]!.salary).toBeNull();
    });
});

describe('budgeted HTTP client', () => {
    it('retries 5xx and counts every attempt against the budget', async () => {
        let n = 0;
        const f = fakeFetch(() => (++n < 3 ? { status: 503 } : { status: 200, body: { ok: true } }));
        const http = client(f);
        await expect(http.getJson('https://api.lever.co/v0/postings/x?mode=json')).resolves.toEqual({ ok: true });
        expect(http.requestsUsed).toBe(3);
    });

    it('stops at the request budget', async () => {
        const f = fakeFetch(() => ({ status: 500 }));
        const http = client(f, 2);
        await expect(http.getJson('https://api.lever.co/v0/postings/x')).rejects.toBeInstanceOf(BudgetExceededError);
        expect(f.calls).toHaveLength(2);
    });

    it('refuses hosts outside the allow-list, plain HTTP and redirects', async () => {
        const f = fakeFetch(() => ({ status: 302, headers: { location: 'http://169.254.169.254/' } }));
        const http = client(f);
        await expect(http.getJson('https://169.254.169.254/latest/meta-data')).rejects.toBeInstanceOf(SourceHttpError);
        await expect(http.getJson('http://api.lever.co/v0/postings/x')).rejects.toThrow(/non-HTTPS/);
        await expect(http.getJson('https://api.lever.co/v0/postings/x')).rejects.toThrow(/Refused redirect/);
        expect(f.calls).toEqual(['https://api.lever.co/v0/postings/x']);
    });
});
