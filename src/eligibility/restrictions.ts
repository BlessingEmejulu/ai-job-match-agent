import { truncate } from '../normalization/text.js';
import { parseGeo, type Region } from './countries.js';

export type RestrictionKind = 'location_required' | 'work_authorization_required' | 'no_sponsorship' | 'worldwide_open';

export interface Restriction {
    kind: RestrictionKind;
    countries: string[];
    regions: Region[];
    /** Verbatim sentence from the posting. */
    quote: string;
    origin: 'description' | 'ai_quoted_description';
}

const LOCATION_PATTERNS: RegExp[] = [
    /\b(?:must|should|need to|needs to|are required to|is required to|will need to)\s+(?:be\s+)?(?:currently\s+)?(?:based|located|residing|reside|live|living|resident)\s+(?:in|within)\s+([^.;:\n]{2,80})/i,
    /\b(?:only|exclusively)\s+(?:open to|accepting|considering|hiring)\s+(?:candidates|applicants|people|talent)?\s*(?:who are\s+)?(?:currently\s+)?(?:based|located|residing|living)?\s*(?:in|within|from)\s+([^.;:\n]{2,80})/i,
    /\b(?:candidates|applicants)\s+(?:must|need to)\s+(?:be\s+)?(?:based|located|residing)\s+(?:in|within)\s+([^.;:\n]{2,80})/i,
    /\bremote\s*\(\s*([^)]{2,60}?)\s+only\s*\)/i,
    /\b((?:US|U\.S\.|UK|EU|EMEA|LATAM|Nigeria|Kenya|South Africa|Ghana|Egypt)[\s-]+(?:only|based only))\b/,
    /\bthis (?:role|position) is (?:only )?open to (?:candidates|applicants)?\s*(?:based |located )?in\s+([^.;:\n]{2,80})/i,
];

const AUTH_PATTERNS: RegExp[] = [
    /\b(?:legally\s+)?(?:authori[sz]ed|eligible|permitted|entitled|able)\s+to\s+work\s+(?:in|within)\s+(?:the\s+)?([^.;:,\n()]{2,60})/i,
    /\b(?:right|permission)\s+to\s+work\s+(?:in|within)\s+(?:the\s+)?([^.;:,\n()]{2,60})/i,
    /\bwork\s+(?:authori[sz]ation|permit)\s+(?:for|in)\s+(?:the\s+)?([^.;:,\n()]{2,60})/i,
];

const NO_SPONSOR_RE =
    /\b(?:not|unable to|cannot|can't|won't|will not|do not|does not|are not able to)\s+(?:currently\s+)?(?:provide|offer|support)?\s*(?:visa|immigration|work permit)?\s*sponsor(?:ship)?/i;

const WORLDWIDE_OPEN_RE =
    /\b(?:work|hire|hiring|open to candidates|we hire|you can work)\s+(?:from\s+)?(?:anywhere|globally|worldwide|across the world)\b/i;

/** Split description text into sentences without losing the verbatim wording. */
export function sentences(text: string): string[] {
    return text
        .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])|\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 3);
}

/**
 * Find explicit location / authorization statements in description text. Only statements with a
 * recognisable country or region become restrictions; vague ones are ignored rather than guessed.
 */
export function findRestrictions(text: string): Restriction[] {
    const out: Restriction[] = [];
    for (const sentence of sentences(text)) {
        const quote = truncate(sentence, 300);
        for (const re of LOCATION_PATTERNS) {
            const m = re.exec(sentence);
            if (!m) continue;
            const geo = parseGeo(m[1] ?? m[0]);
            if (geo.countries.length || geo.regions.length) {
                out.push({ kind: 'location_required', countries: geo.countries, regions: geo.regions, quote, origin: 'description' });
                break;
            }
        }
        for (const re of AUTH_PATTERNS) {
            const m = re.exec(sentence);
            if (!m) continue;
            const geo = parseGeo(m[1] ?? '');
            if (geo.countries.length || geo.regions.length) {
                out.push({ kind: 'work_authorization_required', countries: geo.countries, regions: geo.regions, quote, origin: 'description' });
                break;
            }
        }
        if (NO_SPONSOR_RE.test(sentence)) out.push({ kind: 'no_sponsorship', countries: [], regions: [], quote, origin: 'description' });
        if (WORLDWIDE_OPEN_RE.test(sentence)) out.push({ kind: 'worldwide_open', countries: [], regions: [], quote, origin: 'description' });
    }
    return dedupeRestrictions(out);
}

function dedupeRestrictions(list: Restriction[]): Restriction[] {
    const seen = new Set<string>();
    return list.filter((r) => {
        const key = `${r.kind}|${r.countries.join(',')}|${r.regions.join(',')}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
