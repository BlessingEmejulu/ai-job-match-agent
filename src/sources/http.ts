/**
 * Budgeted JSON HTTP client. Every attempt (including retries) counts against the run's request
 * budget; requests stop at the runtime deadline; only allow-listed HTTPS API hosts can be called;
 * redirects are refused rather than followed.
 */

export const ALLOWED_API_HOSTS = new Set(['boards-api.greenhouse.io', 'api.lever.co']);

export type FetchLike = (url: string, init: { signal: AbortSignal; headers: Record<string, string>; redirect: 'manual' }) => Promise<{
    status: number;
    ok: boolean;
    headers: { get(name: string): string | null };
    text(): Promise<string>;
}>;

export class BudgetExceededError extends Error {
    constructor(public readonly budget: 'requests' | 'runtime') {
        super(`${budget} budget exhausted`);
        this.name = 'BudgetExceededError';
    }
}

export class SourceHttpError extends Error {
    constructor(
        message: string,
        public readonly status: number | null,
    ) {
        super(message);
        this.name = 'SourceHttpError';
    }
}

export interface HttpClientOptions {
    maxRequests: number;
    deadline: number;
    fetchImpl?: FetchLike;
    timeoutMs?: number;
    retries?: number;
    maxBodyBytes?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    userAgent?: string;
}

export class BudgetedHttpClient {
    private used = 0;
    private readonly fetchImpl: FetchLike;
    private readonly timeoutMs: number;
    private readonly retries: number;
    private readonly maxBodyBytes: number;
    private readonly now: () => number;
    private readonly sleep: (ms: number) => Promise<void>;

    constructor(private readonly opts: HttpClientOptions) {
        this.fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init));
        this.timeoutMs = opts.timeoutMs ?? 25_000;
        this.retries = opts.retries ?? 2;
        this.maxBodyBytes = opts.maxBodyBytes ?? 15_000_000;
        this.now = opts.now ?? Date.now;
        this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    }

    get requestsUsed(): number {
        return this.used;
    }

    get requestsRemaining(): number {
        return Math.max(0, this.opts.maxRequests - this.used);
    }

    get timeRemainingMs(): number {
        return this.opts.deadline - this.now();
    }

    async getJson<T>(url: string, counter?: { requests: number }): Promise<T> {
        assertAllowedApiUrl(url);
        let lastError: Error | null = null;
        for (let attempt = 0; attempt <= this.retries; attempt++) {
            if (this.used >= this.opts.maxRequests) throw new BudgetExceededError('requests');
            const remaining = this.timeRemainingMs;
            if (remaining <= 1_000) throw new BudgetExceededError('runtime');
            this.used++;
            if (counter) counter.requests++;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, remaining));
            try {
                const res = await this.fetchImpl(url, {
                    signal: controller.signal,
                    redirect: 'manual',
                    headers: {
                        accept: 'application/json',
                        'user-agent': this.opts.userAgent ?? 'ai-job-match-agent (+https://github.com/BlessingEmejulu/ai-job-match-agent)',
                    },
                });
                if (res.status >= 300 && res.status < 400) {
                    throw new SourceHttpError(`Refused redirect (${res.status}) from ${url}`, res.status);
                }
                if (res.status === 429 || res.status >= 500) {
                    lastError = new SourceHttpError(`HTTP ${res.status} from ${url}`, res.status);
                    const retryAfter = Number(res.headers.get('retry-after'));
                    await this.backoff(attempt, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined);
                    continue;
                }
                if (!res.ok) throw new SourceHttpError(`HTTP ${res.status} from ${url}`, res.status);
                const body = await res.text();
                if (body.length > this.maxBodyBytes) throw new SourceHttpError(`Response too large from ${url}`, res.status);
                try {
                    return JSON.parse(body) as T;
                } catch {
                    throw new SourceHttpError(`Invalid JSON from ${url}`, res.status);
                }
            } catch (err) {
                if (err instanceof SourceHttpError || err instanceof BudgetExceededError) throw err;
                lastError = err instanceof Error ? err : new Error(String(err));
                await this.backoff(attempt);
            } finally {
                clearTimeout(timer);
            }
        }
        throw new SourceHttpError(`Failed after ${this.retries + 1} attempts: ${lastError?.message ?? 'unknown error'}`, null);
    }

    private async backoff(attempt: number, hintMs?: number): Promise<void> {
        if (attempt >= this.retries) return;
        const ms = Math.min(hintMs ?? 500 * 2 ** attempt, 5_000, Math.max(0, this.timeRemainingMs - 1_000));
        if (ms > 0) await this.sleep(ms);
    }
}

export function assertAllowedApiUrl(url: string): void {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new SourceHttpError(`Invalid URL: ${url}`, null);
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) {
        throw new SourceHttpError(`Refused non-HTTPS or credentialed URL: ${url}`, null);
    }
    if (!ALLOWED_API_HOSTS.has(parsed.hostname)) {
        throw new SourceHttpError(`Host not in source allow-list: ${parsed.hostname}`, null);
    }
}
