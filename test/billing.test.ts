import { describe, expect, it } from 'vitest';

import { type ChargeResultLike, DELIVERY_EVENT, type DeliveryPort, DeliveryQueue } from '../src/billing/delivery.js';

/** Simulates the SDK's PPE behaviour: a price per event and a max total charge. */
function fakePort(opts: { ppe: boolean; budgetEvents?: number; failOn?: string }) {
    const pushed: { id: string; event: string }[] = [];
    let charged = 0;
    const saved: string[][] = [];
    const port: DeliveryPort & { pushed: typeof pushed; saved: typeof saved; charged: () => number } = {
        pushed,
        saved,
        charged: () => charged,
        isPayPerEvent: () => opts.ppe,
        maxChargeableEvents: () => (opts.budgetEvents === undefined ? Infinity : Math.max(0, opts.budgetEvents - charged)),
        pushData: async (record, event): Promise<ChargeResultLike> => {
            await new Promise((r) => setTimeout(r, 1)); // allow interleaving if not serialized
            if (record.jobId === opts.failOn) throw new Error('dataset write failed');
            pushed.push({ id: String(record.jobId), event });
            if (!opts.ppe) return { eventChargeLimitReached: false, chargedCount: 0, chargeableWithinLimit: {} };
            charged++;
            const left = opts.budgetEvents === undefined ? Infinity : opts.budgetEvents - charged;
            return { eventChargeLimitReached: left < 1, chargedCount: 1, chargeableWithinLimit: { [event]: left } };
        },
        saveDeliveredIds: async (ids) => void saved.push(ids),
    };
    return port;
}

const rec = (id: string) => ({ jobId: id });

describe('PPE delivery', () => {
    it('charges exactly one event per unique delivered opportunity', async () => {
        const port = fakePort({ ppe: true });
        const q = new DeliveryQueue(port);
        for (const id of ['a', 'b', 'a', 'c', 'b']) await q.deliver(id, rec(id));
        expect(port.pushed.map((p) => p.id)).toEqual(['a', 'b', 'c']);
        expect(port.pushed.every((p) => p.event === DELIVERY_EVENT)).toBe(true);
        expect(q.report).toMatchObject({ delivered: 3, billedEvents: 3, skippedAlreadyDeliveredInThisRun: 2 });
    });

    it('serializes concurrent deliveries so duplicates cannot be written twice', async () => {
        const port = fakePort({ ppe: true });
        const q = new DeliveryQueue(port);
        await Promise.all(['x', 'x', 'y', 'x', 'y'].map((id) => q.deliver(id, rec(id))));
        expect(port.pushed.map((p) => p.id)).toEqual(['x', 'y']);
        expect(port.charged()).toBe(2);
    });

    it('stops at the user budget and reports undelivered records', async () => {
        const port = fakePort({ ppe: true, budgetEvents: 2 });
        const q = new DeliveryQueue(port);
        for (const id of ['a', 'b', 'c', 'd']) await q.deliver(id, rec(id));
        expect(port.pushed).toHaveLength(2);
        expect(q.report).toMatchObject({ delivered: 2, billedEvents: 2, stoppedByChargeLimit: true, notDeliveredBudget: 2 });
        expect(q.isStopped).toBe(true);
    });

    it('delivers nothing and charges nothing with a zero budget', async () => {
        const port = fakePort({ ppe: true, budgetEvents: 0 });
        const q = new DeliveryQueue(port);
        await q.deliver('a', rec('a'));
        expect(port.pushed).toHaveLength(0);
        expect(q.report).toMatchObject({ delivered: 0, billedEvents: 0, stoppedByChargeLimit: true });
    });

    it('handles zero results without charging', () => {
        const q = new DeliveryQueue(fakePort({ ppe: true }));
        expect(q.report).toMatchObject({ attempted: 0, delivered: 0, billedEvents: 0 });
    });

    it('does not bill a failed write and allows a retry of that record', async () => {
        const port = fakePort({ ppe: true, failOn: 'bad' });
        const q = new DeliveryQueue(port);
        expect(await q.deliver('bad', rec('bad'))).toBe(false);
        expect(q.report).toMatchObject({ delivered: 0, billedEvents: 0 });
        expect(q.report.errors).toHaveLength(1);
    });

    it('skips records delivered before a migration/restart and persists state after each write', async () => {
        const port = fakePort({ ppe: true });
        const q = new DeliveryQueue(port, ['a']);
        await q.deliver('a', rec('a'));
        await q.deliver('b', rec('b'));
        expect(port.pushed.map((p) => p.id)).toEqual(['b']);
        expect(port.saved.at(-1)).toEqual(['a', 'b']);
    });

    it('writes without charging outside pay-per-event mode', async () => {
        const port = fakePort({ ppe: false });
        const q = new DeliveryQueue(port);
        await q.deliver('a', rec('a'));
        expect(q.report).toMatchObject({ delivered: 1, billedEvents: 0, payPerEvent: false });
    });
});
