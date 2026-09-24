import { beforeEach, describe, expect, it, vi } from 'vitest';

import { newSession, sign } from '@/lib/signing';

// ---- mocks: cookies() and the Apify API client (no network) ----
const cookieJar = new Map<string, string>();
vi.mock('next/headers', () => ({
    cookies: async () => ({
        get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
        set: (name: string, value: string) => cookieJar.set(name, value),
        delete: (name: string) => cookieJar.delete(name),
    }),
}));

const startRun = vi.fn();
const getRun = vi.fn();
const getDatasetItems = vi.fn();
const getRecord = vi.fn();
vi.mock('@/lib/apify', () => ({
    TERMINAL: ['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'],
    startRun: (...a: unknown[]) => startRun(...a),
    getRun: (...a: unknown[]) => getRun(...a),
    getDatasetItems: (...a: unknown[]) => getDatasetItems(...a),
    getRecord: (...a: unknown[]) => getRecord(...a),
}));

const SECRET = 's'.repeat(48);
const TOKEN = 'apify_api_TESTTOKENSHOULDNEVERLEAK000000';

function req(url: string, init: RequestInit & { origin?: string } = {}) {
    const headers = new Headers(init.headers);
    headers.set('host', 'demo.example');
    if (init.origin !== undefined) headers.set('origin', init.origin);
    return new Request(`https://demo.example${url}`, { ...init, headers });
}
const ctx = (ref: string) => ({ params: Promise.resolve({ ref }) }) as never;

function login() {
    const s = newSession(3600);
    cookieJar.set('ajma_session', sign(s, SECRET));
    return s;
}

beforeEach(() => {
    vi.resetModules();
    cookieJar.clear();
    startRun.mockReset();
    getRun.mockReset();
    getDatasetItems.mockReset();
    getRecord.mockReset();
    Object.assign(process.env, {
        APIFY_TOKEN: TOKEN,
        APIFY_ACTOR_ID: 'someone~ai-job-match-agent',
        SESSION_SECRET: SECRET,
        LIVE_MAX_RESULTS: '10',
        LIVE_MAX_TOTAL_CHARGE_USD: '0.25',
    });
});

describe('POST /api/runs', () => {
    it('lets a first-time visitor search and binds the run to a new secure session', async () => {
        startRun.mockResolvedValue({ id: 'RunId1234567', status: 'READY', defaultDatasetId: 'DsId12345678', defaultKeyValueStoreId: 'KvId12345678' });
        const { POST } = await import('@/app/api/runs/route');
        expect(cookieJar.size).toBe(0);
        const res = await POST(req('/api/runs', { method: 'POST', origin: 'https://demo.example', body: JSON.stringify({ countries: 'NG' }) }));
        expect(res.status).toBe(200);
        expect(cookieJar.get('ajma_session')).toBeTruthy();
        // The returned reference only works for the session that was just created.
        const { ref } = await res.json();
        const status = await import('@/app/api/runs/[ref]/route');
        getRun.mockResolvedValue({ id: 'RunId1234567', status: 'RUNNING', statusMessage: null, defaultDatasetId: 'DsId12345678', defaultKeyValueStoreId: 'KvId12345678' });
        expect((await status.GET(req('/api/runs/x'), ctx(ref))).status).toBe(200);
        cookieJar.set('ajma_session', sign(newSession(3600), SECRET));
        expect((await status.GET(req('/api/runs/x'), ctx(ref))).status).toBe(404);
    });

    it('limits searches per network even when the visitor clears cookies', async () => {
        process.env.LIVE_MAX_RUNS_PER_IP_HOUR = '2';
        startRun.mockResolvedValue({ id: 'RunId1234567', status: 'READY', defaultDatasetId: 'DsId12345678', defaultKeyValueStoreId: 'KvId12345678' });
        const { POST } = await import('@/app/api/runs/route');
        const fromIp = () => POST(req('/api/runs', { method: 'POST', origin: 'https://demo.example', headers: { 'x-forwarded-for': '203.0.113.7' }, body: JSON.stringify({ countries: 'NG' }) }));
        for (let i = 0; i < 2; i++) {
            cookieJar.clear();
            expect((await fromIp()).status).toBe(200);
        }
        cookieJar.clear();
        const third = await fromIp();
        expect(third.status).toBe(429);
        expect((await third.json()).error).toMatch(/network/);
        delete process.env.LIVE_MAX_RUNS_PER_IP_HOUR;
    });

    it('refuses cross-origin requests even with a session', async () => {
        login();
        const { POST } = await import('@/app/api/runs/route');
        const res = await POST(req('/api/runs', { method: 'POST', origin: 'https://evil.example', body: JSON.stringify({ countries: 'NG' }) }));
        expect(res.status).toBe(403);
    });

    it('starts a capped run and returns only an opaque reference', async () => {
        login();
        startRun.mockResolvedValue({ id: 'RunId1234567', status: 'READY', defaultDatasetId: 'DsId12345678', defaultKeyValueStoreId: 'KvId12345678' });
        const { POST } = await import('@/app/api/runs/route');
        const res = await POST(req('/api/runs', { method: 'POST', origin: 'https://demo.example', body: JSON.stringify({ countries: 'NG', roleKeywords: 'analyst' }) }));
        expect(res.status).toBe(200);
        const body = await res.json();
        const text = JSON.stringify(body);
        expect(text).not.toContain('RunId1234567');
        expect(text).not.toContain('DsId12345678');
        expect(text).not.toContain(TOKEN);
        const [actorId, input, opts] = startRun.mock.calls[0]!;
        expect(actorId).toBe('someone~ai-job-match-agent');
        expect(input).toMatchObject({ maxResults: 10, ai: { enabled: false } });
        expect(opts).toMatchObject({ maxTotalChargeUsd: 0.25 });

        // A second run while the first is active is refused.
        const again = await POST(req('/api/runs', { method: 'POST', origin: 'https://demo.example', body: JSON.stringify({ countries: 'NG' }) }));
        expect(again.status).toBe(429);
    });
});

describe('GET /api/runs/[ref] and items', () => {
    async function startedRef() {
        const s = login();
        return { s, ref: sign({ runId: 'RunId1234567', datasetId: 'DsId12345678', storeId: 'KvId12345678', sid: s.sid, iat: Date.now() }, SECRET) };
    }

    it('returns status for the owner session and hides the raw ids', async () => {
        const { ref } = await startedRef();
        getRun.mockResolvedValue({ id: 'RunId1234567', status: 'SUCCEEDED', statusMessage: 'done', defaultDatasetId: 'DsId12345678', defaultKeyValueStoreId: 'KvId12345678' });
        getRecord.mockResolvedValue({ outcome: 'results_delivered', counts: { opportunitiesDelivered: 3 }, input: { candidateProfileProvided: true } });
        const { GET } = await import('@/app/api/runs/[ref]/route');
        const res = await GET(req(`/api/runs/${ref}`), ctx(ref));
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body).toMatchObject({ status: 'SUCCEEDED', terminal: true, summary: { outcome: 'results_delivered', delivered: 3 } });
        expect(JSON.stringify(body)).not.toContain('candidateProfileProvided');
    });

    it('returns 404 for another session, a tampered reference, or no session', async () => {
        const { ref } = await startedRef();
        const { GET } = await import('@/app/api/runs/[ref]/route');
        const items = await import('@/app/api/runs/[ref]/items/route');

        cookieJar.set('ajma_session', sign(newSession(3600), SECRET)); // different visitor
        expect((await GET(req(`/api/runs/${ref}`), ctx(ref))).status).toBe(404);
        expect((await items.GET(req(`/api/runs/${ref}/items`), ctx(ref))).status).toBe(404);

        cookieJar.clear();
        expect((await GET(req(`/api/runs/${ref}`), ctx(ref))).status).toBe(404);

        const forged = ref.slice(0, -2) + 'AA';
        login();
        expect((await GET(req(`/api/runs/${forged}`), ctx(forged))).status).toBe(404);
        expect(getRun).not.toHaveBeenCalled();
        expect(getDatasetItems).not.toHaveBeenCalled();
    });

    it('serves sanitized, paginated items', async () => {
        const { ref } = await startedRef();
        getDatasetItems.mockResolvedValue([{ jobId: 'j1', title: 'Analyst', applicationUrl: 'javascript:alert(1)', geographicEligibility: { status: 'unknown' } }]);
        const { GET } = await import('@/app/api/runs/[ref]/items/route');
        const res = await GET(req(`/api/runs/${ref}/items?offset=5000`), ctx(ref));
        const body = await res.json();
        expect(getDatasetItems).toHaveBeenCalledWith('DsId12345678', 1000, 20);
        expect(body.items[0]).toMatchObject({ jobId: 'j1', applicationUrl: null });
    });
});
