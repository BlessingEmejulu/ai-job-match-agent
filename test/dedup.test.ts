import { describe, expect, it } from 'vitest';

import { canonicalUrl, Deduplicator } from '../src/dedup/index.js';

const base = { sourceId: 'greenhouse:a', sourceJobId: '1', applyUrl: 'https://job-boards.greenhouse.io/a/jobs/1', company: 'Fixture Co', title: 'Data Analyst', locationText: 'Lagos, Nigeria' };

describe('deduplication', () => {
    it('removes tracking parameters but keeps functional ones', () => {
        expect(canonicalUrl('https://www.zipline.com/open-roles/7?gh_jid=7&utm_source=x&gh_src=abc#top')).toBe('https://www.zipline.com/open-roles/7?gh_jid=7');
        expect(canonicalUrl('https://jobs.lever.co/x/abc/apply?lever-source=LinkedIn')).toBe('https://jobs.lever.co/x/abc');
        expect(canonicalUrl('not a url')).toBeNull();
    });

    it('detects same source + id', () => {
        const d = new Deduplicator();
        expect(d.checkAndAdd(base).duplicate).toBe(false);
        expect(d.checkAndAdd({ ...base })).toMatchObject({ duplicate: true, matchedOn: 'source_id' });
    });

    it('detects cross-source duplicates by canonical application URL', () => {
        const d = new Deduplicator();
        d.checkAndAdd(base);
        const other = { ...base, sourceId: 'lever:b', sourceJobId: 'zzz', title: 'Data Analyst II', applyUrl: `${base.applyUrl}?utm_campaign=x` };
        expect(d.checkAndAdd(other)).toMatchObject({ duplicate: true, matchedOn: 'application_url', duplicateOf: 'id:greenhouse:a:1' });
    });

    it('detects identical company/title/location', () => {
        const d = new Deduplicator();
        d.checkAndAdd(base);
        expect(d.checkAndAdd({ ...base, sourceJobId: '2', applyUrl: 'https://job-boards.greenhouse.io/a/jobs/2' })).toMatchObject({ duplicate: true, matchedOn: 'company_title_location' });
    });

    it('does not merge the same title in different locations', () => {
        const d = new Deduplicator();
        d.checkAndAdd(base);
        expect(d.checkAndAdd({ ...base, sourceJobId: '3', applyUrl: 'https://job-boards.greenhouse.io/a/jobs/3', locationText: 'Nairobi, Kenya' }).duplicate).toBe(false);
    });

    it('is safe against concurrent callers (check-and-add is atomic)', async () => {
        const d = new Deduplicator();
        const results = await Promise.all(Array.from({ length: 20 }, async () => d.checkAndAdd(base)));
        expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    });
});
