import { getRecord, getRun, TERMINAL } from '@/lib/apify';
import { liveConfig } from '@/lib/config';
import { getCounterStore, releaseRun } from '@/lib/ratelimit';
import { currentSession } from '@/lib/session';
import { verifyRunRef } from '@/lib/signing';
import { summaryView } from '@/lib/summary';

/** Poll a run started by this session. Unknown or foreign references get 404. */
export async function GET(_request: Request, ctx: RouteContext<'/api/runs/[ref]'>) {
    const { ref } = await ctx.params;
    const session = await currentSession();
    const run = verifyRunRef(ref, liveConfig().sessionSecret, session);
    if (!run || !session) return Response.json({ error: 'Run not found.' }, { status: 404 });

    try {
        const info = await getRun(run.runId);
        const terminal = TERMINAL.includes(info.status);
        let summary = null;
        if (terminal) {
            const store = getCounterStore();
            if (store) await releaseRun(store, session.sid);
            summary = summaryView(await getRecord<unknown>(run.storeId, 'RUN_SUMMARY'));
        }
        return Response.json({ status: info.status, statusMessage: info.statusMessage, terminal, startedAt: info.startedAt, finishedAt: info.finishedAt, summary });
    } catch {
        return Response.json({ error: 'Could not read run status.' }, { status: 502 });
    }
}
