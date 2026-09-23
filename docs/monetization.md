# Monetization (pay-per-event)

> **Status:** billing code is implemented and verified locally with the SDK's PPE test mode. PPE is
> **not active** until the owner configures the event in Apify Console and publishes. Nothing in this
> repository can switch it on.

## The billable event

| Event name | Title | Definition |
| --- | --- | --- |
| `opportunity-delivered` | Opportunity delivered | One unique, validated opportunity delivered to the default dataset during this run, including the analysis enabled for that run. |

Implementation (`src/billing/delivery.ts`, `src/main.ts`):

- Each record is written **and charged in one call**: `Actor.pushData(record, 'opportunity-delivered')`.
  In the installed SDK (`apify@3.7.2`) this returns `Promise<ChargeResult>` with `chargedCount`,
  `eventChargeLimitReached` and `chargeableWithinLimit`. There is no separate `Actor.charge()` for the same
  delivery.
- Deliveries are **serialized**. Before each write the queue checks
  `ChargingManager.calculateMaxEventChargeCountWithinLimit('opportunity-delivered') ≥ 1`; after each write it
  stops if `eventChargeLimitReached` is true. When the SDK's budget runs out it also trims unaffordable items
  itself, so nothing is delivered unpaid in PPE mode.
- Never charged: duplicates (removed before delivery), invalid or unsafe records, excluded listings, failed
  HTTP requests, failed or ungrounded AI calls, records beyond `maxResults`.
- A delivered job ID is recorded in `DELIVERY_STATE` after every write, so a migrated/restarted run does not
  deliver or bill it again. A crash between the write and the state save could still duplicate one record;
  exactly-once is not claimed.
- **Separate runs are independent.** A job that is still open will be delivered — and charged — again by a
  later run. This is by design (each run is a fresh, current result set) and is stated in the README.

## Console configuration (owner steps)

In Apify Console → the Actor → **Publication** → **Monetization** → pay per event:

1. Add a custom event: name **`opportunity-delivered`** (must match exactly), title *Opportunity delivered*,
   description as above, and set it as the **primary event**.
2. **Remove the synthetic `apify-default-dataset-item` event.** It is enabled by default for new PPE Actors and
   would charge a second time for every dataset item.
3. `apify-actor-start`: Apify recommends keeping it (default $0.00005 per start per GB, and Apify then covers
   the first 5 seconds of compute). Keep it if you accept that small, disclosed start fee; remove it for a
   single-event price. The code never charges it manually. *Recommendation for launch: keep it and disclose
   it on the Store page.*
4. Set a **minimum max-charge-per-run** (`minimalMaxTotalChargeUsd`) at least equal to the start event plus
   one opportunity, so users cannot set a limit that affords nothing.
5. Save and publish. Price changes on an already-published Actor can be subject to a notice period; follow
   the message Console shows.

## Pricing

**Provisional launch price: $0.004 per opportunity ($4 per 1,000).** Label it provisional until cloud runs
confirm costs.

Reasoning (estimates, not measurements, except where marked):

| Input | Value |
| --- | --- |
| Local pipeline time, match mode, 6 boards, 920 listings, 6 requests *(measured 2026-09-23)* | 11.8 s |
| Expected cloud run (start + fetch + analysis) at 512 MB | ~20–40 s → ~0.003–0.006 CU per run |
| Typical results per run | 10–20 |
| Revenue per run at $0.004 × 15 opportunities | $0.06 gross, $0.048 to the owner (80%) |
| Comparable raw ATS job APIs on the Store | $1.20–$2.00 per 1,000 |

The platform cost of a rules-only run is a small fraction of revenue at this price, so the event price stays
low for students while covering compute. Replace the estimates with the **Usage** figures of the first cloud
runs before finalising.

### AI costs are separate and owner-paid

When AI is enabled, calls use the owner's `ANTHROPIC_API_KEY`. With the default `claude-opus-5` ($5 / $25 per
million input/output tokens, from the Anthropic price list cached 2026-06-24) one analysis is roughly 2,500
input and ≤600 output tokens ≈ **$0.03**, so 10 analyses ≈ $0.30 per run — more than the run's PPE revenue.
Therefore:

- `AI_MAX_ANALYSES_CAP` (owner environment variable) defaults to **0**: AI is off for every Store user unless
  the owner opts in, whatever the input says.
- Options before enabling AI publicly: a cheaper model via `ANTHROPIC_MODEL` (e.g. `claude-haiku-4-5` ≈
  $0.005 per analysis), a small cap (2–3), or a second priced event (e.g. `ai-analysis`) in a later version.
- The website's live-run page can enable AI for the owner's own demo runs within the cap.

## Local test mode

```bash
# PPE simulation: every event costs $1 locally; stop after $3.
ACTOR_TEST_PAY_PER_EVENT=true ACTOR_USE_CHARGING_LOG_DATASET=true ACTOR_MAX_TOTAL_CHARGE_USD=3 apify run --purge
```

Verified on 2026-09-23 with `examples/discover-input.json`:

- `ACTOR_MAX_TOTAL_CHARGE_USD=3` → 3 records delivered, `billedEvents: 3`, `outcome: budget_limited`,
  `stopReason: charge_limit_reached`.
- `ACTOR_MAX_TOTAL_CHARGE_USD=2` with the charging log → `storage/datasets/charging_log/` contains 2 entries
  for `opportunity-delivered`.
- In `apify@3.7.2` the local charging log is opt-in (`ACTOR_USE_CHARGING_LOG_DATASET=true`) and the dataset is
  named `charging_log`.

Unit tests (`test/billing.test.ts`, `test/pipeline.test.ts`) cover duplicate charging, concurrent delivery,
partial budgets, zero budget, zero results, failed writes and restart skipping.

## Cloud verification checklist

1. Configure the event as above (dataset-item event removed).
2. Run with a small **Max cost per run** (e.g. $0.02) and `maxResults: 20`.
3. Check the run: dataset item count = `RUN_SUMMARY.billing.delivered`; the run's charged events =
   `billing.billedEvents`; `outcome: budget_limited` if the cap was hit.
4. Record **Usage** (compute units) and revisit the price.

## Who pays

- **Direct Actor users** (Console/API) pay the event price from their own Apify account.
- **Website visitors** do not pay anything: the website starts runs with the **owner's** token, so every
  website run is billed to the owner's Apify account (check the run's cost in Console for exactly what was
  charged) plus any AI usage. The website therefore caps results, max charge per run, and runs per day on the
  server (see [deployment.md](deployment.md)). Users on Apify's free plan generate no revenue for the owner.
