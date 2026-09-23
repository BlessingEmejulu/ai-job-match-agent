# Architecture

One Apify Actor (TypeScript, Node 22+) with a five-stage pipeline, plus a small Next.js website in
`web/` that starts runs through the Apify API. No external database, queue, vector store or agent
framework: the Dataset holds opportunities, the Key-Value Store holds the run summary and delivery
checkpoint.

```
            ┌──────────── Apify Actor run ─────────────────────────────────────────────┐
 input ───► │ DISCOVER ─► DECIDE ─► ANALYZE ─► MATCH ─► EXPLAIN ─► DELIVER (PPE)       │
            │  registry    filters   rules      score    evidence   Actor.pushData(    │
            │  + budgeted  + dedup   (+ bounded weights  + next      record,           │
            │  HTTP        + 1x      AI on the  + geo    steps      'opportunity-      │
            │              expand    most       apart               delivered')       │
            │                        uncertain)                                       │
            └───────────────────────────┬──────────────────────────────┬──────────────┘
                                        ▼                              ▼
                                 Dataset (records)          KV store: RUN_SUMMARY,
                                                            DELIVERY_STATE
```

## Source layout

| Folder | Responsibility |
| --- | --- |
| `src/sources` | Verified registry, budgeted HTTP client with host allow-list, Greenhouse and Lever adapters |
| `src/normalization` | HTML → text blocks, section classification, skills dictionary, requirements, dates, classification, URL safety |
| `src/dedup` | Three-key deduplication with atomic check-and-add |
| `src/eligibility` | Country/city/region dictionary, restriction statements, eligibility assessment |
| `src/matching` | Role tokens, weighted score, deterministic explanations |
| `src/ai` | Provider interface, Anthropic implementation, grounding validator, bounded analyzer |
| `src/billing` | Serialized PPE delivery queue |
| `src/schemas` | Zod input and output contracts |
| `src/pipeline` | Stage orchestration and run summary |

## The five stages

### 1. Discover

- Input is validated with Zod (`src/schemas/input.ts`); the Apify input schema enforces the same maximums.
- `planSources` ranks the eight verified boards by measured relevance to the requested countries and
  takes four, guaranteeing both source families appear. The rest form an expansion pool.
- `BudgetedHttpClient` counts **every attempt** (including retries) against `maxRequests`, stops at the
  runtime deadline (`maxRuntimeSeconds` minus 15 s reserved for delivery), refuses non-allow-listed
  hosts, non-HTTPS URLs and redirects, and caps response size. Boards are fetched two at a time.
- Each listing records `sourceId`, `sourceJobId`, API URL and retrieval timestamp.

### 2. Decide

For each listing, in order, with a reason code recorded for every exclusion
(`RUN_SUMMARY.counts.excludedByReason`) and every kept record (`decisionReasons`):

1. Deduplicate (see below).
2. Role keywords — every word of at least one keyword must appear in the title/department. In match mode
   with no keywords, the candidate's desired roles are used.
3. Employment type, seniority and work arrangement filters — explicit mismatches are dropped; **unknown
   values are kept and labelled** (`*_UNKNOWN_KEPT`) rather than guessed.
4. Deadline — explicitly expired postings are dropped; unknown deadlines are kept unless
   `includeUnknownDeadline` is false.
5. Geography — assessed against the selected countries. Explicit conflicts are dropped
   (`LOCATION_OUTSIDE_SELECTED_COUNTRIES`); unknown is kept unless `includeUnknownEligibility` is false.
   Country restrictions are never relaxed to fill results.

**Bounded expansion.** If fewer candidates than `maxResults` remain, and at least two requests and 30 s
are left, the Actor reads the next two most relevant verified boards — once. The decision and its
reason are logged and stored in `RUN_SUMMARY.sources.expansion`.

### 3. Analyze

Rules (`src/normalization`) run on every candidate:

- HTML is decoded, active content dropped, text Unicode-normalised; blocks are classified into
  required / preferred / responsibilities / about / benefits / other by headings, and line-level phrases
  ("a plus", "nice to have") move a line to preferred.
- Skills come from a conservative dictionary with masking (React Native ≠ React, JavaScript ≠ Java,
  "Go" and "R" only in list context). "One of X, Y or Z" / "e.g. X, Y" become
  `requiredSkillAlternatives`, satisfied by any member.
- Experience minimums/ranges, degree level (required vs preferred), student-only statements, deadlines
  (structured field first, then only lines that say "deadline/closing date/apply by"), employment type,
  seniority (title first, else derived from years and labelled "derived"), work arrangement (structured
  field, then location text, then explicit description statements).

**Bounded AI (optional).** The shortlist (2 × `maxResults`) is ordered by an uncertainty score
(no section structure, no required skills found, no experience level, unknown eligibility, unknown
seniority). Up to `ai.maxAnalyses` of the most uncertain records are sent to the provider. This is the
only model-driven step and it is a bounded, deterministic selection loop — not an autonomous agent.
See [AI](#ai) below.

### 4. Match

`src/matching/score.ts` (match mode only):

| Dimension | Weight | Scored when | Value |
| --- | ---: | --- | --- |
| Required skills | 45 | ≥1 required skill or alternatives group | met items ÷ items (a group counts once) |
| Preferred skills | 10 | ≥1 preferred skill | matched ÷ preferred |
| Experience | 20 | stated minimum years, or seniority stated in the title | 1 if met; 0 if the gap is ≥3 years; else years ÷ expected |
| Role alignment | 15 | always | 0.7 × share of desired-role words in the title + 0.3 × share of title role words explained |
| Preferences | 10 | a filter was given and the job states the value | share of employment-type / arrangement preferences met |

`score = Σ(weight × value) ÷ Σ(scored weights) × 100`, and `evidenceCoverage = Σ(scored weights) ÷ 100`.
Below 0.5 coverage the status is `insufficient_evidence` and `score` is `null`. Skills are compared
after canonicalisation; anything absent from the profile is reported as *not evidenced in your
profile*. Student-only and degree requirements are checked against declared facts only
(`requirementChecks`). Geography is **not** part of the score.

Ranking: eligibility (supported → unknown → restricted), then score, then early-career fit, then
freshness, then `jobId` — fully reproducible for the same source data.

### 5. Explain

`src/matching/explain.ts` builds the explanation from validated fields only: location conflicts first,
then score with coverage, required-skill items met and not evidenced, preferred gaps, the experience
assessment with its quoted line, location basis, and unmet requirement checks. At most two next steps
are chosen by priority (confirm eligibility, student-status, skill evidence, recruiter questions,
experience framing, deadlines).

## Deduplication

Keys, strongest first: `source + job id`; canonical application URL (fragment and tracking parameters
such as `utm_*`, `gh_src`, `lever-source` removed; functional parameters like `gh_jid` kept; Lever
`/apply` suffix folded); identical normalised company + title + location. The check-and-register step
is synchronous, so concurrent callers cannot both pass. Duplicate references are kept on the primary
record. Deduplication happens before delivery, so duplicates are never billed. Separate runs are
independent: a still-open job can be delivered (and billed) again in a later run.

## Geographic eligibility

`src/eligibility/assess.ts`. Base countries are the candidate's declared country (match mode) or the
selected countries (discover mode); declared work-authorization countries are added as acceptable
presence countries. Never inferred from nationality, timezone or location.

| Case | Result |
| --- | --- |
| Remote, worldwide/anywhere | `explicitly_supported` (basis `worldwide`) unless a description restriction conflicts |
| Remote, country list excluding you (e.g. "Remote – US") | `explicitly_restricted` |
| Remote, no scope ("Remote") | `unknown`, unresolved "which countries" |
| Remote, region including you (EMEA, Africa) | `explicitly_supported` (basis `region`), unresolved payroll/hiring countries |
| Hybrid/on-site in your country | `explicitly_supported`, reason `PHYSICAL_PRESENCE_REQUIRED` |
| Hybrid/on-site elsewhere | `explicitly_restricted` unless you declared authorization there (then relocation unresolved) |
| Description "must be based in X" excluding you | `explicitly_restricted`; adds `CONFLICTING_STATEMENTS` if the location field suggested otherwise |
| Description "authorized to work in X" not declared | at best `unknown`, unresolved authorization |
| "No visa sponsorship" | recorded as evidence only |

"Supported" never means legally authorized or that the employer will hire in that country.

## AI

- **Interface:** `AiProvider.extract({title, text}, signal)` → schema-validated `AiExtraction`. One
  implementation (`AnthropicProvider`, `claude-opus-5` by default, override with `ANTHROPIC_MODEL`) using
  `messages.parse` with a Zod output format, no tools, 30 s SDK timeout, one SDK retry, and a 45 s
  outer abort.
- **Untrusted input:** the posting is wrapped in `<posting>` tags and the system prompt states it is data.
  Output is constrained to the schema; the model cannot call tools or read secrets.
- **Grounding:** every claim needs a verbatim quote (whitespace/case-insensitive substring of the posting);
  skill claims must be supported by their quote; restriction places are re-parsed from the quote itself.
  Everything else is dropped and counted (`ungroundedItemsDropped`).
- **Merge rules:** AI may add skills, a missing experience minimum, a student-only flag and extra
  restrictions. It never removes rules findings, never downgrades required → preferred, and never relaxes a
  restriction. After AI, eligibility is re-assessed and any newly restricted record is dropped in the
  country filter.
- **Limits:** input truncated to 8,000 characters (flagged `AI_INPUT_TRUNCATED`), `ai.maxAnalyses` per run,
  capped again by the owner's `AI_MAX_ANALYSES_CAP`, within-run cache by content hash, deadline-aware.
- **Fallback:** any error, refusal, truncation or schema mismatch keeps the rules-only result.
  `RUN_SUMMARY.ai` reports attempted, succeeded, failed, cache hits, grounded additions and fallbacks.
- **Privacy:** only posting text is sent; the candidate profile never leaves the run.

## Run summary

`RUN_SUMMARY` in the default key-value store: start/end, input echo (profile replaced by
`candidateProfileProvided: true/false`), per-source reports, expansion decision, request usage, counts
(discovered, duplicates, invalid, expired, exclusions by reason, candidates, shortlisted, invalid
records, delivered), eligibility counts, AI usage, billing evidence, decision log and warnings.

| Outcome | Meaning |
| --- | --- |
| `results_delivered` | All attempted sources succeeded and ≥1 record was delivered |
| `no_matches` | Sources succeeded; nothing passed the filters |
| `partial_source_failure` | Some sources failed; `resultStatus` says whether anything was delivered |
| `total_source_failure` | Every source failed — the run is marked **failed**, never an empty success |
| `budget_limited` | The user's max charge stopped delivery |

## Restart and migration

`DELIVERY_STATE` is written after every successful delivery. On restart, already-delivered job IDs are
skipped and not billed again. A crash between the dataset write and the state write can still produce one
duplicate delivery; exactly-once delivery is **not** claimed.
