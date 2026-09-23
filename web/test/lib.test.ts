import { describe, expect, it } from 'vitest';

import { buildActorInput } from '@/lib/live-input';
import { safeLink, sanitizeOpportunity } from '@/lib/opportunity';
import { admitRun, MemoryStore, releaseRun } from '@/lib/ratelimit';
import { newSession, safeEqual, sign, verify, verifyRunRef, verifySession } from '@/lib/signing';

const SECRET = 'x'.repeat(40);

describe('signed tokens', () => {
    it('round-trips and rejects tampering', () => {
        const t = sign({ a: 1 }, SECRET);
        expect(verify(t, SECRET)).toEqual({ a: 1 });
        const [p, s] = t.split('.');
        expect(verify(`${p}x.${s}`, SECRET)).toBeNull();
        expect(verify(t, 'y'.repeat(40))).toBeNull();
        expect(verify('garbage', SECRET)).toBeNull();
    });

    it('refuses short secrets', () => {
        expect(() => sign({}, 'short')).toThrow(/32 characters/);
    });

    it('expires sessions', () => {
        const s = newSession(60, 1_000);
        const t = sign(s, SECRET);
        expect(verifySession(t, SECRET, 2_000)?.sid).toBe(s.sid);
        expect(verifySession(t, SECRET, 1_000 + 61_000)).toBeNull();
    });

    it('binds run references to the session that created them', () => {
        const mine = newSession(3600);
        const other = newSession(3600);
        const ref = sign({ runId: 'AbCdEf123456', datasetId: 'DsId12345678', storeId: 'KvId12345678', sid: mine.sid, iat: Date.now() }, SECRET);
        expect(verifyRunRef(ref, SECRET, mine)?.runId).toBe('AbCdEf123456');
        expect(verifyRunRef(ref, SECRET, other)).toBeNull();
        expect(verifyRunRef(ref, SECRET, null)).toBeNull();
        const injected = sign({ runId: '../../users/me', datasetId: 'DsId12345678', storeId: 'KvId12345678', sid: mine.sid, iat: Date.now() }, SECRET);
        expect(verifyRunRef(injected, SECRET, mine)).toBeNull();
    });

    it('compares access codes safely', () => {
        expect(safeEqual('open-sesame', 'open-sesame')).toBe(true);
        expect(safeEqual('open-sesame', 'open-sesamE')).toBe(false);
        expect(safeEqual('', '')).toBe(false);
    });
});

describe('rate and concurrency limits', () => {
    const limits = { perDay: 3, perSessionPerHour: 2, activeTtl: 300 };

    it('allows one active run per session', async () => {
        const store = new MemoryStore();
        expect((await admitRun(store, 's1', limits)).ok).toBe(true);
        expect(await admitRun(store, 's1', limits)).toMatchObject({ ok: false, reason: expect.stringMatching(/already in progress/) });
        await releaseRun(store, 's1');
        expect((await admitRun(store, 's1', limits)).ok).toBe(true);
    });

    it('enforces per-session and global caps', async () => {
        const store = new MemoryStore();
        for (let i = 0; i < 2; i++) {
            expect((await admitRun(store, 'a', limits)).ok).toBe(true);
            await releaseRun(store, 'a');
        }
        expect((await admitRun(store, 'a', limits)).ok).toBe(false);
        expect((await admitRun(store, 'b', limits)).ok).toBe(true); // 3rd global
        await releaseRun(store, 'b');
        expect(await admitRun(store, 'c', limits)).toMatchObject({ ok: false, reason: expect.stringMatching(/daily/) });
    });
});

describe('live form → Actor input', () => {
    it('uses discover mode without a full profile and caps limits server-side', () => {
        const r = buildActorInput({ roleKeywords: 'data analyst, intern', countries: 'ng, ke' }, { maxResults: 10 });
        expect(r.ok && r.mode).toBe('discover');
        if (!r.ok) return;
        expect(r.input).toMatchObject({ countries: ['NG', 'KE'], roleKeywords: ['data analyst', 'intern'], maxResults: 10, maxRequests: 40, ai: { enabled: false, maxAnalyses: 0 } });
        expect(r.input.candidateProfile).toBeUndefined();
    });

    it('uses match mode with minimal profile fields', () => {
        const r = buildActorInput({ roleKeywords: 'analyst', countries: 'NG', skills: 'SQL, Excel', yearsExperience: '1', candidateCountry: 'ng', studentStatus: 'graduated' }, { maxResults: 99 });
        expect(r.ok && r.mode).toBe('match');
        if (!r.ok) return;
        expect(r.input.maxResults).toBe(25);
        expect(r.input.candidateProfile).toEqual({ skills: ['SQL', 'Excel'], yearsExperience: 1, desiredRoles: ['analyst'], country: 'NG', studentStatus: 'graduated' });
    });

    it('rejects unknown fields (no way to enable AI or raise limits from the browser)', () => {
        expect(buildActorInput({ countries: 'NG', maxResults: 100 }, { maxResults: 10 }).ok).toBe(false);
        expect(buildActorInput({ countries: 'NG', ai: { enabled: true } }, { maxResults: 10 }).ok).toBe(false);
        expect(buildActorInput({ countries: 'Nigeria' }, { maxResults: 10 }).ok).toBe(false);
        expect(buildActorInput(null, { maxResults: 10 }).ok).toBe(false);
    });
});

describe('sanitizing dataset records for the browser', () => {
    it('keeps approved HTTPS job links only', () => {
        expect(safeLink('https://jobs.lever.co/dlocal/abc')).toBe('https://jobs.lever.co/dlocal/abc');
        expect(safeLink('javascript:alert(1)')).toBeNull();
        expect(safeLink('http://jobs.lever.co/x')).toBeNull();
        expect(safeLink('https://evil.example.com/phish')).toBeNull();
        expect(safeLink('https://user:pw@jobs.lever.co/x')).toBeNull();
    });

    it('whitelists fields and caps strings', () => {
        const v = sanitizeOpportunity({
            jobId: 'j1',
            title: 'T'.repeat(1000),
            company: 'Co',
            applicationUrl: 'https://evil.example.com',
            geographicEligibility: { status: 'hacked', summary: 's' },
            secretField: 'should not pass',
            match: { status: 'scored', score: 70, evidenceCoverage: 0.9, suggestedNextSteps: ['a', 'b', 'c'] },
        });
        expect(v).not.toBeNull();
        expect(v!.title).toHaveLength(200);
        expect(v!.applicationUrl).toBeNull();
        expect(v!.eligibility).toBe('unknown');
        expect(JSON.stringify(v)).not.toContain('should not pass');
        expect(v!.match!.suggestedNextSteps).toHaveLength(2);
    });

    it('drops records without an id or title', () => {
        expect(sanitizeOpportunity({ title: 'x' })).toBeNull();
        expect(sanitizeOpportunity('string')).toBeNull();
    });
});
