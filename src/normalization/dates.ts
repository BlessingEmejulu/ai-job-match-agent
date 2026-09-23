import type { ClassifiedLine } from './sections.js';
import { truncate } from './text.js';

/** Parse a timestamp into ISO-8601 with offset, or null. Accepts ISO strings and epoch millis. */
export function toIsoOrNull(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    const d = typeof value === 'number' ? new Date(value) : new Date(String(value));
    if (Number.isNaN(d.getTime())) return null;
    const year = d.getUTCFullYear();
    if (year < 2000 || year > 2100) return null;
    return d.toISOString();
}

const MONTHS: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

/** Parse a human date ("30 September 2026", "Sept 30, 2026", "2026-09-30") to YYYY-MM-DD. */
export function parseHumanDate(text: string): string | null {
    const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(text);
    if (iso) return validYmd(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const dmy = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?,?\s+(20\d{2})\b/.exec(text);
    if (dmy) {
        const m = MONTHS[dmy[2]!.slice(0, 4).toLowerCase()] ?? MONTHS[dmy[2]!.slice(0, 3).toLowerCase()];
        if (m !== undefined) return validYmd(Number(dmy[3]), m, Number(dmy[1]));
    }
    const mdy = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/.exec(text);
    if (mdy) {
        const m = MONTHS[mdy[1]!.slice(0, 4).toLowerCase()] ?? MONTHS[mdy[1]!.slice(0, 3).toLowerCase()];
        if (m !== undefined) return validYmd(Number(mdy[3]), m, Number(mdy[2]));
    }
    return null;
}

function validYmd(y: number, m: number, d: number): string | null {
    const date = new Date(Date.UTC(y, m, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m || date.getUTCDate() !== d) return null;
    return date.toISOString().slice(0, 10);
}

const DEADLINE_LINE =
    /\b(application deadline|deadline(?: for applications)?|closing date|apply by|applications? (?:close|closes|closing)(?: on)?|last date to apply|submit (?:your application|applications) by)\b/i;

export interface DeadlineInfo {
    deadline: string | null;
    evidence: string | null;
    origin: 'structured_field' | 'description' | null;
}

/** Find an explicit deadline. A structured field wins; otherwise only lines that say "deadline" etc. */
export function findDeadline(structured: unknown, lines: ClassifiedLine[]): DeadlineInfo {
    if (structured) {
        const iso = toIsoOrNull(structured);
        if (iso) return { deadline: iso.slice(0, 10), evidence: `application_deadline: ${String(structured)}`, origin: 'structured_field' };
    }
    for (const line of lines) {
        if (!DEADLINE_LINE.test(line.text)) continue;
        const date = parseHumanDate(line.text);
        if (date) return { deadline: date, evidence: truncate(line.text, 220), origin: 'description' };
    }
    return { deadline: null, evidence: null, origin: null };
}

export type DeadlineStatus = 'open' | 'closing_soon' | 'expired' | 'unknown';

/**
 * Deadlines are day-precision and the employer's timezone is usually unknown, so a deadline is
 * only treated as expired once the whole day has passed everywhere (UTC-12 end of day).
 */
export function deadlineStatus(deadline: string | null, now: Date): DeadlineStatus {
    if (!deadline) return 'unknown';
    const endOfDayEverywhere = Date.parse(`${deadline}T23:59:59Z`) + 12 * 3600 * 1000;
    if (Number.isNaN(endOfDayEverywhere)) return 'unknown';
    if (now.getTime() > endOfDayEverywhere) return 'expired';
    if (endOfDayEverywhere - now.getTime() <= 7 * 24 * 3600 * 1000) return 'closing_soon';
    return 'open';
}

export function daysSince(iso: string | null, now: Date): number | null {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}
