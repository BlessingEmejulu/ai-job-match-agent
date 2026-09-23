import { getDatasetItems } from '@/lib/apify';
import { liveConfig } from '@/lib/config';
import { sanitizeList } from '@/lib/opportunity';
import { currentSession } from '@/lib/session';
import { verifyRunRef } from '@/lib/signing';

const PAGE = 20;

/** Paginated, sanitized results of a run started by this session. */
export async function GET(request: Request, ctx: RouteContext<'/api/runs/[ref]/items'>) {
    const { ref } = await ctx.params;
    const run = verifyRunRef(ref, liveConfig().sessionSecret, await currentSession());
    if (!run) return Response.json({ error: 'Run not found.' }, { status: 404 });

    const offset = Math.max(0, Math.min(1000, Number(new URL(request.url).searchParams.get('offset')) || 0));
    try {
        const raw = await getDatasetItems(run.datasetId, offset, PAGE);
        return Response.json({ items: sanitizeList(raw), offset, hasMore: raw.length === PAGE });
    } catch {
        return Response.json({ error: 'Could not read results.' }, { status: 502 });
    }
}
