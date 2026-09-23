import { regionsOf } from '../eligibility/countries.js';
import { fetchGreenhouse } from '../sources/greenhouse.js';
import type { BudgetedHttpClient } from '../sources/http.js';
import { fetchLever } from '../sources/lever.js';
import { REGISTRY, type RegistryEntry } from '../sources/registry.js';
import type { SourceFetchResult } from '../sources/types.js';

export interface SourcePlan {
    initial: RegistryEntry[];
    expansion: RegistryEntry[];
    ranking: { id: string; relevance: number }[];
}

export class UnknownSourceError extends Error {
    constructor(public readonly ids: string[]) {
        super(`Unknown sourceIds: ${ids.join(', ')}. Valid ids: ${REGISTRY.map((e) => e.id).join(', ')}`);
        this.name = 'UnknownSourceError';
    }
}

/** Relevance of a verified board to the requested countries. Used only for ordering. */
export function relevance(entry: RegistryEntry, countries: string[]): number {
    const countryHits = countries.filter((c) => entry.observedCountries.includes(c)).length;
    const regionHits = countries.filter((c) => regionsOf(c).some((r) => entry.observedRegions.includes(r))).length;
    // Worldwide roles are open to applicants in every country, so measured volume counts like a country hit.
    return countryHits * 3 + Math.min(regionHits, 2) + Math.min(4, Math.round(entry.measuredWorldwideListings / 10)) + (entry.hasWorldwideRoles ? 1 : 0);
}

/**
 * Plan which verified boards to read. The initial set takes the most relevant boards while making
 * sure both source families are represented; the rest form a ranked expansion pool that the
 * Decide stage may draw from once if results are insufficient.
 */
export function planSources(countries: string[], sourceIds: string[] | undefined, initialSize = 4): SourcePlan {
    let pool = REGISTRY;
    if (sourceIds?.length) {
        const unknown = sourceIds.filter((id) => !REGISTRY.some((e) => e.id === id));
        if (unknown.length) throw new UnknownSourceError(unknown);
        pool = REGISTRY.filter((e) => sourceIds.includes(e.id));
    }
    const ranked = [...pool]
        .map((e) => ({ e, r: relevance(e, countries) }))
        .sort((a, b) => b.r - a.r || a.e.id.localeCompare(b.e.id));
    const initial: RegistryEntry[] = [];
    for (const family of ['greenhouse', 'lever'] as const) {
        const top = ranked.find((x) => x.e.family === family && x.r > 0) ?? ranked.find((x) => x.e.family === family);
        if (top && initial.length < initialSize) initial.push(top.e);
    }
    for (const { e } of ranked) {
        if (initial.length >= initialSize) break;
        if (!initial.includes(e)) initial.push(e);
    }
    return {
        initial,
        expansion: ranked.map((x) => x.e).filter((e) => !initial.includes(e)),
        ranking: ranked.map((x) => ({ id: x.e.id, relevance: x.r })),
    };
}

export async function fetchSources(
    entries: RegistryEntry[],
    http: BudgetedHttpClient,
    now: () => Date,
    concurrency = 2,
): Promise<SourceFetchResult[]> {
    const results: SourceFetchResult[] = new Array(entries.length);
    let next = 0;
    const worker = async () => {
        while (next < entries.length) {
            const i = next++;
            const entry = entries[i]!;
            results[i] = entry.family === 'greenhouse' ? await fetchGreenhouse(entry, http, now) : await fetchLever(entry, http, now);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
    return results;
}
