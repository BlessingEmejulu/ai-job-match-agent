import { isIP } from 'node:net';

/**
 * Validate a URL that will be shown to users as a link (never fetched by the Actor).
 * Requires HTTPS, a public-looking DNS hostname, no credentials, and no non-default port.
 * IP literals, localhost, and internal/metadata names are rejected.
 */
export function isSafePublicUrl(raw: string | null | undefined): boolean {
    if (!raw) return false;
    let u: URL;
    try {
        u = new URL(raw);
    } catch {
        return false;
    }
    if (u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    if (u.port && u.port !== '443') return false;
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host || isIP(host)) return false;
    if (!host.includes('.')) return false;
    if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/.test(host)) return false;
    if (host === 'metadata.google.internal' || host.startsWith('metadata.')) return false;
    return true;
}
