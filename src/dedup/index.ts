/**
 * Deduplication keys, strongest first:
 *   1. source + stable job id
 *   2. canonical application URL (tracking parameters removed, functional ones kept)
 *   3. identical normalized company + title + location (conservative: all three must match)
 * Distinct jobs that merely share a title (e.g. the same role in two countries) are kept apart.
 */

const TRACKING_PARAMS = new Set([
    'gh_src', 'source', 'src', 'ref', 'referrer', 'lever-source', 'lever-origin', 'lever-via',
    'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'trk', 'trackingid',
]);

export function canonicalUrl(raw: string): string | null {
    let u: URL;
    try {
        u = new URL(raw);
    } catch {
        return null;
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    const kept = [...u.searchParams.entries()].filter(([k]) => !k.toLowerCase().startsWith('utm_') && !TRACKING_PARAMS.has(k.toLowerCase()));
    kept.sort(([a], [b]) => a.localeCompare(b));
    u.search = '';
    for (const [k, v] of kept) u.searchParams.append(k, v);
    let path = u.pathname.replace(/\/+$/, '');
    // Lever apply pages and posting pages identify the same job.
    if (u.hostname === 'jobs.lever.co') path = path.replace(/\/apply$/, '');
    u.pathname = path || '/';
    return `https://${u.host}${u.pathname}${u.search}`;
}

const norm = (s: string) =>
    s
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

export interface DedupCandidate {
    sourceId: string;
    sourceJobId: string;
    applyUrl: string;
    company: string;
    title: string;
    locationText: string;
}

export interface DedupDecision {
    duplicate: boolean;
    /** Key of the first-seen record this one duplicates. */
    duplicateOf: string | null;
    matchedOn: 'source_id' | 'application_url' | 'company_title_location' | null;
}

export class Deduplicator {
    private readonly keyToPrimary = new Map<string, string>();

    primaryKey(c: DedupCandidate): string {
        return `id:${c.sourceId}:${c.sourceJobId}`;
    }

    private keys(c: DedupCandidate): [DedupDecision['matchedOn'], string][] {
        const out: [DedupDecision['matchedOn'], string][] = [['source_id', this.primaryKey(c)]];
        const url = canonicalUrl(c.applyUrl);
        if (url) out.push(['application_url', `url:${url}`]);
        const ctl = [norm(c.company), norm(c.title), norm(c.locationText)];
        if (ctl.every((p) => p.length > 0)) out.push(['company_title_location', `ctl:${ctl.join('|')}`]);
        return out;
    }

    /** Check and register in one synchronous step, so concurrent callers cannot both pass. */
    checkAndAdd(c: DedupCandidate): DedupDecision {
        const keys = this.keys(c);
        for (const [matchedOn, key] of keys) {
            const primary = this.keyToPrimary.get(key);
            if (primary) return { duplicate: true, duplicateOf: primary, matchedOn };
        }
        const primary = this.primaryKey(c);
        for (const [, key] of keys) this.keyToPrimary.set(key, primary);
        return { duplicate: false, duplicateOf: null, matchedOn: null };
    }
}
