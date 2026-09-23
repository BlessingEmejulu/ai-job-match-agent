import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Stateless HMAC-signed tokens for the session cookie and for application-owned run references.
 * Pure functions (secret passed in) so they can be unit-tested without Next.js.
 */

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

function mac(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function sign<T extends object>(data: T, secret: string): string {
    if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
    const payload = b64url(JSON.stringify(data));
    return `${payload}.${mac(payload, secret)}`;
}

export function verify<T>(token: string | undefined | null, secret: string): T | null {
    if (!token || !secret) return null;
    const [payload, sig, extra] = token.split('.');
    if (!payload || !sig || extra !== undefined) return null;
    const expected = Buffer.from(mac(payload, secret));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T;
    } catch {
        return null;
    }
}

export interface SessionData {
    sid: string;
    exp: number;
}

export function newSession(ttlSeconds: number, now = Date.now()): SessionData {
    return { sid: randomBytes(16).toString('hex'), exp: now + ttlSeconds * 1000 };
}

export function verifySession(token: string | undefined, secret: string, now = Date.now()): SessionData | null {
    const s = verify<SessionData>(token, secret);
    if (!s || typeof s.sid !== 'string' || typeof s.exp !== 'number' || s.exp < now) return null;
    return s;
}

export interface RunRef {
    /** Apify run id — never returned to the browser in clear form, only inside this signed token. */
    runId: string;
    datasetId: string;
    storeId: string;
    /** Session that started the run. A ref is only usable by the same session. */
    sid: string;
    iat: number;
}

export function verifyRunRef(ref: string, secret: string, session: SessionData | null, maxAgeMs = 6 * 3600_000, now = Date.now()): RunRef | null {
    if (!session) return null;
    const r = verify<RunRef>(ref, secret);
    if (!r || r.sid !== session.sid || typeof r.runId !== 'string' || now - r.iat > maxAgeMs) return null;
    if (![r.runId, r.datasetId, r.storeId].every((id) => /^[A-Za-z0-9]{8,32}$/.test(id))) return null;
    return r;
}

/** Constant-time comparison for the shared access code. */
export function safeEqual(a: string, b: string): boolean {
    const ha = createHmac('sha256', 'cmp').update(a).digest();
    const hb = createHmac('sha256', 'cmp').update(b).digest();
    return timingSafeEqual(ha, hb) && a.length > 0 && b.length > 0;
}
