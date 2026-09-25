import { Actor, log } from 'apify';

import { AnthropicProvider } from './ai/anthropic.js';
import type { AiProvider } from './ai/provider.js';
import { type DeliveryPort, DeliveryQueue } from './billing/delivery.js';
import { type RunSummary, runPipeline } from './pipeline/run.js';
import { UnknownSourceError } from './pipeline/sources.js';
import { type ActorInput, InputValidationError, parseInput } from './schemas/input.js';

const SUMMARY_KEY = 'RUN_SUMMARY';
const STATE_KEY = 'DELIVERY_STATE';

await Actor.init();

let input: ActorInput;
try {
    input = parseInput(await Actor.getInput());
} catch (err) {
    const issues = err instanceof InputValidationError ? err.issues : [(err as Error).message];
    await Actor.setValue(SUMMARY_KEY, {
        summaryVersion: '1.0',
        outcome: 'input_invalid',
        issues,
        runFinishedAt: new Date().toISOString(),
    });
    await Actor.fail(`Invalid input: ${issues.join('; ')}`);
    throw err; // Actor.fail exits the process; this line only satisfies the type checker.
}

// Restart/migration support: records already delivered in this run are never pushed or billed again.
const previous = (await Actor.getValue<{ deliveredJobIds?: string[] }>(STATE_KEY))?.deliveredJobIds ?? [];
if (previous.length) log.info(`Resuming run: ${previous.length} opportunity(ies) were already delivered before a restart.`);

const charging = Actor.getChargingManager();
const port: DeliveryPort = {
    isPayPerEvent: () => charging.getPricingInfo().isPayPerEvent,
    maxChargeableEvents: (event) => charging.calculateMaxEventChargeCountWithinLimit(event),
    // On the platform the SDK's ChargeResult also counts its synthetic dataset-item event, so the
    // billed count for our event is taken from the ChargingManager's per-event counter instead.
    pushData: async (record, event) => {
        const before = charging.getChargedEventCount(event);
        const result = await Actor.pushData(record, event);
        return { ...result, chargedCount: charging.getChargedEventCount(event) - before };
    },
    saveDeliveredIds: (ids) => Actor.setValue(STATE_KEY, { deliveredJobIds: ids }),
};
const delivery = new DeliveryQueue(port, previous);

let aiProvider: AiProvider | null = null;
let aiDisabledReason: string | null = null;
if (input.ai.enabled) {
    // AI calls are paid by the Actor owner's Anthropic key, so the owner caps them per run.
    // Unset or 0 means AI is off for every caller, whatever the input says.
    const ownerCap = Math.max(0, Math.floor(Number(process.env.AI_MAX_ANALYSES_CAP ?? '0')) || 0);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) aiDisabledReason = 'ANTHROPIC_API_KEY is not configured; using rules-only analysis';
    else if (ownerCap === 0) aiDisabledReason = 'AI is disabled by the Actor owner (AI_MAX_ANALYSES_CAP is 0 or unset); using rules-only analysis';
    else {
        aiProvider = new AnthropicProvider({ apiKey, model: process.env.ANTHROPIC_MODEL || undefined });
        if (input.ai.maxAnalyses > ownerCap) log.info(`AI analyses capped at ${ownerCap} by the Actor owner.`);
        input = { ...input, ai: { ...input.ai, maxAnalyses: Math.min(input.ai.maxAnalyses, ownerCap) } };
    }
    if (aiDisabledReason) log.warning(aiDisabledReason);
}

log.info(`Mode: ${input.mode}. Countries: ${input.countries.join(', ')}. Limits: ${input.maxResults} results, ${input.maxRequests} requests, ${input.maxRuntimeSeconds}s.`);
await Actor.setStatusMessage('Stage 1/4 · Starting: choosing the most relevant verified employer boards');

let summary: RunSummary;
try {
    summary = await runPipeline(input, {
        now: () => new Date(),
        aiProvider,
        aiDisabledReason,
        delivery,
        // Fire-and-forget: status messages give live progress to Console and the website.
        progress: (message) => void Actor.setStatusMessage(message).catch(() => undefined),
        log: { info: (m, d) => log.info(m, d), warning: (m, d) => log.warning(m, d) },
    });
} catch (err) {
    if (err instanceof UnknownSourceError) {
        await Actor.setValue(SUMMARY_KEY, { summaryVersion: '1.0', outcome: 'input_invalid', issues: [err.message] });
        await Actor.fail(err.message);
    }
    throw err;
}

await Actor.setValue(SUMMARY_KEY, summary);
const msg = `${summary.counts.opportunitiesDelivered} opportunities delivered · outcome: ${summary.outcome} · stop: ${summary.stopReason}`;

if (summary.outcome === 'total_source_failure') {
    // Never present a total source failure as an empty success.
    await Actor.fail(`All sources failed. ${summary.sources.reports.map((r) => `${r.id}: ${r.error}`).join(' | ')}`);
} else {
    await Actor.setStatusMessage(msg, { isStatusMessageTerminal: true });
    await Actor.exit(msg);
}
