# RepoPulse Agent Deployment

This project is intended to deploy as the RepoPulse Agent application for `repopulse.live`.

Do not commit local secrets or runtime usage files. Keep `.env.local`, `.ai-usage.json`, `.vercel/`, `.next/`, and `node_modules/` local only.

## Production Environment Variables

Configure these in Vercel Project Settings -> Environment Variables. Use real values in Vercel only; do not commit secret values to the repository.

```env
OPENAI_API_KEY=
AI_DAILY_CALL_LIMIT=300
AI_REPORT_DAILY_LIMIT=50
SANDBOX_EXECUTION_ENABLED=false
NEXT_PUBLIC_SANDBOX_EXECUTION_ENABLED=false
```

Optional tuning variables:

```env
OPENAI_MAX_OUTPUT_TOKENS=1200
OPENAI_MAX_CONTEXT_CHARS=35000
OPENAI_MAX_RETRIEVED_FILES=8
OPENAI_SNIPPETS_PER_FILE=3
OPENAI_SNIPPET_CHARS=2500
AI_MONTHLY_BUDGET_USD=12
AI_CACHE_ENABLED=true
```

## Sandbox Safety

Keep sandbox execution disabled in Vercel production at first:

```env
SANDBOX_EXECUTION_ENABLED=false
NEXT_PUBLIC_SANDBOX_EXECUTION_ENABLED=false
```

Reason: the sandbox feature clones repositories and runs package manager/build/test commands. That should not run inside a normal Vercel serverless deployment until a separate worker or backend sandbox service is available.

When disabled, the app should still support Codebase Map, Ask Repo, Change Planner, Diff Review, Verification recommendations, Agent Runs, and Final Report. The sandbox API is gated server-side and returns a disabled result without running commands unless `SANDBOX_EXECUTION_ENABLED=true`.

## Local Verification Before Deploy

Run these before pushing:

```bash
npx tsc --noEmit
npm run test
npm run build
```

The project uses npm for deployment because `package-lock.json` is present. A `pnpm-lock.yaml` is also present; choose one package manager before long-term maintenance to avoid lockfile drift.

## Deployment Options

### Option A: Update Existing Vercel Project

Use this if the current `repopulse.live` Vercel project is clean and you want this repository to become its source.

1. Push this project to GitHub.
2. In Vercel, open the existing project that owns `repopulse.live`.
3. Connect the new GitHub repository or update the linked repository.
4. Add the production environment variables listed above.
5. Push to `main`.
6. Let Vercel deploy production.
7. Verify `https://repopulse.live`.

### Option B: Safer Domain Swap

Recommended if the old Vercel project is messy, has stale settings, or you want to test this version without disturbing production.

1. Push this project to a new GitHub repository.
2. Create a new Vercel project from that repository.
3. Add the production environment variables listed above.
4. Deploy and test the Vercel preview URL.
5. Remove `repopulse.live` from the old Vercel project.
6. Add `repopulse.live` to the new Vercel project.
7. Verify DNS/domain configuration in Vercel.
8. Visit `https://repopulse.live` and confirm the new RepoPulse Agent is live.

## GitHub Setup Commands

Only run these after choosing or creating the GitHub repository URL:

```bash
git init
git add .
git status
git commit -m "Deploy RepoPulse Agent"
git branch -M main
git remote add origin <GITHUB_REPO_URL>
git push -u origin main
```

Before committing, confirm `git status` does not include `.env.local`, `.ai-usage.json`, `.vercel/`, `.next/`, or `node_modules/`.

## Remaining Production Risks

- Sandbox execution is intentionally disabled for Vercel production until a dedicated worker/backend is set up.
- The app currently relies on browser/local run state for some workflow history. Confirm the desired persistence model before relying on it as a multi-user production system.
- Keep production `OPENAI_API_KEY` scoped and rotate it if it has ever been exposed.
- Build output may warn about stale `baseline-browser-mapping` data or missing `metadataBase`; these are not deployment blockers, but can be cleaned up later.
