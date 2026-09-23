/**
 * Pay-per-event delivery.
 *
 * Billable event: `opportunity-delivered` — one unique, validated opportunity written to the
 * default dataset in this run, including any enabled analysis. It is charged through the SDK's
 * event-aware write `Actor.pushData(record, 'opportunity-delivered')`; nothing else charges it.
 *
 * Deliveries are serialized (one at a time) so the budget check, the write, and the state update
 * cannot interleave. Duplicates, invalid records, failed fetches and failed AI calls never reach
 * this module, so they are never billed as deliveries.
 */

export const DELIVERY_EVENT = 'opportunity-delivered';

export interface ChargeResultLike {
    eventChargeLimitReached: boolean;
    chargedCount: number;
    chargeableWithinLimit: Record<string, number>;
}

/** Thin port over the Apify SDK so the logic is testable without the platform. */
export interface DeliveryPort {
    isPayPerEvent(): boolean;
    /** How many more events of this type fit in the user's max-charge budget (Infinity if unlimited). */
    maxChargeableEvents(eventName: string): number;
    pushData(record: Record<string, unknown>, eventName: string): Promise<ChargeResultLike>;
    /** Persist ids of delivered records (for migration/restart). */
    saveDeliveredIds(ids: string[]): Promise<void>;
}

export interface DeliveryReport {
    attempted: number;
    delivered: number;
    billedEvents: number;
    skippedAlreadyDeliveredInThisRun: number;
    notDeliveredBudget: number;
    stoppedByChargeLimit: boolean;
    payPerEvent: boolean;
    errors: string[];
}

export class DeliveryQueue {
    private readonly delivered: Set<string>;
    private chain: Promise<unknown> = Promise.resolve();
    private stopped = false;
    readonly report: DeliveryReport;

    constructor(
        private readonly port: DeliveryPort,
        previouslyDelivered: Iterable<string> = [],
    ) {
        this.delivered = new Set(previouslyDelivered);
        this.report = {
            attempted: 0,
            delivered: 0,
            billedEvents: 0,
            skippedAlreadyDeliveredInThisRun: 0,
            notDeliveredBudget: 0,
            stoppedByChargeLimit: false,
            payPerEvent: port.isPayPerEvent(),
            errors: [],
        };
    }

    get deliveredIds(): string[] {
        return [...this.delivered];
    }

    get isStopped(): boolean {
        return this.stopped;
    }

    /** Enqueue one record; resolves to whether it was written. Calls are strictly serialized. */
    deliver(jobId: string, record: Record<string, unknown>): Promise<boolean> {
        const run = this.chain.then(() => this.deliverNow(jobId, record));
        this.chain = run.catch(() => undefined);
        return run;
    }

    private async deliverNow(jobId: string, record: Record<string, unknown>): Promise<boolean> {
        this.report.attempted++;
        if (this.delivered.has(jobId)) {
            this.report.skippedAlreadyDeliveredInThisRun++;
            return false;
        }
        if (this.stopped) {
            this.report.notDeliveredBudget++;
            return false;
        }
        if (this.report.payPerEvent && this.port.maxChargeableEvents(DELIVERY_EVENT) < 1) {
            this.stopped = true;
            this.report.stoppedByChargeLimit = true;
            this.report.notDeliveredBudget++;
            return false;
        }
        // Mark before the write so a concurrent caller can never write the same job twice.
        this.delivered.add(jobId);
        let result: ChargeResultLike;
        try {
            result = await this.port.pushData(record, DELIVERY_EVENT);
        } catch (err) {
            this.delivered.delete(jobId);
            this.report.errors.push((err as Error).message);
            return false;
        }
        this.report.delivered++;
        this.report.billedEvents += result.chargedCount;
        try {
            await this.port.saveDeliveredIds(this.deliveredIds);
        } catch (err) {
            this.report.errors.push(`state save failed: ${(err as Error).message}`);
        }
        if (this.report.payPerEvent && result.eventChargeLimitReached) {
            this.stopped = true;
            this.report.stoppedByChargeLimit = true;
        }
        return true;
    }
}
