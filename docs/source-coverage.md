# Source coverage

Verification and measurement date: **2026-09-23**. Numbers change daily; re-measure with
`npx tsx scripts/coverage-report.ts` (raw output of the measurement below: [`coverage-snapshot.json`](coverage-snapshot.json)).

## Source families

### Greenhouse Job Board API

| | |
| --- | --- |
| Access | `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true` — public, no authentication for GET endpoints ([docs](https://developers.greenhouse.io/job-board.html)). |
| Pagination | None. One response returns the whole board. |
| Fields used | `id`, `title`, `absolute_url`, `location.name`, `content` (HTML-escaped HTML), `first_published`, `updated_at`, `application_deadline`, `company_name`, `departments`, `metadata` (employment-type entries only). |
| Missing | Structured work arrangement, structured country, salary (only via a per-job `pay_transparency` call, which this Actor does not make), required/preferred split. |
| Rate limits | None documented. The Actor makes one request per board per run and retries 429/5xx at most twice with backoff. |
| Restrictions | Only published postings are exposed. Application submission requires an employer API key and is out of scope — users apply on the employer page. |
| Note | Boards on Greenhouse's EU instance (Moniepoint, Jumia) are served by the same public API host; their `absolute_url` points at `job-boards.eu.greenhouse.io`. |

### Lever Postings API

| | |
| --- | --- |
| Access | `GET https://api.lever.co/v0/postings/{site}?mode=json&skip=N&limit=M` — public, no authentication ([docs](https://github.com/lever/postings-api)). |
| Pagination | `skip`/`limit`. The Actor reads pages of 100 and stops at a short page or after 5 pages. Verified on Binance: 100 + 100 + 100 + 7 = 307 unique postings. |
| Fields used | `id`, `text`, `hostedUrl`, `applyUrl`, `createdAt`, `country`, `workplaceType`, `descriptionBody`/`description`, `opening`, `additional`, `lists`, `categories.{commitment,department,team,location,allLocations}`, `salaryRange`, `salaryDescriptionPlain`. |
| Missing | Updated timestamp, application deadline, required/preferred split (partly recoverable from list titles). |
| Rate limits | None documented for GET. Same retry/backoff policy as above. |
| Restrictions | Only published postings. No full-text search; filtering happens in the Actor. |

## Verified boards

| Source id | Employer | Verification method | Official careers page |
| --- | --- | --- | --- |
| `greenhouse:moniepoint` | Moniepoint | Job IDs on the careers page (e.g. `/careers/roles/4941669101`) equal Greenhouse job IDs | https://moniepoint.com/careers |
| `greenhouse:jumia` | Jumia | Careers page links to `job-boards.eu.greenhouse.io/jumia/jobs/<id>` | https://group.jumia.com/careers |
| `greenhouse:alxafrica` | ALX Africa | Careers site links to `job-boards.greenhouse.io/alxafrica/jobs/<id>` | https://careers.alxafrica.com/ |
| `greenhouse:flyzipline` | Zipline | Every API `absolute_url` points to `www.zipline.com/open-roles/<id>` | https://www.zipline.com/careers |
| `greenhouse:canonical` | Canonical | Careers page references `greenhouse.io/canonical` | https://canonical.com/careers |
| `greenhouse:gitlab` | GitLab | Jobs page links to `job-boards.greenhouse.io/gitlab/jobs/<id>` | https://about.gitlab.com/jobs/all-jobs/ |
| `lever:dlocal` | dLocal | Careers page links to `jobs.lever.co/dlocal/<id>` | https://www.dlocal.com/careers/ |
| `lever:binance` | Binance | Posting UUIDs on the careers site equal Lever posting IDs | https://www.binance.com/en/careers/job-openings |

Candidates checked but **not** added because the board could not be tied to the employer's official page on the verification date: Toptal (Lever), Wikimedia Foundation, Turing and Grafana Labs (Greenhouse). Many well-known African employers (Paystack, Flutterwave, Andela, Kuda, Chipper Cash, M-KOPA, …) returned 404 for their obvious board names on both APIs, so they are not covered; no other slugs were guessed.

## Measured coverage (2026-09-23)

11 HTTP requests in total for all eight boards.

| Board | Listings | With an African location¹ | Worldwide | Remote | Early-career² | Deadline stated | Salary stated | Required skills found |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Moniepoint | 183 | 105 | 0 | 121 | 14 | 0 | 0 | 151 |
| Jumia | 23 | 21 | 0 | 0 | 1 | 1 | 0 | 14 |
| ALX Africa | 14 | 5 | 0 | 9 | 1 | 0 | 0 | 10 |
| Zipline | 341 | 21 | 1 | 6 | 92 | 0 | 0 | 205 |
| Canonical | 305 | 0 | 96 | 279 | 19 | 0 | 0 | 251 |
| GitLab | 204 | 0 | 0 | 183 | 0 | 0 | 0 | 142 |
| dLocal | 54 | 9 | 0 | 1 | 0 | 0 | 0 | 26 |
| Binance | 307 | 6 | 7 | 258 | 86 | 0 | 0 | 220 |

¹ Location text names an African country, city or "Africa". ² Internship, graduate/trainee/accelerator, entry-level or junior by title, or internship employment type.

Top countries by listing count: Moniepoint NG 81, ES 25, PL 24, PT 18, KE 18; Jumia GH 6, NG 4, SN 4, KE 3; Zipline US 318, CI 9, RW 6, NG 5; GitLab US 100, CA 59, GB 43; dLocal UY 30, BR 25, AR 24, ZA 4; Binance HK 161, TW 160, AU 41, AE 37.

### What this means for users

- Nigeria has the deepest coverage (Moniepoint, plus Zipline, Jumia, ALX, dLocal).
- Kenya, Ghana, South Africa, Senegal, Côte d'Ivoire, Rwanda, Egypt and Uganda have a handful of roles each.
- Worldwide-remote roles open to any African country come mainly from Canonical and a few Binance/Zipline postings.
- Deadlines and salaries are almost never published by these boards, so most records show `deadlineStatus: "unknown"` and `salary: null`. That is accurate, not missing processing.
- GitLab is included deliberately: its "remote" roles are mostly country-restricted, which exercises and demonstrates the restriction logic.

## Adding a board

1. Find the board token/site on the employer's **official** careers page (a link, an embedded board, or matching job IDs).
2. Add a `RegistryEntry` in `src/sources/registry.ts` with the verification method and date.
3. Run `npx tsx scripts/coverage-report.ts` and update `observedCountries` from the measurement.
4. Do not add login-gated, CAPTCHA-protected or scraped-HTML sources without a separate review.
