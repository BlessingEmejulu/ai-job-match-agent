// LOCAL DEVELOPMENT ONLY. A stand-in for the few Apify API endpoints the website uses, backed by
// the REAL compiled Actor (../dist/main.js) reading the REAL job boards. Lets you test the live-run
// flow end to end without an Apify token. Never used in production (see src/lib/apify.ts).
//
//   (cd .. && npm run build) && node scripts/mock-apify.mjs          # listens on :8787
//   APIFY_API_BASE_URL=http://localhost:8787/v2 npm run dev
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const actorMain = resolve(here, '../../dist/main.js');
const root = resolve(here, '../.mock-apify');
const PORT = Number(process.env.MOCK_APIFY_PORT ?? 8787);
if (!existsSync(actorMain)) {
    console.error(`Build the Actor first: ${actorMain} not found (run \`npm run build\` in the repo root).`);
    process.exit(1);
}

const runs = new Map(); // runId -> { status, statusMessage, startedAt, finishedAt, dir }
const id = () => randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x').slice(0, 12);
const json = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
};
const runView = (runId, r) => ({
    id: runId,
    status: r.status,
    statusMessage: r.statusMessage,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    defaultDatasetId: `ds${runId}`,
    defaultKeyValueStoreId: `kv${runId}`,
});
const dirFor = (storageId) => [...runs.entries()].find(([rid]) => storageId.slice(2) === rid)?.[1]?.dir;

createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (!/^Bearer .+/.test(req.headers.authorization ?? '')) return json(res, 401, { error: { type: 'token-not-provided' } });

    let m;
    if (req.method === 'POST' && (m = url.pathname.match(/^\/v2\/acts\/([^/]+)\/runs$/))) {
        let body = '';
        for await (const chunk of req) body += chunk;
        const runId = id();
        const dir = join(root, runId);
        mkdirSync(join(dir, 'key_value_stores/default'), { recursive: true });
        writeFileSync(join(dir, 'key_value_stores/default/INPUT.json'), body || '{}');
        const r = { status: 'READY', statusMessage: null, startedAt: new Date().toISOString(), finishedAt: null, dir };
        runs.set(runId, r);
        const child = spawn(process.execPath, [actorMain], {
            env: { ...process.env, CRAWLEE_STORAGE_DIR: dir, ACTOR_MAX_TOTAL_CHARGE_USD: url.searchParams.get('maxTotalChargeUsd') ?? '' },
        });
        r.status = 'RUNNING';
        const onLine = (buf) => {
            for (const line of buf.toString().split('\n')) {
                const s = line.replace(/\x1b\[[0-9;]*m/g, '').match(/\[Status message\]: (.*)$/);
                if (s) r.statusMessage = s[1].trim();
            }
        };
        child.stdout.on('data', onLine);
        child.stderr.on('data', onLine);
        child.on('exit', (code) => {
            r.status = code === 0 ? 'SUCCEEDED' : 'FAILED';
            r.finishedAt = new Date().toISOString();
        });
        console.log(`run ${runId} started for ${decodeURIComponent(m[1])}`);
        return json(res, 201, { data: runView(runId, r) });
    }
    if (req.method === 'GET' && (m = url.pathname.match(/^\/v2\/actor-runs\/([^/]+)$/))) {
        const r = runs.get(m[1]);
        return r ? json(res, 200, { data: runView(m[1], r) }) : json(res, 404, {});
    }
    if (req.method === 'GET' && (m = url.pathname.match(/^\/v2\/datasets\/([^/]+)\/items$/))) {
        const dir = dirFor(m[1]);
        if (!dir) return json(res, 404, {});
        const ds = join(dir, 'datasets/default');
        const files = existsSync(ds) ? readdirSync(ds).filter((f) => f.endsWith('.json')).sort() : [];
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? 100);
        return json(res, 200, files.slice(offset, offset + limit).map((f) => JSON.parse(readFileSync(join(ds, f), 'utf8'))));
    }
    if (req.method === 'GET' && (m = url.pathname.match(/^\/v2\/key-value-stores\/([^/]+)\/records\/([^/]+)$/))) {
        const dir = dirFor(m[1]);
        const file = dir && join(dir, 'key_value_stores/default', `${m[2]}.json`);
        return file && existsSync(file) ? json(res, 200, JSON.parse(readFileSync(file, 'utf8'))) : json(res, 404, {});
    }
    return json(res, 404, { error: 'not mocked' });
}).listen(PORT, () => console.log(`Mock Apify API on http://localhost:${PORT}/v2 (runs the real Actor)`));
