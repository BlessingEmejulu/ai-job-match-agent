import { cookies } from 'next/headers';

import { startRun } from '@/lib/apify';
import { liveConfig, liveEnabled, sameOrigin, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/config';
import { buildActorInput } from '@/lib/live-input';
import { admitRun, getCounterStore, releaseRun } from '@/lib/ratelimit';
import { currentSession } from '@/lib/session';
import { newSession, sign } from '@/lib/signing';

/**
 * Start a live Actor run. Open to any visitor: a signed session cookie is created on the first
 * search, and it binds the returned run reference to this browser, so visitors can only read their
 * own runs. Spending is bounded by per-network, per-session and daily caps plus a per-run cost cap.
 */
export async function POST(request: Request) {
    if (!liveEnabled().ok) return Response.json({ error: 'Live search is not configured on this deployment.' }, { status: 503 });
    if (!sameOrigin(request)) return Response.json({ error: 'Cross-origin request refused.' }, { status: 403 });
    const store = getCounterStore();
    if (!store) return Response.json({ error: 'Rate limiting is not configured; live search is disabled.' }, { status: 503 });

    const cfg = liveConfig();
    const built = buildActorInput(await request.json().catch(() => null), { maxResults: cfg.maxResults });
    if (!built.ok) return Response.json({ error: built.error }, { status: 400 });

    let session = await currentSession();
    if (!session) {
        session = newSession(SESSION_TTL_SECONDS);
        (await cookies()).set(SESSION_COOKIE, sign(session, cfg.sessionSecret), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: SESSION_TTL_SECONDS,
        });
    }

    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0]!.trim().slice(0, 64);
    const admitted = await admitRun(
        store,
        session.sid,
        { perDay: cfg.perDay, perSessionPerHour: cfg.perSessionPerHour, perIpPerHour: cfg.perIpPerHour, activeTtl: cfg.timeoutSecs + 60 },
        ip,
    );
    if (!admitted.ok) return Response.json({ error: admitted.reason }, { status: 429 });

    try {
        const run = await startRun(cfg.actorId, built.input, {
            maxTotalChargeUsd: cfg.maxTotalChargeUsd,
            timeoutSecs: cfg.timeoutSecs,
            memoryMbytes: cfg.memoryMbytes,
        });
        const ref = sign({ runId: run.id, datasetId: run.defaultDatasetId, storeId: run.defaultKeyValueStoreId, sid: session.sid, iat: Date.now() }, cfg.sessionSecret);
        return Response.json({ ref, mode: built.mode, status: run.status });
    } catch {
        await releaseRun(store, session.sid);
        return Response.json({ error: 'Could not start the search. Please try again in a moment.' }, { status: 502 });
    }
}
