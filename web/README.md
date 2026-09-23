# AI Job Match Agent — website

A small Next.js (App Router, TypeScript, Tailwind CSS) front end for the Apify Actor in the repository root.

- `/` — public, read-only **showcase** of a dated discover-mode run (no candidate data). Search, filters
  (country, work arrangement, seniority, employment type, eligibility, deadline), recommended/recent order,
  evidence and unknowns per job, and links to the employer's application page.
- `/live` — **protected** live runs: access code → signed session → start a capped Actor run → poll status
  until a terminal state → paginated, sanitized results with match explanations.

```bash
npm ci
npm run dev            # http://localhost:3000
npm test               # route/security/unit tests (no network)
npm run typecheck
npm run build && npm run check:secrets
```

### Test live searches locally without an Apify token

`scripts/mock-apify.mjs` stands in for the four Apify API endpoints the site uses and runs the **real**
compiled Actor against the real job boards (development only; production always calls api.apify.com):

```bash
(cd .. && npm run build)            # build the Actor
node scripts/mock-apify.mjs         # http://localhost:8787/v2
# in web/.env.local: APIFY_API_BASE_URL=http://localhost:8787/v2 plus any APIFY_TOKEN/APIFY_ACTOR_ID values,
# LIVE_ACCESS_CODE and a 32+ char SESSION_SECRET
npm run dev
```

The live page shows each Actor stage ("Stage n/4 · …" status messages) as it happens.

Environment variables, security model and deployment: [../docs/deployment.md](../docs/deployment.md).
