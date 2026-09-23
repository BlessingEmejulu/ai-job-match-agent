import { startRun } from '@/lib/apify';
import { liveConfig, liveEnabled, sameOrigin } from '@/lib/config';
import { buildActorInput } from '@/lib/live-input';
import { admitRun, getCounterStore, releaseRun } from '@/lib/ratelimit';
import { currentSession } from '@/lib/session';
import { sign } from '@/lib/signing';

/**
 * Start a live Actor run on behalf of an authenticated session. Returns an application-owned,
 * signed run reference bound to the session — never the raw Apify run or dataset id.
 */
export async function POST(request: Request) {
    if (!liveEnabled().ok) return Response.json({ error: 'Live runs are not configured on this deployment.' }, { status: 503 });
    if (!sameOrigin(request)) return Response.json({ error: 'Cross-origin request refused.' }, { status: 403 });
    const session = await currentSession();
    if (!session) return Response.json({ error: 'Sign in with the access code first.' }, { status: 401 });
    const store = getCounterStore();
    if (!store) return Response.json({ error: 'Rate limiting is not configured; live runs are disabled.' }, { status: 503 });

    const cfg = liveConfig();
    const built = buildActorInput(await request.json().catch(() => null), { maxResults: cfg.maxResults });
    if (!built.ok) return Response.json({ error: built.error }, { status: 400 });

    const admitted = await admitRun(store, session.sid, { perDay: cfg.perDay, perSessionPerHour: cfg.perSessionPerHour, activeTtl: cfg.timeoutSecs + 60 });
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
        return Response.json({ error: 'Could not start the run. Please try again later.' }, { status: 502 });
    }
}
