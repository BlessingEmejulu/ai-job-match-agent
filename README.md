## What does AI Job Match Agent do?

**AI Job Match Agent** finds live **jobs and internships** on verified employer career boards, works out **whether an applicant in an African country can actually apply**, separates **required from preferred skills**, and — when you give it a short skills profile — **explains how well each opportunity matches, with quotes from the posting**. Every result links to the **original application page**.

It is built for African students, graduates and early-career tech professionals who waste hours on "remote" roles that turn out to be US-only, and on postings whose real requirements are buried in long descriptions.

> Find opportunities relevant to your skills and location, understand why they match, and see what you need to confirm or improve before applying.

It does **not** promise employment, guarantee eligibility, cover the whole internet, or verify employer legitimacy. It reads a curated, verified set of public employer boards (see [Supported sources](#supported-sources)).

## What problem does it solve?

African students, graduates and early-career tech professionals lose hours on job searches that were never going to work:

- **"Remote" roles that aren't open to them.** Many postings say *Remote* but only hire in the US or Europe, and the restriction is buried deep in the description. Applicants find out after writing a cover letter, or never hear back.
- **Requirement lists that hide what matters.** Long postings mix required skills, nice-to-haves and "one of Python, Go or Java" alternatives, so early-career candidates wrongly rule themselves out, or apply blind.
- **No honest signal about fit.** Job boards rank by recency or keywords, not by whether the person has the required skills, the right level of experience, or is in an eligible country.
- **Scattered, stale sources.** Openings are spread across employer career pages, with no single place that shows freshness, deadlines and the original application link.

AI Job Match Agent turns public employer job boards into a structured, explained shortlist: which roles you can actually apply for from your country (with the exact sentence that decided it), which skills are really required, how well your profile matches, and what to confirm with the recruiter before applying.

## Why use AI Job Match Agent?

- 🌍 **Location eligibility for African applicants.** "Remote – US", "Home based – EMEA", "Remote" and "Lagos, hybrid" mean very different things. Each job gets `explicitly_supported`, `explicitly_restricted` or `unknown`, with the exact text that decided it. Restrictions in the description ("must be based in the United States") override a friendlier location field.
- 🎓 **Early-career fit.** Internship, graduate, trainee, apprenticeship and junior roles are detected and ranked first. Student-only roles are flagged.
- ✅ **Required vs preferred skills.** Section headings, "nice to have" / "a plus" phrasing and "one of Python, Go or Java" lists are read, so you are not penalised for optional skills or for knowing only one of several alternatives.
- 🔍 **Evidence, not guesses.** Every extracted fact carries a short excerpt from the posting. Unknowns stay unknown: no invented salaries, deadlines, visa sponsorship or restrictions.
- 🧮 **Transparent match score.** A documented, deterministic score (required skills 45%, preferred 10%, experience 20%, role 15%, preferences 10%) with an **evidence coverage** figure. Sparse postings get "insufficient evidence" instead of a confident number. Geography is reported separately and never hidden by a high skills score.
- 🔗 **Freshness and provenance.** Posting date, update date, retrieval time, deadline status and the source API for every record.
- ⚙️ **Apify platform.** Run from Console, schedule it, call it over the [API](https://docs.apify.com/api/v2), and export JSON, CSV or Excel.

## What data can AI Job Match Agent extract?

| Field | Description |
| --- | --- |
| `title`, `company`, `applicationUrl` | The role and the employer's own application page |
| `locationText`, `countries`, `workArrangement` | Location as posted, ISO countries evidenced, remote / hybrid / onsite / unspecified |
| `geographicEligibility` | `explicitly_supported`, `explicitly_restricted` or `unknown`, with `eligibilityReasons` and evidence |
| `employmentType`, `seniority`, `earlyCareerFit` | Full-time, internship…; internship → executive; suitable / possible / unlikely / unknown |
| `requiredSkills`, `requiredSkillAlternatives`, `preferredSkills` | Canonical skill names from the posting |
| `experience`, `education`, `studentStatusRequired` | Stated minimum years, degree requirement, student-only flag — each with the quoted line |
| `deadline`, `deadlineStatus`, `sourcePostedAt`, `sourceUpdatedAt` | Only when the source states them |
| `salary` | Only when the source provides a structured salary range |
| `unresolvedRequirements`, `qualityWarnings` | What you still need to confirm; data-quality notes |
| `match` (match mode) | `score`, `scoreBreakdown`, `evidenceCoverage`, `matchedSkills`, `requiredSkillsNotEvidenced`, `explanation`, `suggestedNextSteps` |

## How to run AI Job Match Agent

### Option 1: Apify Console (no code)

1. Click **Try for free** / **Start** on this Actor's page to open it in Apify Console.
2. Choose **Mode**: *Discover opportunities*, or *Discover and match to a profile* to compare each job with your skills.
3. Enter **Countries (ISO codes)** you can work from, e.g. `NG`, `KE`, `GH`, `ZA`. This is the only required field.
4. Optionally add **Role keywords** (e.g. `data analyst`, `software engineer`, `intern`) and filters for employment type, seniority and work arrangement.
5. For match mode, fill **Candidate profile**: skills, years of experience, desired roles and your country (optionally student status and the countries you are authorized to work in). No name, email, age, gender or CV is needed.
6. Optionally set **Max cost per run** in the run options to cap your spend.
7. Click **Start**. A small run usually finishes in 10 to 40 seconds. Results appear in the **Output** tab (*Opportunities* and *Match details* views); the run summary is under **Storage → Key-value store → RUN_SUMMARY**.
8. Open `applicationUrl` on any result to apply on the employer's own page.

**Tips for a good first run:** keep the default limits (20 results, 60 requests, 180 s), start with 1 to 3 countries, and use early-career seniority levels (`internship`, `graduate`, `entry`, `junior`) if you are starting out. If a strict search returns nothing, set **How strictly to apply filters** to *Relaxed*: jobs that miss your seniority, work arrangement or employment type are then kept and ranked after the ones that fit (country restrictions still apply).

### Option 2: Apify API

Start a run and get the results in one call (replace `<YOUR_APIFY_TOKEN>`):

```bash
curl -X POST \
  "https://api.apify.com/v2/acts/blessingemejulu~ai-job-match-agent/run-sync-get-dataset-items?maxTotalChargeUsd=0.10" \
  -H "Authorization: Bearer <YOUR_APIFY_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"mode":"discover","countries":["NG","KE"],"roleKeywords":["analyst","engineer"],"seniorityLevels":["graduate","entry","junior"],"maxResults":10}'
```

Or with the JavaScript client (`npm install apify-client`):

```js
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const run = await client.actor('blessingemejulu/ai-job-match-agent').call(
    { mode: 'discover', countries: ['NG', 'KE'], roleKeywords: ['analyst'], maxResults: 10 },
    { maxTotalChargeUsd: 0.1 },
);
const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(items.map((o) => `${o.title} @ ${o.company}: ${o.geographicEligibility.status}`));
```

### Option 3: Run it locally

Requires Node.js 22+ and the [Apify CLI](https://docs.apify.com/cli/) (`npm install -g apify-cli`).

```bash
git clone https://github.com/BlessingEmejulu/ai-job-match-agent.git
cd ai-job-match-agent
npm ci
mkdir -p storage/key_value_stores/default
cp examples/discover-input.json storage/key_value_stores/default/INPUT.json   # or examples/match-input.json
apify run --purge
```

Results are written to `storage/datasets/default/` and the run summary to `storage/key_value_stores/default/RUN_SUMMARY.json`. Run `npm test` for the fixture test suite and `npm run test:live` for live checks against the real job boards.

## How much does it cost?

This Actor uses **pay-per-event** pricing with one event:

| Event | When it is charged |
| --- | --- |
| `opportunity-delivered` | Once for each unique, validated opportunity written to the dataset in a run, including the analysis enabled for that run. |

You are **not** charged for duplicates, discarded or malformed listings, failed source requests, or failed AI calls. `maxResults` caps the number of billable events per run, and the run stops as soon as your **maximum cost per run** is reached. A still-open job returned again by a *later* run is a new delivery in that run and is charged again.

| Event | Price |
| --- | --- |
| `opportunity-delivered` | **$0.004** per opportunity ($4 per 1,000) |
| `apify-actor-start` (Apify's standard start event) | $0.00005 per run per GB of memory |

**Examples:** 10 opportunities cost about **$0.04**, 20 about **$0.08**, 100 about **$0.40**. Platform compute is included in the event price. How the price was chosen: [docs/monetization.md](https://github.com/BlessingEmejulu/ai-job-match-agent/blob/main/docs/monetization.md).

## Input

See the **Input** tab for all options. Two complete examples live in [`examples/`](https://github.com/BlessingEmejulu/ai-job-match-agent/tree/main/examples/):

```json
{
    "mode": "match",
    "countries": ["NG"],
    "employmentTypes": ["full_time", "internship"],
    "seniorityLevels": ["internship", "graduate", "entry", "junior", "mid"],
    "workArrangements": ["remote", "hybrid"],
    "maxResults": 15,
    "candidateProfile": {
        "skills": ["Python", "SQL", "Excel", "Power BI", "Statistics"],
        "yearsExperience": 1,
        "desiredRoles": ["data analyst", "business analyst"],
        "country": "NG",
        "studentStatus": "graduated",
        "workAuthorizationCountries": ["NG"]
    }
}
```

Defaults: 20 results, 60 HTTP requests, 180 seconds, AI off. Maximums: 100 results, 200 requests, 600 seconds, 25 AI analyses. Inputs above the maximums are rejected, not silently reduced.

## Output

The Actor's **output schema** exposes two outputs: **Opportunities** (the default dataset, with *Opportunities* and *Match details* table views) and **Run summary** (the `RUN_SUMMARY` record: sources read, exclusions by reason code, eligibility counts, AI usage, billing evidence and the run outcome).


You can download the dataset in various formats such as JSON, HTML, CSV, or Excel. A shortened, **labelled example** (see [`examples/example-output.json`](https://github.com/BlessingEmejulu/ai-job-match-agent/tree/main/examples/example-output.json) for full records from a real run, with its date):

```json
{
    "title": "Python and Kubernetes Software Engineer - Data, Workflows, AI/ML & Analytics",
    "company": "Canonical",
    "applicationUrl": "https://job-boards.greenhouse.io/canonical/jobs/5703396",
    "locationText": "Home based - Worldwide",
    "workArrangement": "remote",
    "geographicEligibility": {
        "status": "explicitly_supported",
        "basis": "worldwide",
        "assessedFor": ["NG"],
        "summary": "Location evidence includes your declared location. This does not confirm legal work authorization or that the employer will hire there."
    },
    "requiredSkills": ["Python"],
    "match": {
        "status": "scored",
        "score": 83,
        "evidenceCoverage": 0.8,
        "requiredSkillsNotEvidenced": [],
        "explanation": "Relevance 83/100, based on 80% of the weighted criteria the posting provides evidence for (not a hiring probability). Your profile shows 1 of 1 required skill items (Python). Preferred but not evidenced: Linux, Ubuntu, Machine Learning, Docker and 4 more. Location: Location is stated as worldwide / anywhere. This does not confirm work authorization."
    }
}
```

## Supported sources

Two public source families, eight employer boards, each verified on **2026-09-23** against the employer's own careers page:

| Source id | Employer | Family | Notes |
| --- | --- | --- | --- |
| `greenhouse:moniepoint` | Moniepoint | Greenhouse | Nigeria-heavy; remote roles by country |
| `greenhouse:jumia` | Jumia | Greenhouse | Ghana, Nigeria, Senegal, Kenya, Egypt, Uganda, Côte d'Ivoire |
| `greenhouse:alxafrica` | ALX Africa | Greenhouse | South Africa, Rwanda, Nigeria, remote |
| `greenhouse:flyzipline` | Zipline | Greenhouse | Mostly US; Côte d'Ivoire, Rwanda, Nigeria field roles; many internships |
| `greenhouse:canonical` | Canonical | Greenhouse | Many "Home based – Worldwide/EMEA" roles; graduate programme |
| `greenhouse:gitlab` | GitLab | Greenhouse | Remote but mostly country-restricted |
| `lever:dlocal` | dLocal | Lever | Lagos, Nairobi, Cape Town, Dakar, Cairo offices |
| `lever:binance` | Binance | Lever | Global; "Accelerator Program" early-career track |

Measured coverage, access methods, limits and missing fields: [docs/source-coverage.md](https://github.com/BlessingEmejulu/ai-job-match-agent/blob/main/docs/source-coverage.md).

## Matching, eligibility and AI

- **Match score** — deterministic and reproducible; only dimensions with evidence are scored, and the score is withheld below 50% evidence coverage. Skills you did not list are reported as *"not evidenced in your profile"*, never as missing. Details: [docs/architecture.md](https://github.com/BlessingEmejulu/ai-job-match-agent/blob/main/docs/architecture.md#matching).
- **Geographic eligibility** — assessed against your declared country plus the countries you declared work authorization for. Work authorization is never inferred from nationality, timezone or location. "Supported" means the location evidence includes you; it does not prove legal authorization or that the employer will hire you.
- **AI assistance (optional, bounded)** — when enabled by the Actor owner, a language model re-reads up to N of the *most ambiguous* shortlisted postings to extract requirements the rules missed. Every AI claim must quote the posting verbatim or it is discarded; AI can add restrictions but never remove them; results are labelled `ai_assisted`. If AI is unavailable or fails, the Actor uses its rules-only analysis and says so. Posting text (not your profile) is sent to Anthropic for these calls.

## Privacy

- The candidate profile is used only in memory for the current run. It is **not** written to the dataset, the run summary, or logs.
- Do not put your name, contact details, age, gender, photo or CV into the profile — the input schema rejects unknown fields.
- Delivered records contain only public job data plus match fields derived from your profile (for example, which of the job's skills your profile evidences). Treat a dataset from a match-mode run as personal; do not share it publicly.
- Run storage follows your Apify account's [data retention](https://docs.apify.com/platform/storage/usage#data-retention) settings.

## FAQ and limitations

- **Is this every job in Africa?** No. It reads eight verified employer boards; see [docs/limitations.md](https://github.com/BlessingEmejulu/ai-job-match-agent/blob/main/docs/limitations.md).
- **Why is a remote job marked `unknown`?** The posting says "Remote" without saying where from. Ask the recruiter; the Actor will not guess.
- **Why no deadline?** Most boards do not publish one. Expired deadlines are excluded when they are stated.
- **Is the score my chance of getting hired?** No. It is relevance to the posting's stated requirements.

Our Actors are ethical and do not extract any private user data, such as email addresses, gender, or location. They only extract what the user has chosen to share publicly. We therefore believe that our Actors, when used for ethical purposes by Apify users, are safe. However, you should be aware that your results could contain personal data. Personal data is protected by the GDPR in the European Union and by other regulations around the world. You should not scrape personal data unless you have a legitimate reason to do so. If you're unsure whether your reason is legitimate, consult your lawyers.

Found a problem? Open an issue in the **Issues** tab. For programmatic access see the **API** tab.

## Technologies and tools used

| Area | Tools |
| --- | --- |
| Actor runtime | [Apify SDK for JavaScript](https://docs.apify.com/sdk/js) 3.7 on Node.js 24 (`apify/actor-node:24` Docker image), TypeScript 6 in strict mode |
| Data sources | [Greenhouse Job Board API](https://developers.greenhouse.io/job-board.html) and [Lever Postings API](https://github.com/lever/postings-api): public JSON APIs, with a verified registry of 8 employer boards |
| Parsing & validation | [Cheerio](https://cheerio.js.org/) for HTML-to-text and section parsing, [Zod](https://zod.dev/) for input, output and AI-output validation |
| Analysis | Rule-based requirement extraction, skills dictionary, country/city/region eligibility engine and weighted match scoring, all written for this Actor |
| Optional AI | [Anthropic Claude API](https://docs.anthropic.com/) via `@anthropic-ai/sdk` with structured outputs; every AI claim must quote the posting (owner-gated, off by default) |
| Storage & billing | Apify Dataset and Key-value store; pay-per-event monetization via `Actor.pushData(record, 'opportunity-delivered')` |
| Testing | [Vitest](https://vitest.dev/): 99 fixture tests plus live smoke tests |
| Website | [Next.js](https://nextjs.org/) 16, React 19, Tailwind CSS 4, Upstash Redis rate limits, deployed on [Vercel](https://vercel.com/) at https://ai-job-match-agent.vercel.app |

## For developers

```bash
npm ci
npm test            # fixture tests, no network
npm run test:live   # live smoke tests against the public job-board APIs
apify run --purge   # local run using storage/key_value_stores/default/INPUT.json
```

- Architecture and the five-stage pipeline (Discover → Decide → Analyze → Match → Explain): [docs/architecture.md](https://github.com/BlessingEmejulu/ai-job-match-agent/blob/main/docs/architecture.md)
- Monetization and PPE testing: [docs/monetization.md](https://github.com/BlessingEmejulu/ai-job-match-agent/blob/main/docs/monetization.md)
- GitHub → Apify deployment and website environment variables: [docs/deployment.md](https://github.com/BlessingEmejulu/ai-job-match-agent/blob/main/docs/deployment.md)
- Competitive analysis: [docs/competitive-analysis.md](https://github.com/BlessingEmejulu/ai-job-match-agent/blob/main/docs/competitive-analysis.md)
- Demo script: [docs/demo-script.md](https://github.com/BlessingEmejulu/ai-job-match-agent/blob/main/docs/demo-script.md)
- Website (Next.js, in `web/`): [web/README.md](https://github.com/BlessingEmejulu/ai-job-match-agent/blob/main/web/README.md)

Source code: MIT licensed. Built for the Apify × She Code Africa BuildHer Hackathon 2026 (Jobs Board track).
