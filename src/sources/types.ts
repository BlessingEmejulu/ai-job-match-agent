import type { RegistryEntry, SourceFamily } from './registry.js';

/** One listing as read from a source, before analysis. Only facts present in the source. */
export interface RawListing {
    sourceId: string;
    family: SourceFamily;
    boardId: string;
    company: string;
    sourceJobId: string;
    title: string;
    locationTexts: string[];
    /** Raw description HTML (Greenhouse content, or Lever description + additional). */
    descriptionHtml: string | null;
    /** Lever structured lists (title + items). */
    namedLists: { title: string; items: string[] }[];
    structuredEmploymentType: string | null;
    structuredWorkplaceType: string | null;
    structuredCountryCode: string | null;
    department: string | null;
    postedAt: string | null;
    updatedAt: string | null;
    structuredDeadline: string | null;
    jobUrl: string;
    applyUrl: string;
    salary: { min: number | null; max: number | null; currency: string | null; interval: string | null; text: string | null } | null;
    apiUrl: string;
    retrievedAt: string;
}

export interface SourceFetchResult {
    entry: RegistryEntry;
    listings: RawListing[];
    requestsUsed: number;
    /** Set when the source could not be read fully. Partial listings may still be present. */
    error: string | null;
    truncated: boolean;
}
