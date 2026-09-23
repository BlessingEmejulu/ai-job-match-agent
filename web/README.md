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

Environment variables, security model and deployment: [../docs/deployment.md](../docs/deployment.md).
