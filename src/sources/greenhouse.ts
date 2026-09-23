import { z } from 'zod';

import { toIsoOrNull } from '../normalization/dates.js';
import { cleanLine } from '../normalization/text.js';
import { type BudgetedHttpClient, SourceHttpError } from './http.js';
import type { RegistryEntry } from './registry.js';
import type { RawListing, SourceFetchResult } from './types.js';

/**
 * Greenhouse Job Board API (https://developers.greenhouse.io/job-board.html).
 * GET /v1/boards/{board_token}/jobs?content=true — public, unauthenticated, not paginated: the
 * whole board comes back in one response. `content` is HTML-escaped HTML.
 */
const jobSchema = z
    .object({
        id: z.union([z.number(), z.string()]),
        title: z.string(),
        absolute_url: z.string(),
        updated_at: z.string().nullish(),
        first_published: z.string().nullish(),
        application_deadline: z.string().nullish(),
        company_name: z.string().nullish(),
        content: z.string().nullish(),
        location: z.object({ name: z.string().nullish() }).nullish(),
        departments: z.array(z.object({ name: z.string().nullish() })).nullish(),
        offices: z.array(z.object({ name: z.string().nullish(), location: z.string().nullish() })).nullish(),
        metadata: z
            .array(z.object({ name: z.string().nullish(), value: z.unknown() }))
            .nullish(),
    })
    .passthrough();

const responseSchema = z.object({ jobs: z.array(z.unknown()) }).passthrough();

export function greenhouseListUrl(boardId: string): string {
    return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardId)}/jobs?content=true`;
}

export function parseGreenhouseResponse(entry: RegistryEntry, body: unknown, retrievedAt: string): { listings: RawListing[]; malformed: number } {
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) throw new SourceHttpError('Unexpected Greenhouse response shape', null);
    const listings: RawListing[] = [];
    let malformed = 0;
    for (const raw of parsed.data.jobs) {
        const job = jobSchema.safeParse(raw);
        if (!job.success) {
            malformed++;
            continue;
        }
        const j = job.data;
        const employment = (j.metadata ?? []).find(
            (m) => /employment|job type|contract type|commitment/i.test(m.name ?? '') && typeof m.value === 'string' && m.value,
        );
        const loc = cleanLine(j.location?.name);
        listings.push({
            sourceId: entry.id,
            family: 'greenhouse',
            boardId: entry.boardId,
            company: cleanLine(j.company_name) || entry.employer,
            sourceJobId: String(j.id),
            title: cleanLine(j.title),
            locationTexts: loc ? [loc] : [],
            descriptionHtml: j.content ?? null,
            namedLists: [],
            structuredEmploymentType: employment ? String(employment.value) : null,
            structuredWorkplaceType: null,
            structuredCountryCode: null,
            department: cleanLine(j.departments?.[0]?.name) || null,
            postedAt: toIsoOrNull(j.first_published),
            updatedAt: toIsoOrNull(j.updated_at),
            structuredDeadline: j.application_deadline ?? null,
            jobUrl: j.absolute_url,
            applyUrl: j.absolute_url,
            salary: null,
            apiUrl: greenhouseListUrl(entry.boardId),
            retrievedAt,
        });
    }
    return { listings, malformed };
}

export async function fetchGreenhouse(entry: RegistryEntry, http: BudgetedHttpClient, now: () => Date): Promise<SourceFetchResult> {
    const counter = { requests: 0 };
    try {
        const body = await http.getJson<unknown>(greenhouseListUrl(entry.boardId), counter);
        const { listings, malformed } = parseGreenhouseResponse(entry, body, now().toISOString());
        return {
            entry,
            listings,
            requestsUsed: counter.requests,
            error: malformed ? `${malformed} malformed job record(s) skipped` : null,
            truncated: false,
        };
    } catch (err) {
        return { entry, listings: [], requestsUsed: counter.requests, error: (err as Error).message, truncated: false };
    }
}
