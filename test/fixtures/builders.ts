/**
 * LABELED TEST FIXTURES — synthetic job postings shaped like the Greenhouse Job Board API and
 * Lever Postings API responses. Company names are fictional ("Fixture Co"). They exist to
 * reproduce edge cases (restrictions, student-only roles, expired deadlines, prompt injection)
 * deterministically; they are not real listings.
 */
import type { FetchLike } from '../../src/sources/http.js';

export interface GhJobSpec {
    id: number;
    title: string;
    location: string;
    content?: string;
    url?: string;
    deadline?: string | null;
    employmentType?: string;
    firstPublished?: string;
    updatedAt?: string;
}

const escape = (html: string) => html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function ghJob(spec: GhJobSpec) {
    return {
        id: spec.id,
        title: spec.title,
        absolute_url: spec.url ?? `https://job-boards.greenhouse.io/fixtureco/jobs/${spec.id}`,
        updated_at: spec.updatedAt ?? '2026-09-10T10:00:00-04:00',
        first_published: spec.firstPublished ?? '2026-09-01T10:00:00-04:00',
        application_deadline: spec.deadline ?? null,
        company_name: 'Fixture Co',
        content: escape(spec.content ?? '<p>No details.</p>'),
        location: { name: spec.location },
        departments: [{ name: 'Engineering' }],
        offices: [],
        metadata: spec.employmentType ? [{ name: 'Employment type', value: spec.employmentType }] : [],
    };
}

export function ghBoard(jobs: GhJobSpec[]) {
    return { jobs: jobs.map(ghJob), meta: { total: jobs.length } };
}

export interface LeverSpec {
    id: string;
    text: string;
    location: string;
    workplaceType?: string;
    commitment?: string;
    lists?: { text: string; content: string }[];
    description?: string;
    country?: string;
}

export function leverPosting(spec: LeverSpec) {
    return {
        id: spec.id,
        text: spec.text,
        hostedUrl: `https://jobs.lever.co/fixtureco/${spec.id}`,
        applyUrl: `https://jobs.lever.co/fixtureco/${spec.id}/apply`,
        createdAt: Date.parse('2026-09-05T00:00:00Z'),
        country: spec.country ?? null,
        workplaceType: spec.workplaceType ?? 'unspecified',
        descriptionBody: spec.description ?? '<div>Fixture posting.</div>',
        additional: '',
        lists: spec.lists ?? [],
        categories: { commitment: spec.commitment ?? 'Full-time', department: 'Engineering', location: spec.location, allLocations: [spec.location] },
    };
}

type Route = (url: string) => { status: number; body?: unknown; headers?: Record<string, string> } | Promise<{ status: number; body?: unknown; headers?: Record<string, string> }>;

/** Fake fetch for tests. Records every URL requested. */
export function fakeFetch(route: Route): FetchLike & { calls: string[] } {
    const calls: string[] = [];
    const fn = (async (url: string, init: { signal: AbortSignal }) => {
        calls.push(url);
        if (init.signal.aborted) throw new Error('aborted');
        const res = await route(url);
        return {
            status: res.status,
            ok: res.status >= 200 && res.status < 300,
            headers: { get: (n: string) => res.headers?.[n.toLowerCase()] ?? null },
            text: async () => (typeof res.body === 'string' ? res.body : JSON.stringify(res.body ?? null)),
        };
    }) as unknown as FetchLike & { calls: string[] };
    fn.calls = calls;
    return fn;
}

export const NOW = new Date('2026-09-23T12:00:00Z');
