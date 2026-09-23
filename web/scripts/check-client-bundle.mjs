// Fails if any server secret (by value) appears in the browser bundle. Run after `next build`
// with the same environment variables used for the build.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SECRETS = ['APIFY_TOKEN', 'SESSION_SECRET', 'LIVE_ACCESS_CODE', 'UPSTASH_REDIS_REST_TOKEN', 'ANTHROPIC_API_KEY'];
const values = SECRETS.map((k) => [k, process.env[k]]).filter(([, v]) => v && v.length >= 8);
if (!values.length) {
    console.error('Set at least one secret env var (e.g. a fake APIFY_TOKEN) before building and checking.');
    process.exit(2);
}

const files = [];
const walk = (dir) => {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(js|css|html|json|txt|map)$/.test(name)) files.push(p);
    }
};
walk('.next/static');

let leaks = 0;
for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const [k, v] of values) {
        if (text.includes(v)) {
            console.error(`LEAK: value of ${k} found in ${f}`);
            leaks++;
        }
    }
}
console.log(`Scanned ${files.length} client files for ${values.length} secret value(s): ${leaks ? `${leaks} leak(s)` : 'no leaks'}.`);
process.exit(leaks ? 1 : 0);
