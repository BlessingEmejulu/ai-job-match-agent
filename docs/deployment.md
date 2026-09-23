# Deployment

Repository: https://github.com/BlessingEmejulu/ai-job-match-agent (Actor at the root, website in `web/`).

## 1. Actor on Apify

### Option A — push from this repository with the Apify CLI

```bash
npm install -g apify-cli
apify login                 # interactive; do not pass the token on the command line
apify info                  # confirm the Apify username that will own the Actor
apify push                  # builds in the cloud from .actor/actor.json + Dockerfile
```

The Actor name comes from `.actor/actor.json` (`ai-job-match-agent`), so the Actor id becomes
`<apify-username>~ai-job-match-agent`.

### Option B — link the GitHub repository

In Apify Console → **Actors → Develop new → Link Git repository** (source type *Git repository*, see
[source types](https://docs.apify.com/platform/actors/development/deployment/source-types)):

- Git URL: `https://github.com/BlessingEmejulu/ai-job-match-agent`
- Branch: `main`, folder: repository root (the `.actor/` directory is at the root)
- Build on push: enable the GitHub integration/webhook if you want automatic builds

### After the first build

1. **Environment variables** (Actor → Source → Environment variables), all optional:
   - `ANTHROPIC_API_KEY` — mark as **secret**. Only needed for the AI step.
   - `AI_MAX_ANALYSES_CAP` — leave `0` (AI off for everyone) unless you accept the owner-paid AI cost.
   - `ANTHROPIC_MODEL` — optional model override.
2. **Settings**: default memory 512 MB (the Actor declares 256–1024 MB), timeout 300 s.
3. **Run once** in Console with `examples/discover-input.json`, then with `examples/match-input.json`
   (fictional profile). Check `RUN_SUMMARY` and the dataset views.
4. **Monetization**: configure pay-per-event exactly as in [monetization.md](monetization.md) — custom
   event `opportunity-delivered`, remove `apify-default-dataset-item`.
5. **Publication** tab: title, description, categories (Jobs), icon, README (this repository's README is
   used), example run, then **Publish to Store**. Apify requires at least one successful run first.
6. For the website's public showcase, run a **discover-mode** input (no candidate profile) and note the
   run's **default dataset id**.

### Local checks before pushing

```bash
npm ci && npm run typecheck && npm test && npm run build
npm run test:live                      # hits the real job-board APIs
apify validate-schema                  # validates .actor schemas
docker build -t ai-job-match-agent .   # same Dockerfile the cloud uses
```

## 2. Website on Vercel

The website is a standard Next.js app in `web/`. On Vercel: **New Project → import the GitHub repo →
Root Directory `web`**. Framework preset: Next.js. Node 22+.

### Environment variables (server-side only — never prefix with `NEXT_PUBLIC_`)

| Variable | Required for | Notes |
| --- | --- | --- |
| `APIFY_TOKEN` | live runs, Apify showcase | Owner's API token. Prefer a token scoped to running this Actor and reading its storages. |
| `APIFY_ACTOR_ID` | live runs | `<apify-username>~ai-job-match-agent` |
| `APIFY_SHOWCASE_DATASET_ID` | public showcase | Dataset of a **discover-mode** run. If unset, the dated snapshot bundled in `web/src/data/` is shown. |
| `LIVE_ACCESS_CODE` | live runs | Shared code for the protected live page. |
| `SESSION_SECRET` | live runs | ≥32 random characters, e.g. `openssl rand -hex 32`. |
| `LIVE_MAX_RESULTS` | optional | Default 10, capped at 25. |
| `LIVE_MAX_TOTAL_CHARGE_USD` | optional | Default 0.50, capped at 2.00. Passed as `maxTotalChargeUsd` on every run. |
| `LIVE_MAX_RUNS_PER_DAY` | optional | Default 20 (global). Plus 3 runs per session per hour and 1 active run per session. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | live runs in production | Persistent rate/concurrency counters (Upstash Redis REST). Without them, production refuses live runs. |

Local development: copy the variables into `web/.env.local` (gitignored). Without Upstash, local dev uses
in-memory counters and says so in code.

### Security model

- Tokens are read only in server modules (`import 'server-only'`) and sent to Apify in the
  `Authorization` header. `npm run check:secrets` (after `next build`) scans the client bundle for secret
  values; it found none on 2026-09-23.
- The public page never starts runs. Live runs require the access code → an `httpOnly`, `SameSite=Strict`
  signed session cookie; POST routes also check `Origin`.
- `/api/runs` returns an application-owned **signed reference** bound to the session, not the Apify run or
  dataset id. Status and item routes accept only references signed by this server for the same session, so
  visitors cannot read arbitrary runs or datasets with the owner's token.
- Every run uses server-fixed limits (`maxResults`, requests, runtime, memory 512 MB, timeout 180 s,
  `maxTotalChargeUsd`); the browser cannot enable AI or raise limits (unknown fields are rejected).
- Dataset content is sanitized before it reaches the browser (whitelisted fields, capped strings) and
  links are shown only for HTTPS URLs on approved job-board/employer hosts.
- Security headers: `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, strict referrer policy.

### Privacy note for live runs

Skills, years of experience, desired roles, country and student status entered on the live page are sent
as Actor input. Apify stores run input in the run's key-value store in the **owner's** account under its
data-retention settings. The Actor never copies the profile into the dataset or `RUN_SUMMARY`. The form
asks visitors not to enter names, contacts or CVs.
