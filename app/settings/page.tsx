'use client'

import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Settings } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface HealthInfo {
  githubTokenConfigured?: boolean
  aiProvider?: string
  mockMode?: boolean
}

interface AIUsageInfo {
  provider: string
  budget: {
    level: 'ok' | 'warn_50' | 'warn_80' | 'blocked'
    monthUSD: number
    budgetUSD: number
    percentUsed: number
    callsToday: number
    dailyLimit: number
    message: string
  }
  usage: { month: string; totalCalls: number; callsToday: number; estimatedUSD: number }
  limits: { maxContextChars: number; maxOutputTokens: number; cacheEnabled: boolean }
}

export default function SettingsPage() {
  const { data } = useSWR<HealthInfo>('/api/health', fetcher)
  const { data: aiUsage } = useSWR<AIUsageInfo>('/api/ai-usage', fetcher)

  return (
    <div className="relative min-h-screen p-4 lg:p-6 space-y-6 z-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Provider and environment status — secrets never leave the server</p>
        </div>
        <Settings className="w-8 h-8 text-muted-foreground" />
      </div>

      <Card className="p-6 bg-card border-border space-y-4">
        <h3 className="text-lg font-semibold text-foreground">AI Provider</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Active provider:</span>
          <Badge
            variant="outline"
            className={data?.mockMode ? 'text-warning border-warning uppercase' : 'text-success border-success uppercase'}
          >
            {data?.aiProvider ?? 'loading…'}
          </Badge>
        </div>
        {data?.mockMode && (
          <p className="text-sm text-warning">
            Mock mode is active: AI outputs are deterministic placeholders assembled from retrieved repository
            evidence. Set <code className="font-mono">OPENAI_API_KEY</code>,{' '}
            <code className="font-mono">GROQ_API_KEY</code>, or{' '}
            <code className="font-mono">ANTHROPIC_API_KEY</code> in <code className="font-mono">.env.local</code> for
            AI-written output. Deterministic features (Codebase Map, retrieval, verification plans) work fully without
            keys.
          </p>
        )}
        <div className="text-sm text-muted-foreground space-y-1">
          <p>
            <code className="font-mono">AI_PROVIDER</code> = openai | groq | anthropic | mock (optional override)
          </p>
          <p>
            <code className="font-mono">OPENAI_API_KEY</code> — enables OpenAI (gpt-4o-mini, cost-controlled default)
          </p>
          <p>
            <code className="font-mono">GROQ_API_KEY</code> — optional, enables Groq (Llama) provider
          </p>
          <p>
            <code className="font-mono">ANTHROPIC_API_KEY</code> — optional, enables Claude provider
          </p>
        </div>
      </Card>

      <Card className="p-6 bg-card border-border space-y-4">
        <h3 className="text-lg font-semibold text-foreground">AI Usage & Budget</h3>
        {aiUsage ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                variant="outline"
                className={
                  aiUsage.budget.level === 'ok'
                    ? 'text-success border-success uppercase'
                    : aiUsage.budget.level === 'blocked'
                      ? 'text-destructive border-destructive uppercase'
                      : 'text-warning border-warning uppercase'
                }
              >
                {aiUsage.budget.level === 'ok' ? 'within budget' : aiUsage.budget.level.replace('_', ' ')}
              </Badge>
              <span className="text-sm text-muted-foreground">
                ${aiUsage.usage.estimatedUSD.toFixed(2)} of ${aiUsage.budget.budgetUSD} estimated this month (
                {aiUsage.budget.percentUsed}%) · {aiUsage.budget.callsToday}/{aiUsage.budget.dailyLimit} calls today
              </span>
            </div>
            <div className="h-2 rounded bg-muted overflow-hidden">
              <div
                className={`h-full ${
                  aiUsage.budget.level === 'blocked'
                    ? 'bg-destructive'
                    : aiUsage.budget.percentUsed >= 50
                      ? 'bg-warning'
                      : 'bg-success'
                }`}
                style={{ width: `${Math.min(aiUsage.budget.percentUsed, 100)}%` }}
              />
            </div>
            {aiUsage.budget.level !== 'ok' && (
              <p
                className={`text-sm ${aiUsage.budget.level === 'blocked' ? 'text-destructive' : 'text-warning'}`}
              >
                {aiUsage.budget.message}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Costs are conservative estimates (gpt-4o-mini pricing, worst-case output). AI is called on-demand only —
              never during indexing or page loads. Repeated identical prompts are served from cache
              {aiUsage.limits.cacheEnabled ? '' : ' (currently disabled via AI_CACHE_ENABLED=false)'}. At 100% of the
              budget or the daily call limit, live calls automatically fall back to the free mock provider.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Loading usage…</p>
        )}
      </Card>

      <Card className="p-6 bg-card border-border space-y-4">
        <h3 className="text-lg font-semibold text-foreground">GitHub Access</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Server token:</span>
          <Badge
            variant="outline"
            className={
              data?.githubTokenConfigured ? 'text-success border-success uppercase' : 'text-warning border-warning uppercase'
            }
          >
            {data === undefined ? 'loading…' : data.githubTokenConfigured ? 'configured' : 'not configured'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Set <code className="font-mono">MY_GITHUB_PAT</code> (or <code className="font-mono">GITHUB_TOKEN</code>) in{' '}
          <code className="font-mono">.env.local</code>. The token is used server-side only and is never sent to the
          browser. Without a token, public repositories still work at lower GitHub rate limits.
        </p>
      </Card>

      <Card className="p-6 bg-card border-border space-y-2">
        <h3 className="text-lg font-semibold text-foreground">Safety guarantees</h3>
        <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
          <li>The agent never commits, pushes, merges, or applies changes — diffs are proposals requiring approval.</li>
          <li>Unsafe tasks (secrets exfiltration, repo deletion, review bypass) are refused before planning.</li>
          <li>Every workflow is logged in Agent Runs, including refusals and approval decisions.</li>
          <li>File retrieval skips binaries and files over 100 KB; answers cite only files that actually exist.</li>
          <li>Verification commands are recommendations — nothing is executed in your environment.</li>
        </ul>
      </Card>
    </div>
  )
}
