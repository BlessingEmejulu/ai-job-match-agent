# Known limitations and future scope

## Coverage

- Eight verified employer boards on two ATS families (Greenhouse, Lever). This is a curated set, not
  internet-wide search. Many African employers use other systems or were not found under their names.
- Nigeria is well covered; other African countries have a handful of roles each; many roles open to African
  applicants are "worldwide remote" roles from global companies. See [source-coverage.md](source-coverage.md).
- Registry metadata (`observedCountries`) was measured on 2026-09-23 and is only used to rank boards.

## Extraction

- The skills dictionary is conservative (~130 canonical skills). Skills outside it are not extracted by the
  rules; the optional AI step can add them when enabled.
- Required/preferred separation depends on headings and phrases. Postings with no structure are flagged
  `REQUIRED_PREFERRED_NOT_SEPARATED` and every recognised skill is treated as required.
- "One of / e.g." lists become alternatives; other forms of optionality ("familiarity with") are not modelled.
- Experience is the first stated minimum; multiple tracks ("3 years with a degree or 5 without") are not modelled.
- Seniority derived from years is labelled `derived` in the evidence, but ranges like "0–7 years" can still
  map to `entry`.
- Salaries appear only when Lever provides a structured `salaryRange`; salary text inside descriptions is
  not parsed. Greenhouse pay ranges would need a per-job request and are not fetched.
- Deadlines are rare on these boards; most records have `deadlineStatus: "unknown"`.
- Only English text patterns are recognised (restrictions, sections, student-only phrases).

## Eligibility

- "Supported" means the location evidence includes the applicant. It is not legal advice, does not prove work
  authorization, and does not mean the employer will hire in that country.
- Location parsing uses a dictionary of countries, major cities and regions. Unlisted cities fall back to
  the country name if present, otherwise the location is `unknown`.
- Lever's `country` field is only used when the location text has no usable place, because it can differ from
  multi-location postings.
- On-site/hybrid roles in another country are shown as restricted unless the candidate declared work
  authorization there.

## Matching

- The score is relevance to stated requirements, not a hiring probability, and it depends on what the
  posting says. A posting that asks for little can score high for many people.
- Role alignment is token-based with a small synonym table (developer≈engineer, front-end≈frontend).
- Education and student-status checks only use what the candidate declared.

## AI

- Optional and owner-controlled (`AI_MAX_ANALYSES_CAP` defaults to 0). The live Anthropic call path is
  typed against the SDK and covered by fallback tests, but was **not exercised against the real API** in
  development (no key was available). Verify with one small run before enabling publicly.
- Input is truncated at 8,000 characters (flagged).
- Posting text is sent to Anthropic when AI runs.

## Billing and delivery

- Charges are per run: a still-open job returned by a later run is delivered and charged again.
- Restart safety: delivered IDs are checkpointed after each write, but a crash between the dataset write and
  the checkpoint can duplicate one record. Exactly-once delivery is not claimed.
- PPE is not active until configured in Console; the price is provisional.

## Operations

- Board APIs are public and undocumented regarding rate limits; the Actor makes one request per Greenhouse
  board and up to five per Lever board per run, with bounded retries.
- A board that changes its token or leaves its ATS will fail and be reported in `RUN_SUMMARY`; the run
  continues with other boards.
- The Docker image was not built locally during development (Docker Desktop's engine did not start); the
  Apify cloud build compiles the same Dockerfile. The TypeScript build it runs (`npm run build`) passes locally.
- GitHub Actions CI is defined (`.github/workflows/ci.yml`: Actor typecheck/tests/build, Docker build, web
  typecheck/tests/build) but its first runs did not start: GitHub reported the repository owner's account
  as locked due to a billing issue. The same commands pass locally.

## Future scope (not in the MVP)

- More verified boards (Ashby, SmartRecruiters, Workable) and African job boards after a terms review.
- Richer AI recommendations and grounded explanation rewriting.
- Persistent profiles, saved jobs, alerts/scheduled digests, CV parsing, mobile app.
- Automatic applications or recruitment CRM features are explicitly out of scope.
