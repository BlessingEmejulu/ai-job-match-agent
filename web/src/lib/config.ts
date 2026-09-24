import 'server-only';

export const SESSION_COOKIE = 'ajma_session';
export const SESSION_TTL_SECONDS = 2 * 3600;

const intEnv = (name: string, fallback: number, min: number, max: number) => {
    const v = Number(process.env[name]);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback;
};

export function liveConfig() {
    return {
        actorId: process.env.APIFY_ACTOR_ID ?? '',
        sessionSecret: process.env.SESSION_SECRET ?? '',
        maxResults: intEnv('LIVE_MAX_RESULTS', 10, 1, 25),
        // Hard server-side ceiling on what one website run may cost the owner.
        maxTotalChargeUsd: Math.min(Math.max(Number(process.env.LIVE_MAX_TOTAL_CHARGE_USD) || 0.5, 0.01), 2),
        perDay: intEnv('LIVE_MAX_RUNS_PER_DAY', 20, 1, 200),
        perSessionPerHour: 3,
        // Searches are open to anyone, so also cap each network (IP) per hour.
        perIpPerHour: intEnv('LIVE_MAX_RUNS_PER_IP_HOUR', 6, 1, 50),
        timeoutSecs: 180,
        memoryMbytes: 512,
    };
}

export function liveEnabled(): { ok: boolean; missing: string[] } {
    const c = liveConfig();
    const missing = [
        !process.env.APIFY_TOKEN && 'APIFY_TOKEN',
        !c.actorId && 'APIFY_ACTOR_ID',
        c.sessionSecret.length < 32 && 'SESSION_SECRET (32+ chars)',
        // Production refuses live runs without persistent rate limits, so say so up front.
        process.env.NODE_ENV === 'production' && !(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) && 'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN',
    ].filter((x): x is string => Boolean(x));
    return { ok: missing.length === 0, missing };
}

/** Same-origin check for state-changing requests (defence in depth on top of SameSite=Strict). */
export function sameOrigin(request: Request): boolean {
    const origin = request.headers.get('origin');
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    if (!origin || !host) return false;
    try {
        return new URL(origin).host === host;
    } catch {
        return false;
    }
}
