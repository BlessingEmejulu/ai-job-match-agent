import { z } from 'zod';

import { toIsoOrNull } from '../normalization/dates.js';
import { cleanLine, htmlToBlocks } from '../normalization/text.js';
import { BudgetExceededError, type BudgetedHttpClient, SourceHttpError } from './http.js';
import type { RegistryEntry } from './registry.js';
import type { RawListing, SourceFetchResult } from './types.js';

/**
 * Lever Postings API (https://github.com/lever/postings-api).
 * GET /v0/postings/{site}?mode=json&skip=N&limit=M — public, unauthenticated, paginated with
 * skip/limit. Only published postings are returned. No full-text search.
 */
export const LEVER_PAGE_SIZE = 100;
export const LEVER_MAX_PAGES = 5;

const postingSchema = z
    .object({
        id: z.string(),
        text: z.string(),
        hostedUrl: z.string(),
        applyUrl: z.string().nullish(),
        createdAt: z.number().nullish(),
        country: z.string().nullish(),
        workplaceType: z.string().nullish(),
        description: z.string().nullish(),
        additional: z.string().nullish(),
        opening: z.string().nullish(),
        descriptionBody: z.string().nullish(),
        lists: z.array(z.object({ text: z.string().nullish(), content: z.string().nullish() })).nullish(),
        categories: z
            .object({
                commitment: z.string().nullish(),
                department: z.string().nullish(),
                location: z.string().nullish(),
                team: z.string().nullish(),
                allLocations: z.array(z.string()).nullish(),
            })
            .nullish(),
        salaryRange: z
            .object({
                min: z.number().nullish(),
                max: z.number().nullish(),
                currency: z.string().nullish(),
                interval: z.string().nullish(),
            })
            .nullish(),
        salaryDescriptionPlain: z.string().nullish(),
    })
    .passthrough();

export function leverListUrl(site: string, skip: number, limit = LEVER_PAGE_SIZE): string {
    return `https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json&skip=${skip}&limit=${limit}`;
}

export function parseLeverPage(entry: RegistryEntry, body: unknown, apiUrl: string, retrievedAt: string): { listings: RawListing[]; malformed: number; count: number } {
    if (!Array.isArray(body)) throw new SourceHttpError('Unexpected Lever response shape', null);
    const listings: RawListing[] = [];
    let malformed = 0;
    for (const raw of body) {
        const p = postingSchema.safeParse(raw);
        if (!p.success) {
            malformed++;
            continue;
        }
        const j = p.data;
        const cats = j.categories ?? {};
        const locations = [...new Set([cats.location, ...(cats.allLocations ?? [])].map((l) => cleanLine(l)).filter(Boolean))];
        const salary =
            j.salaryRange && (j.salaryRange.min != null || j.salaryRange.max != null)
                ? {
                      min: j.salaryRange.min ?? null,
                      max: j.salaryRange.max ?? null,
                      currency: j.salaryRange.currency ?? null,
                      interval: j.salaryRange.interval ?? null,
                      text: cleanLine(j.salaryDescriptionPlain).slice(0, 300) || null,
                  }
                : null;
        const descriptionHtml = [j.opening, j.descriptionBody ?? j.description, j.additional].filter(Boolean).join('\n');
        listings.push({
            sourceId: entry.id,
            family: 'lever',
            boardId: entry.boardId,
            company: entry.employer,
            sourceJobId: j.id,
            title: cleanLine(j.text),
            locationTexts: locations,
            descriptionHtml: descriptionHtml || null,
            namedLists: (j.lists ?? []).map((l) => ({
                title: cleanLine(l.text),
                items: htmlToBlocks(l.content ?? '').map((b) => b.text),
            })),
            structuredEmploymentType: cats.commitment ?? null,
            structuredWorkplaceType: j.workplaceType ?? null,
            structuredCountryCode: j.country && /^[A-Z]{2}$/.test(j.country) ? j.country : null,
            department: cleanLine(cats.department ?? cats.team) || null,
            postedAt: toIsoOrNull(j.createdAt),
            updatedAt: null,
            structuredDeadline: null,
            jobUrl: j.hostedUrl,
            applyUrl: j.applyUrl ?? j.hostedUrl,
            salary,
            apiUrl,
            retrievedAt,
        });
    }
    return { listings, malformed, count: body.length };
}

export async function fetchLever(entry: RegistryEntry, http: BudgetedHttpClient, now: () => Date): Promise<SourceFetchResult> {
    const counter = { requests: 0 };
    const listings: RawListing[] = [];
    let malformed = 0;
    let error: string | null = null;
    let truncated = false;
    for (let page = 0; page < LEVER_MAX_PAGES; page++) {
        const url = leverListUrl(entry.boardId, page * LEVER_PAGE_SIZE);
        try {
            const body = await http.getJson<unknown>(url, counter);
            const res = parseLeverPage(entry, body, url, now().toISOString());
            listings.push(...res.listings);
            malformed += res.malformed;
            if (res.count < LEVER_PAGE_SIZE) break;
            if (page === LEVER_MAX_PAGES - 1) truncated = true;
        } catch (err) {
            error = (err as Error).message;
            if (err instanceof BudgetExceededError || listings.length) truncated = true;
            break;
        }
    }
    if (!error && malformed) error = `${malformed} malformed posting(s) skipped`;
    return { entry, listings, requestsUsed: counter.requests, error, truncated };
}
