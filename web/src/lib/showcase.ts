import 'server-only';

import snapshot from '@/data/showcase-snapshot.json';

import { getDatasetInfo, getDatasetItems } from './apify';
import { type OpportunityView, sanitizeList } from './opportunity';

export interface Showcase {
    items: OpportunityView[];
    /** Honest provenance line shown above the results. */
    provenance: string;
    runAt: string | null;
    kind: 'apify_dataset' | 'bundled_snapshot';
}

/**
 * Public, read-only showcase. Uses a configured discover-mode dataset (no candidate data) from the
 * owner's account, cached for an hour; otherwise the dated snapshot bundled with the site. Neither
 * is presented as a live run.
 */
export async function loadShowcase(): Promise<Showcase> {
    const datasetId = process.env.APIFY_SHOWCASE_DATASET_ID;
    if (datasetId && process.env.APIFY_TOKEN && /^[A-Za-z0-9]{8,32}$/.test(datasetId)) {
        try {
            const [info, raw] = await Promise.all([getDatasetInfo(datasetId, 3600), getDatasetItems(datasetId, 0, 100, 3600)]);
            const items = sanitizeList(raw).map((i) => ({ ...i, match: null }));
            return { items, runAt: info.modifiedAt, kind: 'apify_dataset', provenance: 'Results of an earlier discover-mode Actor run on Apify' };
        } catch {
            // fall through to the bundled snapshot
        }
    }
    return {
        items: sanitizeList(snapshot.items).map((i) => ({ ...i, match: null })),
        runAt: snapshot.runStartedAt,
        kind: 'bundled_snapshot',
        provenance: `${snapshot.label}, ${snapshot.runner}`,
    };
}
