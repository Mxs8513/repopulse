# RepoPulse Agent

> **AI codebase intelligence with safe change planning.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-blue)](https://reactjs.org/)
[![Tests](https://img.shields.io/badge/Vitest-47%20passing-brightgreen)](#testing)

### 🚀 [Live Demo](https://repopulse.vercel.app) • [GitHub](https://github.com/Mxs8513/repopulse)

RepoPulse Agent is a developer tool that indexes GitHub repositories, maps codebase structure, answers grounded code questions, plans multi-step changes, proposes file-level diffs, and requires human approval before changes are applied.

> Evolved from **RepoPulse**, an AI-powered GitHub analytics dashboard. The original analytics (commits, contributors, languages, activity timeline, AI summaries) remain as the repository observability layer inside a larger agentic workflow.

## Why this is different

Most AI coding tools are either chatbots or autocomplete. RepoPulse Agent treats code changes as a **controlled workflow**:

```
GitHub Repo → Indexer → Codebase Map → Retrieval Layer → AI Planner
           → Diff Proposal → Verification Plan → Human Approval → (Optional PR)
```

The AI never silently modifies or merges code. Every step is visible, explainable, logged, and approved by the developer.

## Core modules

| Module | What it does |
|---|---|
| **Overview** (`/`) | Selected repo, agent activity, provider status, repository analytics |
| **Codebase Map** (`/codebase-map`) | Recursive file-tree indexing with deterministic classification (page / component / API / service / test / config / CI / DB / docs), framework + entrypoint detection, architecture summary |
| **Ask Repo** (`/ask`) | Grounded Q&A: question → intent classification → keyword retrieval over the indexed tree → snippet fetching → AI summarization of evidence only. Every answer cites source files with retrieval reasons and confidence |
| **Change Planner** (`/planner`) | Task → safety gate → affected-file selection → structured plan (steps, risks, assumptions, test plan, rollback plan, risk level, scope) |
| **Diff Review** (`/diff-review`) | Stage A conceptual patches per file, grounded in actual fetched file content, with per-file approve/reject buttons. Files that can't be fetched get "Need file content before proposing exact patch" — never invented code |
| **Verification** (`/verification`) | Recommended build/test/lint commands derived from the repo's real `package.json` scripts / `pyproject.toml` / `go.mod`. Commands are recommendations only — nothing is executed |
| **Agent Runs** (`/agent-runs`) | Audit log of every workflow: plans, diffs, refusals, errors, and approval decisions with timestamps |
| **Analytics** (`/commits`, `/timeline`, `/analysis`, `/insights`) | The original RepoPulse observability features |

## Safety model

- **Safety gate before planning.** Every task is classified (`safe_code_change`, `risky_destructive_change`, `secrets_request`, `repo_deletion_request`, `bypass_review_request`, `unknown`) before any retrieval or AI call. Unsafe requests are refused with a reason and a safer alternative — and the refusal is logged.
- **Grounding.** Answers and diffs only reference files that exist in the indexed tree. If evidence is insufficient, the system says so instead of hallucinating.
- **Human approval gate.** Nothing is committed, pushed, merged, or applied. Diffs are proposals with per-file approve/reject decisions recorded in the audit log.
- **Token hygiene.** The GitHub token is used server-side only and never sent to the browser; debug logs print length only, never the value.
- **Bounded retrieval.** Binary files are skipped, file content fetches are capped at 100 KB, diff generation is capped at 5 files per run.
- **No code execution.** Verification is a plan, not a runner. Sandboxed execution (Docker / GitHub Actions) is a deliberate later phase.

## Tech stack

- **Next.js 16 (App Router)** + **TypeScript** + **React 18**
- **GitHub API** via Octokit (tree indexing, file content, commits, contributors)
- **AI providers:** Groq (Llama) and/or Anthropic (Claude) behind a provider abstraction, with a deterministic **mock mode** that works with zero API keys
- **Tailwind CSS 4 + shadcn/ui**, Recharts for analytics
- **Vitest** — unit tests over the deterministic core (classification, safety, intent, retrieval, verification)
- **Vercel-ready**; agent runs persist to localStorage today, with domain models shaped for a Prisma/Drizzle database later

## Quick start

```bash
npm install
npm run dev
```

Optional `.env.local` (everything works without it, at lower rate limits and in mock AI mode — see `.env.example`):

```bash
MY_GITHUB_PAT=ghp_xxx        # or GITHUB_TOKEN — server-side only, raises GitHub rate limits
GROQ_API_KEY=gsk_xxx         # optional — enables Groq (Llama) provider
ANTHROPIC_API_KEY=sk-ant-xxx # optional — enables Claude provider
AI_PROVIDER=groq             # optional override: groq | anthropic | mock
```

Provider selection: explicit `AI_PROVIDER` → Groq if keyed → Anthropic if keyed → mock. If a live provider errors mid-request, the response degrades to mock and is labeled as such. Mock outputs are deterministic and clearly badged in the UI.

```bash
npm run build   # production build
npm run test    # vitest suite
npm run lint    # eslint
```

## Demo script

1. Connect a repo on **Overview** (e.g. `facebook/react`).
2. Open **Codebase Map** — file tree, detected stack, architecture summary, API routes, test inventory.
3. **Ask Repo**: "Where is GitHub API integration implemented?" — answer + cited source files + snippets + confidence.
4. **Change Planner**: "Add caching to the repo API" — structured plan with affected files, risk badge, test plan.
5. Try "commit without approval" — watch the safety gate refuse and log it.
6. Click **Generate Proposed Diff** — per-file patch cards grounded in fetched content.
7. Approve/reject files in **Diff Review**, then open **Verification** for the recommended checks.
8. Review the full history in **Agent Runs**.

## Architecture

```
lib/agent/
  types.ts            # domain model: CodebaseMap, AskAnswer, ChangePlan, DiffProposal, AgentRun…
  file-classifier.ts  # deterministic path classification + framework/entrypoint detection
  intent.ts           # Ask Repo question routing + keyword extraction
  retrieval.ts        # evidence scoring over the indexed tree (intent-boosted)
  safety.ts           # request safety gate (refuses before any AI call)
  verification.ts     # toolchain detection → recommended commands (never executed)
  map-cache.ts        # server-side TTL cache of indexed trees
  run-store.ts        # client-side audit log (localStorage, DB-ready interfaces)
lib/ai/provider.ts    # groq | anthropic | mock abstraction with graceful degradation
app/api/              # codebase-map, ask, plan, diff, verification, repo, health
```

Deterministic analysis comes first; AI only summarizes retrieved evidence. That ordering is what makes answers grounded and the tool safe.

## Testing

```bash
npm run test
```

Vitest covers the deterministic core: file classification, repo-tree indexing, framework detection, safety-request classification, Ask Repo intent routing, keyword extraction, retrieval scoring/grounding (including "never cite a file that isn't indexed"), affected-file selection, toolchain detection, and verification-plan generation.

## Roadmap

- **Phase 8 (optional):** sandboxed verification runner (Docker with allowlisted commands, timeouts, no network) or GitHub Actions-based verification.
- **Phase 9 (optional):** PR creation after approval — branch, commit approved patches, open PR with full audit trail; gated behind an explicit confirmation modal.
- Database persistence (Prisma/Drizzle) for repositories, indexed files, and agent runs.

## License

MIT
