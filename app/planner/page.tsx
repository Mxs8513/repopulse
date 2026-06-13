'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { RepoBanner } from '@/components/agent/repo-banner'
import { CategoryBadge, ConfidenceBadge, ProviderBadge, RiskBadge } from '@/components/agent/badges'
import { useRepository } from '@/lib/repository-context'
import { appendEvent, createRun, setRunStatus, statusAfterDiffFailure, updateRun } from '@/lib/agent/run-store'
import { callApi } from '@/lib/client/api-errors'
import type { AgentRun, ChangePlan, SafetyResult, VerificationPlan } from '@/lib/agent/types'
import { ClipboardList, ShieldAlert } from 'lucide-react'

const EXAMPLE_TASKS = [
  'Add caching to the repo API',
  'Improve GitHub rate limit handling',
  'Add tests for github-service',
  'Add a new Insights widget for top changed files',
]

interface BudgetInfo {
  level: 'ok' | 'warn_50' | 'warn_80' | 'blocked'
  monthUSD: number
  budgetUSD: number
  message: string
}

interface PlanResponse {
  refused: boolean
  safety: SafetyResult
  plan?: ChangePlan
  verification?: VerificationPlan
  degraded?: boolean
  cached?: boolean
  budget?: BudgetInfo
}

interface DiffEstimate {
  files: number
  estimatedUSD: number
  budget: BudgetInfo
}

export default function ChangePlannerPage() {
  const router = useRouter()
  const { selectedRepo } = useRepository()
  const [task, setTask] = useState('')
  const [loading, setLoading] = useState(false)
  const [diffLoading, setDiffLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PlanResponse | null>(null)
  const [run, setRun] = useState<AgentRun | null>(null)
  const [diffEstimate, setDiffEstimate] = useState<DiffEstimate | null>(null)

  // Cost preview before the expensive per-file Diff Proposal calls. This is
  // a GitHub-only estimate request — no AI call happens until the user clicks.
  useEffect(() => {
    setDiffEstimate(null)
    const plan = result?.plan
    if (!plan || !selectedRepo || plan.affectedFiles.length === 0) return
    let cancelled = false
    fetch('/api/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo: selectedRepo,
        task: plan.taskSummary,
        files: plan.affectedFiles.map((f) => f.path),
        estimateOnly: true,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.estimateOnly) setDiffEstimate(data)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [result, selectedRepo])

  const generatePlan = async (taskText: string) => {
    const trimmed = taskText.trim()
    if (!trimmed || !selectedRepo || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    setRun(null)
    try {
      const data = await callApi<PlanResponse>('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: selectedRepo, task: trimmed }),
      })
      setResult(data)

      // Every planning attempt is logged as an Agent Run — including refusals.
      const newRun = createRun({
        repo: selectedRepo,
        task: trimmed,
        intent: data.safety.classification,
        provider: data.plan?.provider ?? 'mock',
      })
      const updated = updateRun(newRun.runId, {
        status: data.refused ? 'rejected' : 'planned',
        plan: data.plan ?? null,
        retrievedFiles: data.plan?.affectedFiles ?? [],
        verification: data.verification ?? null,
        errors: data.refused ? [`Refused: ${data.safety.reason}`] : [],
      })
      appendEvent(
        newRun.runId,
        data.refused ? 'run_failed' : 'plan_generated',
        data.refused
          ? `Request refused by the safety gate: ${data.safety.reason}`
          : `Plan generated for ${selectedRepo} (${data.plan?.affectedFiles?.length ?? 0} affected file(s)).`
      )
      setRun(updated ?? newRun)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate plan')
    } finally {
      setLoading(false)
    }
  }

  const generateDiff = async () => {
    if (!run || !result?.plan || !selectedRepo || diffLoading) return
    setDiffLoading(true)
    setError(null)
    setRunStatus(run.runId, 'awaiting_diff')
    try {
      const diff = await callApi<any>('/api/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: selectedRepo,
          task: run.task,
          planSteps: result.plan.steps,
          files: result.plan.affectedFiles.map((f) => f.path),
          testsToRun: result.plan.testPlan,
        }),
      })
      updateRun(run.runId, { diff, status: 'diff_generated' })
      appendEvent(run.runId, 'diff_generated', `Proposed diff generated for ${diff.patches?.length ?? 0} file(s).`)
      if (diff.verificationSummary) {
        const s = diff.verificationSummary
        appendEvent(
          run.runId,
          'verification_completed',
          `Verification: ${s.passed} passed, ${s.needsReview} need review, ${s.failed} failed.`
        )
      }
      router.push(`/diff-review?run=${run.runId}`)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Diff generation failed'
      // The plan succeeded — a failed diff attempt must not fail the run.
      // Status returns to 'planned' so the user can simply retry.
      updateRun(run.runId, {
        status: statusAfterDiffFailure(run),
        errors: [...run.errors, `Diff attempt failed: ${message}`],
      })
      appendEvent(run.runId, 'run_failed', `Diff generation failed: ${message}`)
      setError(message)
    } finally {
      setDiffLoading(false)
    }
  }

  const rejectPlan = () => {
    if (!run) return
    setRunStatus(run.runId, 'rejected')
    setResult(null)
    setRun(null)
    setTask('')
  }

  return (
    <div className="relative min-h-screen p-4 lg:p-6 space-y-6 z-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Change Planner</h1>
          <p className="text-muted-foreground mt-1">
            Describe a coding task — get a structured, reviewable implementation plan before any diff is proposed
          </p>
        </div>
        <ClipboardList className="w-8 h-8 text-muted-foreground" />
      </div>

      <RepoBanner />

      <Card className="p-6 bg-card border-border space-y-4">
        <Textarea
          placeholder={selectedRepo ? 'e.g. Add caching to the repo API' : 'Select a repository first'}
          value={task}
          onChange={(e) => setTask(e.target.value)}
          disabled={!selectedRepo || loading}
          rows={3}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => generatePlan(task)} disabled={!selectedRepo || loading || !task.trim()}>
            {loading ? 'Planning…' : 'Generate Plan'}
          </Button>
          {EXAMPLE_TASKS.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTask(t)
                generatePlan(t)
              }}
              disabled={!selectedRepo || loading}
              className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
            >
              {t}
            </button>
          ))}
        </div>
      </Card>

      {error && (
        <Card className="p-4 bg-card border-destructive/50">
          <p className="text-destructive text-sm">{error}</p>
        </Card>
      )}

      {/* Safety refusal */}
      {result?.refused && (
        <Card className="p-6 bg-card border-destructive/50 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-destructive" />
            <h3 className="text-lg font-semibold text-foreground">Request refused</h3>
            <Badge variant="outline" className="text-destructive border-destructive uppercase">
              {result.safety.classification.replace(/_/g, ' ')}
            </Badge>
          </div>
          <p className="text-sm text-foreground">{result.safety.reason}</p>
          {result.safety.suggestion && (
            <p className="text-sm text-muted-foreground">Safer alternative: {result.safety.suggestion}</p>
          )}
        </Card>
      )}

      {/* Plan output */}
      {result?.plan && !result.refused && (
        <Card className="p-6 bg-card border-border space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground flex-1 min-w-48">{result.plan.taskSummary}</h3>
            <RiskBadge risk={result.plan.riskLevel} />
            <Badge variant="outline" className="text-muted-foreground border-border uppercase">
              {result.plan.scope}
            </Badge>
            <ConfidenceBadge confidence={result.plan.confidence} />
            <ProviderBadge provider={result.plan.provider} degraded={result.degraded} />
          </div>

          <div>
            <p className="text-sm font-medium text-foreground mb-2">Implementation steps</p>
            <ol className="space-y-2">
              {result.plan.steps.map((step, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-3">
                  <span className="text-primary font-mono shrink-0">{String(i + 1).padStart(2, '0')}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <div>
            <p className="text-sm font-medium text-foreground mb-2">
              Likely affected files ({result.plan.affectedFiles.length})
            </p>
            {result.plan.affectedFiles.length > 0 ? (
              <div className="space-y-2">
                {result.plan.affectedFiles.map((f) => (
                  <div key={f.path} className="flex flex-wrap items-center gap-2 border border-border rounded-md p-2.5">
                    <span className="text-sm font-mono text-foreground flex-1 min-w-40 truncate">{f.path}</span>
                    <CategoryBadge category={f.category} />
                    <span className="text-xs text-muted-foreground">{f.reason}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-warning">
                No files matched this task in the indexed tree — the plan is structural only. Refine the task with
                concrete file/feature names for a grounded diff.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Risks</p>
              <ul className="space-y-1 text-sm text-muted-foreground list-disc pl-4">
                {result.plan.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Assumptions</p>
              <ul className="space-y-1 text-sm text-muted-foreground list-disc pl-4">
                {result.plan.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Test plan</p>
              <ul className="space-y-1 text-sm text-muted-foreground list-disc pl-4">
                {result.plan.testPlan.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Rollback plan</p>
              <ul className="space-y-1 text-sm text-muted-foreground list-disc pl-4">
                {result.plan.rollbackPlan.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          </div>

          {diffEstimate && diffEstimate.budget.level !== 'ok' && (
            <div
              className={`text-sm rounded-md border p-3 ${
                diffEstimate.budget.level === 'blocked'
                  ? 'border-destructive/60 text-destructive'
                  : 'border-warning/60 text-warning'
              }`}
            >
              {diffEstimate.budget.level === 'blocked'
                ? `${diffEstimate.budget.message} Diff generation will use the free mock provider instead of live AI.`
                : diffEstimate.budget.message}
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
            <Button onClick={generateDiff} disabled={diffLoading || result.plan.affectedFiles.length === 0}>
              {diffLoading ? 'Generating diff…' : 'Generate Proposed Diff'}
            </Button>
            <Button variant="outline" onClick={rejectPlan} disabled={diffLoading}>
              Reject Plan
            </Button>
            <span className="text-xs text-muted-foreground self-center">
              {diffEstimate
                ? `Estimated cost: ~$${diffEstimate.estimatedUSD.toFixed(3)} for ${diffEstimate.files} file${diffEstimate.files === 1 ? '' : 's'} · $${diffEstimate.budget.monthUSD.toFixed(2)} of $${diffEstimate.budget.budgetUSD} used this month`
                : 'AI is only called when you click — repeated identical prompts are served from cache.'}
            </span>
            {run && (
              <span className="text-xs text-muted-foreground self-center">
                Logged as run {run.runId} — see Agent Runs
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
