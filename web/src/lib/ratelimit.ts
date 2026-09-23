/**
 * Persistent counters for rate and concurrency limits. Production uses Upstash Redis over its REST
 * API (no SDK); local development falls back to process memory and says so. In production without
 * Redis, live runs are refused (fail closed).
 */
export interface CounterStore {
    readonly persistent: boolean;
    /** Increment a counter, setting its expiry on first use. Returns the new value. */
    incr(key: string, ttlSeconds: number): Promise<number>;
    /** Set a value only if absent, with expiry. Returns true when set. */
    setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
    del(key: string): Promise<void>;
    get(key: string): Promise<string | null>;
}

export class MemoryStore implements CounterStore {
    readonly persistent = false;
    private readonly data = new Map<string, { v: string; exp: number }>();
    constructor(private readonly now: () => number = Date.now) {}

    private live(key: string) {
        const e = this.data.get(key);
        if (e && e.exp <= this.now()) {
            this.data.delete(key);
            return undefined;
        }
        return e;
    }
    async incr(key: string, ttlSeconds: number) {
        const e = this.live(key);
        const v = (e ? Number(e.v) : 0) + 1;
        this.data.set(key, { v: String(v), exp: e?.exp ?? this.now() + ttlSeconds * 1000 });
        return v;
    }
    async setIfAbsent(key: string, value: string, ttlSeconds: number) {
        if (this.live(key)) return false;
        this.data.set(key, { v: value, exp: this.now() + ttlSeconds * 1000 });
        return true;
    }
    async del(key: string) {
        this.data.delete(key);
    }
    async get(key: string) {
        return this.live(key)?.v ?? null;
    }
}

export class UpstashStore implements CounterStore {
    readonly persistent = true;
    constructor(
        private readonly url: string,
        private readonly token: string,
    ) {}

    private async pipeline(commands: (string | number)[][]): Promise<{ result: unknown }[]> {
        const res = await fetch(`${this.url.replace(/\/$/, '')}/pipeline`, {
            method: 'POST',
            headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
            body: JSON.stringify(commands),
            cache: 'no-store',
        });
        if (!res.ok) throw new Error(`Rate-limit store error ${res.status}`);
        return (await res.json()) as { result: unknown }[];
    }
    async incr(key: string, ttlSeconds: number) {
        const [r] = await this.pipeline([
            ['INCR', key],
            ['EXPIRE', key, ttlSeconds, 'NX'],
        ]);
        return Number(r?.result ?? 0);
    }
    async setIfAbsent(key: string, value: string, ttlSeconds: number) {
        const [r] = await this.pipeline([['SET', key, value, 'NX', 'EX', ttlSeconds]]);
        return r?.result === 'OK';
    }
    async del(key: string) {
        await this.pipeline([['DEL', key]]);
    }
    async get(key: string) {
        const [r] = await this.pipeline([['GET', key]]);
        return (r?.result as string | null) ?? null;
    }
}

let memory: MemoryStore | null = null;

export function getCounterStore(env: NodeJS.ProcessEnv = process.env): CounterStore | null {
    if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) return new UpstashStore(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
    if (env.NODE_ENV === 'production') return null;
    memory ??= new MemoryStore();
    return memory;
}

export interface LimitDecision {
    ok: boolean;
    reason?: string;
}

/**
 * Admission control for a new live run: one active run per session, a per-session hourly cap and a
 * global daily cap. `activeTtl` bounds how long a crashed run can block its session.
 */
export async function admitRun(store: CounterStore, sid: string, limits: { perDay: number; perSessionPerHour: number; activeTtl: number }): Promise<LimitDecision> {
    const day = new Date().toISOString().slice(0, 10);
    if (!(await store.setIfAbsent(`active:${sid}`, '1', limits.activeTtl))) return { ok: false, reason: 'A run is already in progress for this session.' };
    // Check the session cap first so one session's rejected attempts cannot use up the global quota.
    if ((await store.incr(`runs:${sid}:hour`, 3600)) > limits.perSessionPerHour) {
        await store.del(`active:${sid}`);
        return { ok: false, reason: 'Too many runs from this session. Try again later.' };
    }
    if ((await store.incr(`runs:global:${day}`, 86_400)) > limits.perDay) {
        await store.del(`active:${sid}`);
        return { ok: false, reason: 'The daily demo limit has been reached.' };
    }
    return { ok: true };
}

export async function releaseRun(store: CounterStore, sid: string): Promise<void> {
    await store.del(`active:${sid}`);
}
