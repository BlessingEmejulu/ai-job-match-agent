# Three-minute live demo — Demo Day, Lagos, 25 September 2026

**Goal:** show one real, small run end to end, one useful match with its evidence, and the PPE setup.
**Never** present the backup as live; say "this is yesterday's run" if you use it.

## Before going on stage (T-30 min)

- [ ] Apify Console logged in; Actor page open on the **Input** tab with `examples/match-input.json` loaded
      (fictional profile: Python, SQL, Excel, Power BI, Statistics; 1 year; NG).
- [ ] Set **Max cost per run** to $0.10 and `maxResults` to 10 so the run finishes in well under a minute.
- [ ] Second tab: the **backup run** (a successful run from 24 Sept, clearly dated) — Dataset + `RUN_SUMMARY`.
- [ ] Third tab: Actor **Publication → Monetization** showing `opportunity-delivered`.
- [ ] Fourth tab: website `/` (and `/live` signed in, if the website is deployed).
- [ ] Phone hotspot ready in case venue Wi-Fi blocks api.apify.com.
- [ ] Run `npm run test:live` once to confirm all eight boards respond today.

## Script

**0:00 — Problem (20 s)**
"If you are a graduate in Lagos, most 'remote' jobs you find are US-only, and the real requirements are
buried in long posts. You waste applications on jobs you can't take."

**0:20 — Input (20 s)** *(Console Input tab)*
"Countries: Nigeria. Early-career seniority. A short skills profile — no name, no CV. Limits: 10 results,
60 requests, ten cents max cost." → **Start**.

**0:40 — Live log (35 s)** *(Log tab)* point at the decision lines:
- `DISCOVER: reading greenhouse:jumia, lever:dlocal, …` — "eight verified employer boards, two public APIs."
- `DECIDE: expand once → greenhouse:canonical …` — "too few results, so it adds the next best verified source — once, never relaxing Nigeria."
- `DECIDE: 920 listings → N candidates (excluded: LOCATION_OUTSIDE_SELECTED_COUNTRIES …)` — "every exclusion has a reason code."
- `DELIVER: … 'opportunity-delivered' event(s) charged`.

**1:15 — Results (45 s)** *(Output → Match details view)* open the top match:
- "Relevance 83, from 80% evidence coverage — not a hiring probability."
- "Location: *Home based – Worldwide* — here's the quote. It says this does **not** prove work authorization."
- "Required: Python — evidenced. Preferred but not evidenced in your profile: Linux, Docker…"
- Scroll to a job with **insufficient evidence**: "no score rather than a made-up one."
- If present, a restricted job: "Remote – US: restricted, shown last, even if the skills fit."

**2:00 — Apply (10 s)** click `applicationUrl` → the employer's own Greenhouse page opens.

**2:10 — Monetization (25 s)** *(Monetization tab, then run's `RUN_SUMMARY.billing`)*
"One event, *opportunity-delivered*: unique, validated opportunities only — duplicates and failures are free.
The run stops at your max cost. Here's the billed count for this run." (Show the run's cost/usage panel.)

**2:35 — Website (20 s)** *(if deployed)* "Same data for students on a phone: filters, evidence, unknowns.
Anyone can run a live search; spending is capped per network, per visitor, per day and per search."

**2:55 — Close (5 s)** "Find opportunities you can actually apply for — and know why."

## Fallbacks

| Problem | Say / do |
| --- | --- |
| Run slow or network down | "Here is yesterday's run, dated 24 September" → backup tab. Do not call it live. |
| A board fails | Point at `partial_source_failure` in `RUN_SUMMARY`: "one source failed; the rest still delivered — and it tells you." |
| No restricted example in today's data | Show the labelled fixture test `test/eligibility.test.ts` ("Remote – US conflicts with a Nigeria-based applicant"). Say it is a fixture. |
| Question: "Is this AI?" | "Rules first, deterministic and explainable. There is one optional, bounded AI step for ambiguous postings; every AI claim must quote the posting, and it can never loosen a restriction." |

## Rehearsal log

- 2026-09-23: local end-to-end rehearsal with `apify run` (discover + match, fictional profile): 920 listings
  read from 6 boards in ~12 s pipeline time; ranking and explanations as expected. **Cloud rehearsal pending
  Apify login.**
