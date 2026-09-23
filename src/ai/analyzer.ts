import { createHash } from 'node:crypto';

import { truncate } from '../normalization/text.js';
import type { AiProvider } from './provider.js';
import { groundAiResult, type GroundedAiResult } from './validate.js';

export const AI_MAX_INPUT_CHARS = 8_000;

export interface AiUsage {
    enabled: boolean;
    provider: string | null;
    disabledReason: string | null;
    maxAnalyses: number;
    attempted: number;
    succeeded: number;
    failed: number;
    cacheHits: number;
    groundedItemsAdded: number;
    ungroundedItemsDropped: number;
    inputsTruncated: number;
    errors: string[];
}

/**
 * Bounded AI step: at most `maxAnalyses` provider calls per run, a per-call timeout, one bounded
 * retry at the SDK level, an in-run cache keyed by content hash, and a deterministic fallback
 * (the caller simply keeps the rules-only result) on any failure.
 */
export class BoundedAiAnalyzer {
    readonly usage: AiUsage;
    private readonly cache = new Map<string, GroundedAiResult>();

    constructor(
        private readonly provider: AiProvider | null,
        maxAnalyses: number,
        disabledReason: string | null,
        private readonly timeoutMs = 45_000,
        private readonly now: () => number = Date.now,
    ) {
        this.usage = {
            enabled: provider !== null && maxAnalyses > 0,
            provider: provider?.name ?? null,
            disabledReason: provider ? (maxAnalyses > 0 ? null : 'ai.maxAnalyses is 0') : disabledReason,
            maxAnalyses,
            attempted: 0,
            succeeded: 0,
            failed: 0,
            cacheHits: 0,
            groundedItemsAdded: 0,
            ungroundedItemsDropped: 0,
            inputsTruncated: 0,
            errors: [],
        };
    }

    get remaining(): number {
        return this.usage.enabled ? Math.max(0, this.usage.maxAnalyses - this.usage.attempted) : 0;
    }

    /** Returns grounded additions, or null when AI is unavailable, over budget, or failed. */
    async analyze(title: string, fullText: string, deadlineMs: number): Promise<{ result: GroundedAiResult; truncated: boolean } | null> {
        if (!this.provider || !this.usage.enabled) return null;
        const truncated = fullText.length > AI_MAX_INPUT_CHARS;
        const text = truncated ? truncate(fullText, AI_MAX_INPUT_CHARS) : fullText;
        const key = createHash('sha256').update(`${title}\n${text}`).digest('hex');
        const cached = this.cache.get(key);
        if (cached) {
            this.usage.cacheHits++;
            return { result: cached, truncated };
        }
        if (this.remaining <= 0) return null;
        const timeLeft = deadlineMs - this.now();
        if (timeLeft < 10_000) return null;

        this.usage.attempted++;
        if (truncated) this.usage.inputsTruncated++;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, timeLeft - 5_000));
        try {
            const raw = await this.provider.extract({ title: truncate(title, 200), text }, controller.signal);
            const grounded = groundAiResult(raw, text);
            this.usage.succeeded++;
            this.usage.ungroundedItemsDropped += grounded.dropped;
            this.cache.set(key, grounded);
            return { result: grounded, truncated };
        } catch (err) {
            this.usage.failed++;
            const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
            if (this.usage.errors.length < 5) this.usage.errors.push(truncate(msg.replace(/sk-[A-Za-z0-9_-]{8,}/g, '[redacted]'), 200));
            return null;
        } finally {
            clearTimeout(timer);
        }
    }
}
