/** Browser-safe view of the Actor's RUN_SUMMARY (no input echo, no billing internals). */
export interface SummaryView {
    outcome: string;
    resultStatus: string;
    stopReason: string;
    delivered: number;
    listingsDiscovered: number;
    sources: { id: string; status: string; listings: number }[];
    warnings: string[];
    decisions: string[];
    finishedAt: string | null;
    /** Listings excluded by the Actor's Decide stage, by reason code (e.g. SENIORITY_MISMATCH). */
    excluded: Record<string, number>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const s = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function summaryView(raw: unknown): SummaryView | null {
    if (!isObj(raw)) return null;
    const counts = isObj(raw.counts) ? raw.counts : {};
    const sources = isObj(raw.sources) && Array.isArray(raw.sources.reports) ? raw.sources.reports.filter(isObj) : [];
    return {
        outcome: s(raw.outcome, 40),
        resultStatus: s(raw.resultStatus, 40),
        stopReason: s(raw.stopReason, 40),
        delivered: n(counts.opportunitiesDelivered),
        listingsDiscovered: n(counts.listingsDiscovered),
        sources: sources.slice(0, 12).map((r) => ({ id: s(r.id, 60), status: s(r.status, 20), listings: n(r.listings) })),
        warnings: Array.isArray(raw.warnings) ? raw.warnings.slice(0, 5).map((w) => s(w, 300)) : [],
        decisions: Array.isArray(raw.decisions) ? raw.decisions.slice(0, 10).map((d) => s(d, 400)) : [],
        finishedAt: s(raw.runFinishedAt, 40) || null,
        excluded: Object.fromEntries(
            Object.entries(isObj(counts.excludedByReason) ? counts.excludedByReason : {})
                .filter(([k, v]) => /^[A-Z_]{3,60}$/.test(k) && typeof v === 'number' && Number.isFinite(v))
                .slice(0, 20) as [string, number][],
        ),
    };
}
