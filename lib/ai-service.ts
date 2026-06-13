// Repository analytics AI (Analysis / Insights pages), built on the same
// provider chain as Ask Repo and the Planner: openai (gpt-4o-mini) → groq →
// anthropic → mock, behind the shared budget guard and prompt cache.
//
// Inputs are compact by construction: commit messages, aggregate stats, and
// repo metadata only — never file contents, never the whole repo.

import type { CommitData } from './github-service'
import { PROVIDER_MODELS, resolveProviderName, withFallback } from './ai/provider'
import type { AIProviderName } from './agent/types'
import type { BudgetStatus } from './ai/cost-controls'

export interface AnalyticsMeta {
  provider: AIProviderName
  model: string
  cached: boolean
  degraded: boolean
  /** Why output is mock/degraded, when it is. Safe for the UI. */
  unavailableReason?: string
}

export interface RepoAnalytics {
  summary: string
  insights: string[]
  trends: string
  meta: AnalyticsMeta
}

function buildStatsSummary(commits: CommitData[]): string {
  const totalAdditions = commits.reduce((sum, c) => sum + c.stats.additions, 0)
  const totalDeletions = commits.reduce((sum, c) => sum + c.stats.deletions, 0)
  const uniqueAuthors = new Set(commits.map((c) => c.author.name)).size
  return `${commits.length} recent commits, ${uniqueAuthors} unique authors, +${totalAdditions}/-${totalDeletions} lines`
}

/** Deterministic trend classification from commit messages — no AI call. */
export function analyzeTrends(commits: CommitData[]): string {
  const commitTypes = commits.slice(0, 10).map((c) => {
    const msg = c.message.toLowerCase()
    if (msg.includes('fix')) return 'fix'
    if (msg.includes('feat')) return 'feature'
    if (msg.includes('refactor')) return 'refactor'
    if (msg.includes('docs')) return 'documentation'
    return 'other'
  })
  const typeCount = commitTypes.reduce(
    (acc, type) => {
      acc[type] = (acc[type] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )
  const dominantType = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0]?.[0]
  const trendMap: Record<string, string> = {
    fix: 'Focus on bug fixes and stability improvements',
    feature: 'Active feature development and enhancements',
    refactor: 'Code quality improvements and refactoring',
    documentation: 'Documentation updates and improvements',
    other: 'General maintenance and updates',
  }
  return trendMap[dominantType] || 'Ongoing development activity'
}

function unavailableReason(degraded: boolean, budget: BudgetStatus): string | undefined {
  if (resolveProviderName() === 'mock') {
    return 'No AI provider key configured — set OPENAI_API_KEY (or GROQ_API_KEY / ANTHROPIC_API_KEY) in .env.local.'
  }
  if (degraded && budget.level === 'blocked') return budget.message
  if (degraded) return 'The AI provider returned an error — output fell back to the deterministic mock. Retry shortly.'
  return undefined
}

/**
 * Full analytics bundle for a repository. Cached by repo + analysis type +
 * latest commit SHA, so repeated Analyze clicks for an unchanged repo never
 * re-call the model.
 */
export async function generateRepoAnalytics(repo: string, commits: CommitData[]): Promise<RepoAnalytics> {
  const commitMessages = commits.slice(0, 20).map((c) => c.message)
  const statsSummary = buildStatsSummary(commits)
  // The latest commit SHA stands in for an indexed-snapshot hash: same repo,
  // same head → same evidence → cache hit.
  const snapshot = commits[0]?.sha ?? 'empty'

  const summaryCall = await withFallback((p) => p.generateRepoSummary(repo, commitMessages), {
    cacheKey: JSON.stringify({ kind: 'analytics-summary', repo, snapshot }),
  })
  const insightsCall = await withFallback(
    (p) => p.generateRepoInsights({ repo, statsSummary, commitMessages }),
    { cacheKey: JSON.stringify({ kind: 'analytics-insights', repo, snapshot }) }
  )

  const provider = summaryCall.provider
  const degraded = summaryCall.degraded || insightsCall.degraded
  return {
    summary: summaryCall.result,
    insights: insightsCall.result,
    trends: analyzeTrends(commits),
    meta: {
      provider,
      model: PROVIDER_MODELS[provider],
      cached: summaryCall.cached && insightsCall.cached,
      degraded,
      unavailableReason: unavailableReason(degraded, summaryCall.budget),
    },
  }
}
