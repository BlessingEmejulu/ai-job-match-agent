# Competitive analysis

Source: public Apify Store API (`GET https://api.apify.com/v2/store?search=…`) and each Actor's public
pricing (`GET /v2/acts/{id}`), queried **2026-09-23**. User counts are the Store's "users in the last
30 days" at that time. Prices are the lowest-tier event prices published by each Actor.

## Landscape

| Category | Examples (users/30 days) | What they deliver | Price signal |
| --- | --- | --- | --- |
| LinkedIn / Indeed scrapers | `curious_coder/linkedin-jobs-scraper` (17,579), `valig/indeed-jobs-scraper` (3,899), `borderline/indeed-scraper` (2,478) | Raw listings at volume | ~$0.10–$1 per 1,000 |
| Multi-ATS job APIs (Greenhouse, Lever, Ashby…) | `fantastic-jobs/greenhouse-jobs-api` (124), `bovi/greenhouse-lever-ashby-job-scraper` (102), `memo23/career-site-ats-jobs-api` (68) | Raw postings from company boards | $1.20–$2.00 per 1,000 (`apify-default-dataset-item` $0.0012–0.002; `job-result` $0.0015) |
| African job-board scrapers | `blackfalcondata/jobberman-scraper` (4), `jungle_synthesizer/africa-jobs-aggregator-scraper` (5), PNet scrapers (0–5) | Raw listings from Jobberman, BrighterMonday, PNet | ~$0.90–$1 per 1,000 |
| Early-career boards | `blackfalcondata/internshala-scraper` (136), `dltik/jobteaser-scraper` (6) | Internship listings (India, Europe) | ~$0.40–$1 per 1,000 |
| Job "match" Actors | `feeng/job-search-match-analyzer` (1), `apexweb/linkedin-application-copilot` (1), `flowery_gavotte/my-actor` CV score (1) | Fit scores, sometimes AI cover letters | e.g. $0.003 per item + start event |
| Visa/eligibility | `neuton/linkedin-visa-sponsorship-jobs-intelligence` (2), Australia visa-sponsorship (0) | Flags jobs mentioning sponsorship | — |

## Gap this Actor fills

None of the Actors found combines these for African applicants:

1. **Explicit location eligibility with evidence** — `explicitly_supported / explicitly_restricted / unknown`
   relative to the applicant's country, with description restrictions overriding a friendlier location
   field. Existing scrapers pass location text through untouched; "Remote" and "Remote – US" look alike.
2. **Early-career focus** — internship, graduate, trainee, accelerator and junior detection, and
   student-only flags.
3. **Required vs preferred vs "one of" skills**, so candidates are not penalised for optional or
   alternative skills.
4. **Evidence coverage and "insufficient evidence"** instead of a confident score on a thin posting.
5. **Verified employer registry** rather than broad scraping: fewer listings, but each board is tied to
   the employer's official careers page, and every record keeps provenance.

## Where it is weaker

- **Coverage.** Eight boards versus thousands of company boards (multi-ATS APIs) or LinkedIn's volume.
  Users who want volume should use a volume scraper; this Actor is for decision quality on a curated set.
- **No Jobberman/BrighterMonday.** Local African job boards are HTML sites with their own terms; they are
  future work after a terms review, and scrapers for them already exist.
- **Rules-first extraction.** The skills dictionary is conservative; niche skills are only picked up when
  the optional AI step runs.

## Positioning and pricing implications

- Price above raw ATS listings (≈$1.2–2 per 1,000), because each record carries eligibility analysis,
  skill separation and, in match mode, an explained match — but stay within reach of students.
- One simple event (`opportunity-delivered`) keeps costs predictable and matches how volume scrapers
  are priced, so users can compare.
- Provisional price and its reasoning: [monetization.md](monetization.md).
