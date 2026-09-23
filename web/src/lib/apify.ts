import 'server-only';

/**
 * Minimal server-side Apify API client (https://docs.apify.com/api/v2). The token is sent only in
 * the Authorization header, never in URLs, and this module can only be imported by server code.
 */
// Local development can point at `scripts/mock-apify.mjs`; production always uses the real API.
const API =
    process.env.NODE_ENV !== 'production' && process.env.APIFY_API_BASE_URL?.startsWith('http://localhost:')
        ? process.env.APIFY_API_BASE_URL.replace(/\/$/, '')
        : 'https://api.apify.com/v2';

export type RunStatus = 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMING-OUT' | 'TIMED-OUT' | 'ABORTING' | 'ABORTED';
export const TERMINAL: RunStatus[] = ['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'];

export interface RunInfo {
    id: string;
    status: RunStatus;
    statusMessage: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    defaultDatasetId: string;
    defaultKeyValueStoreId: string;
}

export class ApifyError extends Error {
    constructor(
        message: string,
        public readonly status: number,
    ) {
        super(message);
        this.name = 'ApifyError';
    }
}

function token(): string {
    const t = process.env.APIFY_TOKEN;
    if (!t) throw new ApifyError('APIFY_TOKEN is not configured', 500);
    return t;
}

async function call<T>(path: string, init: RequestInit & { revalidate?: number } = {}): Promise<T> {
    const { revalidate, ...rest } = init;
    const res = await fetch(`${API}${path}`, {
        ...rest,
        headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json', ...(rest.headers ?? {}) },
        ...(revalidate ? { next: { revalidate } } : { cache: 'no-store' as const }),
    });
    if (!res.ok) throw new ApifyError(`Apify API ${res.status} for ${path.split('?')[0]}`, res.status);
    return (await res.json()) as T;
}

function toRunInfo(d: Record<string, unknown>): RunInfo {
    return {
        id: String(d.id),
        status: d.status as RunStatus,
        statusMessage: typeof d.statusMessage === 'string' ? d.statusMessage.slice(0, 300) : null,
        startedAt: (d.startedAt as string) ?? null,
        finishedAt: (d.finishedAt as string) ?? null,
        defaultDatasetId: String(d.defaultDatasetId),
        defaultKeyValueStoreId: String(d.defaultKeyValueStoreId),
    };
}

export async function startRun(actorId: string, input: unknown, opts: { maxTotalChargeUsd: number; timeoutSecs: number; memoryMbytes: number }): Promise<RunInfo> {
    const q = new URLSearchParams({
        maxTotalChargeUsd: String(opts.maxTotalChargeUsd),
        timeout: String(opts.timeoutSecs),
        memory: String(opts.memoryMbytes),
    });
    const res = await call<{ data: Record<string, unknown> }>(`/acts/${encodeURIComponent(actorId)}/runs?${q}`, {
        method: 'POST',
        body: JSON.stringify(input),
    });
    return toRunInfo(res.data);
}

export async function getRun(runId: string): Promise<RunInfo> {
    const res = await call<{ data: Record<string, unknown> }>(`/actor-runs/${encodeURIComponent(runId)}`);
    return toRunInfo(res.data);
}

export async function getDatasetItems(datasetId: string, offset: number, limit: number, revalidate?: number): Promise<unknown[]> {
    const q = new URLSearchParams({ offset: String(offset), limit: String(limit), clean: 'true', format: 'json' });
    return call<unknown[]>(`/datasets/${encodeURIComponent(datasetId)}/items?${q}`, { revalidate });
}

export async function getRecord<T>(storeId: string, key: string, revalidate?: number): Promise<T | null> {
    try {
        return await call<T>(`/key-value-stores/${encodeURIComponent(storeId)}/records/${encodeURIComponent(key)}`, { revalidate });
    } catch (err) {
        if (err instanceof ApifyError && err.status === 404) return null;
        throw err;
    }
}

export async function getDatasetInfo(datasetId: string, revalidate?: number): Promise<{ itemCount: number; createdAt: string; modifiedAt: string; actRunId: string | null }> {
    const res = await call<{ data: Record<string, unknown> }>(`/datasets/${encodeURIComponent(datasetId)}`, { revalidate });
    return {
        itemCount: Number(res.data.itemCount ?? 0),
        createdAt: String(res.data.createdAt),
        modifiedAt: String(res.data.modifiedAt),
        actRunId: (res.data.actRunId as string) ?? null,
    };
}
