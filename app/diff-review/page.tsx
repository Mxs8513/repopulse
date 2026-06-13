'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ProviderBadge, RiskBadge, StatusBadge, VerificationBadge } from '@/components/agent/badges'
import { useAgentRuns } from '@/hooks/use-agent-runs'
import {
  addApproval,
  approveAllPatches,
  approveAllRequiresConfirmation,
  canApproveAll,
} from '@/lib/agent/run-store'
import type { AgentRun, FilePatchProposal } from '@/lib/agent/types'
import { AlertTriangle, Check, GitPullRequestDraft, ShieldCheck, X } from 'lucide-react'

function DiffReviewContent() {
  const searchParams = useSearchParams()
  const runs = useAgentRuns()
  const requestedId = searchParams.get('run')
  const runsWithDiff = runs.filter((r) => r.diff && r.diff.patches.length > 0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const run: AgentRun | undefined =
    runs.find((r) => r.runId === (selectedId ?? requestedId)) ?? runsWithDiff[0]

  const decide = (patch: FilePatchProposal, decision: 'approved' | 'rejected') => {
    if (!run) return
    // Guard one-click approval of questionable patches.
    if (decision === 'approved' && patch.verification && patch.verification.status !== 'passed') {
      const label = patch.verification.status === 'failed' ? 'FAILED verification' : 'needs review'
      const ok = window.confirm(
        `${patch.path} ${label}.\n\n${patch.verification.issues.map((i) => `• ${i.detail}`).join('\n')}\n\nApprove this file anyway?`
      )
      if (!ok) return
    }
    addApproval(run.runId, { filePath: patch.path, decision, createdAt: new Date().toISOString() })
  }

  const handleApproveAll = () => {
    if (!run) return
    if (!canApproveAll(run)) {
      window.alert('Approve All is blocked: one or more files failed verification. Reject or resolve them first.')
      approveAllPatches(run.runId) // records the blocked attempt in the audit log
      return
    }
    let confirmed = false
    if (approveAllRequiresConfirmation(run)) {
      confirmed = window.confirm(
        'Some files are marked “Needs Review”. Approving will accept them as-is.\n\nConfirm approval of all non-rejected files?'
      )
      if (!confirmed) return
    }
    approveAllPatches(run.runId, { confirmedNeedsReview: confirmed })
  }

  return (
    <div className="relative min-h-screen p-4 lg:p-6 space-y-6 z-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Diff Review</h1>
          <p className="text-muted-foreground mt-1">
            AI-generated patch proposals — nothing is applied, pushed, or merged without your approval
          </p>
        </div>
        <GitPullRequestDraft className="w-8 h-8 text-muted-foreground" />
      </div>

      {runsWithDiff.length === 0 && (
        <Card className="p-6 bg-card border-border">
          <p className="text-muted-foreground">
            No diff proposals yet. Create a plan in the{' '}
            <Link href="/planner" className="text-primary hover:underline">
              Change Planner
            </Link>{' '}
            and click “Generate Proposed Diff”.
          </p>
        </Card>
      )}

      {runsWithDiff.length > 1 && (
        <Card className="p-4 bg-card border-border">
          <p className="text-sm font-medium text-foreground mb-2">Runs with proposed diffs</p>
          <div className="flex flex-wrap gap-2">
            {runsWithDiff.map((r) => (
              <button
                key={r.runId}
                onClick={() => setSelectedId(r.runId)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  run?.runId === r.runId
                    ? 'border-primary text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {r.task.slice(0, 40)}
                {r.task.length > 40 ? '…' : ''}
              </button>
            ))}
          </div>
        </Card>
      )}

      {run?.diff && (
        <>
          <Card className="p-6 bg-card border-border space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground flex-1 min-w-48">{run.task}</h3>
              <StatusBadge status={run.status} />
              <ProviderBadge provider={run.diff.provider} />
            </div>
            <p className="text-sm text-muted-foreground">
              Repository {run.repo} · {run.diff.patches.length} proposed patch
              {run.diff.patches.length === 1 ? '' : 'es'} ·{' '}
              {run.approvals.length} decision{run.approvals.length === 1 ? '' : 's'} recorded
            </p>
            <p className="text-xs text-warning">
              All patches below are AI-generated proposals (Stage A: conceptual diff). Review each file, then record
              your decision. Approved patches still need to be applied manually or via a future PR step.
            </p>
          </Card>

          {/* Verification summary + Approve All (gated by verification) */}
          {(() => {
            const patches = run.diff.patches
            const failed = patches.filter((p) => p.verification?.status === 'failed').length
            const needsReview = patches.filter((p) => p.verification?.status === 'needs_review').length
            const passed = patches.filter((p) => p.verification?.status === 'passed').length
            const blocked = !canApproveAll(run)
            return (
              <Card className="p-6 bg-card border-border space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground flex-1 min-w-40">Verification &amp; approval</h3>
                  <Badge variant="outline" className="text-warning border-warning uppercase">
                    Human approval required
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="text-success">{passed} passed</span>
                  <span className="text-warning">{needsReview} need review</span>
                  <span className="text-destructive">{failed} failed</span>
                </div>
                {blocked && (
                  <p className="text-xs text-destructive flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    Approve All is blocked because at least one file failed verification. Reject or resolve failed files
                    first; you can still approve passing files individually.
                  </p>
                )}
                <div className="flex flex-wrap gap-3 pt-1">
                  <Button
                    size="sm"
                    onClick={handleApproveAll}
                    disabled={blocked}
                    className="bg-success/90 hover:bg-success text-background disabled:opacity-40"
                  >
                    <Check className="w-4 h-4 mr-1" /> Approve all eligible
                  </Button>
                  <span className="text-xs text-muted-foreground self-center">
                    Nothing is applied automatically — approval only records your decision in the audit log.
                  </span>
                </div>
              </Card>
            )
          })()}

          {run.diff.patches.map((patch) => (
            <Card key={patch.path} className="p-6 bg-card border-border space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-foreground flex-1 min-w-40 truncate">{patch.path}</span>
                {patch.verification && (
                  <VerificationBadge status={patch.verification.status} score={patch.verification.score} />
                )}
                <RiskBadge risk={patch.risk} />
                <Badge
                  variant="outline"
                  className={
                    patch.approval === 'approved'
                      ? 'text-success border-success uppercase'
                      : patch.approval === 'rejected'
                        ? 'text-destructive border-destructive uppercase'
                        : 'text-muted-foreground border-border uppercase'
                  }
                >
                  {patch.approval}
                </Badge>
              </div>

              {/* Why the patch is questionable — explicit, never hidden */}
              {patch.verification && patch.verification.issues.length > 0 && (
                <div
                  className={`rounded-md border p-3 ${
                    patch.verification.status === 'failed'
                      ? 'border-destructive/50 bg-destructive/5'
                      : 'border-warning/50 bg-warning/5'
                  }`}
                >
                  <p className="text-xs font-medium text-foreground mb-1.5">
                    {patch.verification.status === 'failed'
                      ? 'This patch failed verification:'
                      : 'This patch needs review:'}
                  </p>
                  <ul className="space-y-1">
                    {patch.verification.issues.map((issue) => (
                      <li key={issue.id} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className={issue.severity === 'fail' ? 'text-destructive' : 'text-warning'}>
                          {issue.severity === 'fail' ? '✕' : '!'}
                        </span>
                        {issue.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-sm text-foreground">{patch.changeSummary}</p>
              <p className="text-sm text-muted-foreground">{patch.reasoning}</p>

              <pre className="text-xs bg-muted/50 rounded p-4 overflow-auto max-h-96 text-muted-foreground whitespace-pre-wrap">
                {patch.proposedChange}
              </pre>

              <div className="flex gap-3 pt-1">
                <Button
                  size="sm"
                  onClick={() => decide(patch, 'approved')}
                  disabled={patch.approval === 'approved'}
                  className={
                    patch.verification && patch.verification.status !== 'passed'
                      ? 'bg-warning/90 hover:bg-warning text-background'
                      : 'bg-success/90 hover:bg-success text-background'
                  }
                >
                  <Check className="w-4 h-4 mr-1" />
                  {patch.verification && patch.verification.status !== 'passed' ? 'Approve anyway' : 'Approve file'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => decide(patch, 'rejected')}
                  disabled={patch.approval === 'rejected'}
                  className="border-destructive text-destructive hover:bg-destructive/10"
                >
                  <X className="w-4 h-4 mr-1" /> Reject file
                </Button>
              </div>
            </Card>
          ))}

          {run.diff.skippedFiles.length > 0 && (
            <Card className="p-6 bg-card border-border">
              <h3 className="text-sm font-medium text-foreground mb-2">Skipped files</h3>
              <ul className="space-y-1">
                {run.diff.skippedFiles.map((s) => (
                  <li key={s.path} className="text-sm text-muted-foreground">
                    <span className="font-mono">{s.path}</span> — {s.reason}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-6 bg-card border-border flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-48">
              <p className="text-sm font-medium text-foreground">Next step: verification</p>
              <p className="text-xs text-muted-foreground">
                Recommended commands: {run.diff.testsToRun.join(' · ') || 'see Verification page'}
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/verification">Generate verification plan →</Link>
            </Button>
          </Card>
        </>
      )}
    </div>
  )
}

export default function DiffReviewPage() {
  return (
    <Suspense fallback={null}>
      <DiffReviewContent />
    </Suspense>
  )
}
