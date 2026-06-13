'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ProviderBadge, RiskBadge, SandboxBadge, StatusBadge, VerificationBadge } from '@/components/agent/badges'
import { buildFinalReport } from '@/lib/agent/final-report'
import { buildTimeline, EVENT_LABELS, summarizeRun } from '@/lib/agent/run-summary'
import { updateRun } from '@/lib/agent/run-store'
import type { AgentEvent, AgentEventType, AgentRun, SandboxCommandResult, SandboxResult } from '@/lib/agent/types'
import { ChevronDown, ChevronRight, ShieldCheck, Lock, FlaskConical, FileText } from 'lucide-react'

const EVENT_TONE: Record<AgentEventType, string> = {
  plan_generated: 'text-primary border-primary',
  diff_generated: 'text-primary border-primary',
  verification_completed: 'text-foreground border-border',
  file_approved: 'text-success border-success',
  file_rejected: 'text-destructive border-destructive',
  approval_blocked: 'text-destructive border-destructive',
  proposal_approved: 'text-success border-success',
  run_failed: 'text-destructive border-destructive',
  sandbox_verification_started: 'text-primary border-primary',
  sandbox_patch_applied: 'text-success border-success',
  sandbox_patch_failed: 'text-destructive border-destructive',
  sandbox_package_manager_bootstrapped: 'text-primary border-primary',
  sandbox_command_started: 'text-foreground border-border',
  sandbox_command_passed: 'text-success border-success',
  sandbox_command_failed: 'text-destructive border-destructive',
  sandbox_command_skipped: 'text-muted-foreground border-border',
  sandbox_verification_completed: 'text-foreground border-border',
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase">{label}</p>
      <p className={`text-lg font-semibold ${tone ?? 'text-foreground'}`}>{value}</p>
    </div>
  )
}

/** One step of the sandbox pipeline with a state dot. */
function PipelineStep({
  label,
  state,
  detail,
}: {
  label: string
  state: 'ok' | 'fail' | 'skip' | 'pending'
  detail?: string
}) {
  const dot =
    state === 'ok'
      ? 'bg-success'
      : state === 'fail'
        ? 'bg-destructive'
        : state === 'skip'
          ? 'bg-muted-foreground'
          : 'bg-border'
  return (
    <li className="flex items-start gap-2.5">
      <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
      <div className="min-w-0">
        <span className="text-sm text-foreground">{label}</span>
        {detail && <span className="text-xs text-muted-foreground"> — {detail}</span>}
      </div>
    </li>
  )
}

function SandboxCommandList({ commands }: { commands?: SandboxCommandResult[] }) {
  if (!commands || commands.length === 0) {
    return <p className="text-sm text-muted-foreground">No commands run in this phase.</p>
  }
  return (
    <div className="space-y-3">
      {commands.map((command, i) => (
        <div key={`${command.command}-${i}`} className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                command.status === 'passed'
                  ? 'text-success border-success'
                  : command.status === 'skipped'
                    ? 'text-muted-foreground border-border'
                    : 'text-destructive border-destructive'
              }
            >
              {command.status}
            </Badge>
            <code className="text-xs font-mono text-foreground">{command.command}</code>
          </div>
          <p className="text-xs text-muted-foreground">
            Exit code: {command.exitCode ?? 'n/a'}
            {command.timedOut ? ` · timed out after ${command.durationMs}ms` : ''}
          </p>
          {command.stderrPreview && (
            <pre className="text-xs bg-muted/50 rounded p-2 overflow-auto max-h-28 text-muted-foreground whitespace-pre-wrap">
              {command.stderrPreview}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
}

const SANDBOX_CONCLUSION_TONE: Record<string, string> = {
  sandbox_passed: 'border-success/50 bg-success/5 text-success',
  patch_failed: 'border-destructive/50 bg-destructive/5 text-destructive',
  baseline_failed: 'border-warning/50 bg-warning/5 text-warning',
  patch_application_failed: 'border-destructive/50 bg-destructive/5 text-destructive',
  setup_failed: 'border-warning/50 bg-warning/5 text-warning',
  inconclusive: 'border-border bg-muted/20 text-muted-foreground',
}

export function RunDetail({ run }: { run: AgentRun }) {
  const summary = summarizeRun(run)
  const { events, synthesized } = buildTimeline(run)
  const patches = run.diff?.patches ?? []
  const [openFile, setOpenFile] = useState<string | null>(null)

  // Sandbox verification (Phase 8)
  const [sandboxEnabled, setSandboxEnabled] = useState<boolean | null>(null)
  const [sandboxRunning, setSandboxRunning] = useState(false)
  const [sandboxError, setSandboxError] = useState<string | null>(null)
  const approvedPatches = patches.filter((p) => p.approval === 'approved')
  const sandbox = run.sandbox
  const finalReportPreview = buildFinalReport({ run })

  useEffect(() => {
    let cancelled = false
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => !cancelled && setSandboxEnabled(Boolean(d.sandboxEnabled)))
      .catch(() => !cancelled && setSandboxEnabled(false))
    return () => {
      cancelled = true
    }
  }, [])

  const runSandbox = async () => {
    if (sandboxRunning) return
    setSandboxRunning(true)
    setSandboxError(null)
    try {
      const commands = (run.verification?.commands ?? [])
        .filter((c) => c.exists)
        .map((c) => c.command)
      const res = await fetch('/api/sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: run.runId, repo: run.repo, patches: approvedPatches, commands }),
      })
      const data: { result?: SandboxResult; events?: AgentEvent[]; error?: string } = await res.json()
      if (!res.ok || !data.result) throw new Error(data.error || 'Sandbox verification failed')
      updateRun(run.runId, {
        sandbox: data.result,
        events: [...(run.events ?? []), ...(data.events ?? [])],
      })
    } catch (e) {
      setSandboxError(e instanceof Error ? e.message : 'Sandbox verification failed')
    } finally {
      setSandboxRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/agent-runs" className="text-sm text-primary hover:underline">
        ← Back to all runs
      </Link>

      {/* 1. Run summary */}
      <Card className="p-6 bg-card border-border space-y-4">
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex-1 min-w-48">
            <h2 className="text-xl font-semibold text-foreground">{run.task}</h2>
            <p className="text-xs text-muted-foreground mt-1 font-mono">{run.runId}</p>
          </div>
          <StatusBadge status={run.status} />
          <ProviderBadge provider={run.provider} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <Stat label="Repository" value={run.repo} />
          <Stat label="Created" value={new Date(run.createdAt).toLocaleString()} />
          <Stat label="Proposed files" value={summary.proposed} />
          <Stat label="Approved" value={summary.approved} tone="text-success" />
          <Stat label="Rejected" value={summary.rejected} tone="text-destructive" />
          <Stat label="Needs review" value={summary.verNeedsReview} tone="text-warning" />
          <Stat label="Failed verification" value={summary.verFailed} tone="text-destructive" />
          <Stat label="Pending" value={summary.pending} />
        </div>
      </Card>

      {/* 2. Workflow explanation for reviewers */}
      <Card className="p-4 bg-primary/5 border-primary/20">
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">Human-in-the-loop workflow:</span> RepoPulse plans the change,
          generates a proposed diff, verifies patch quality, requires file-level approval, and records every decision.
          Approved patches are <span className="text-foreground font-medium">not applied automatically</span>.
        </p>
      </Card>

      {/* 3. Workflow timeline */}
      <Card className="p-6 bg-card border-border">
        <h3 className="text-sm font-semibold text-foreground mb-4">Workflow timeline</h3>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No detailed audit events recorded for this run yet.</p>
        ) : (
          <ol className="space-y-0">
            {events.map((e, i) => (
              <li key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`w-2.5 h-2.5 rounded-full border ${EVENT_TONE[e.type] ?? 'border-border'}`} />
                  {i < events.length - 1 && <span className="w-px flex-1 bg-border my-1" />}
                </div>
                <div className="pb-5 -mt-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{EVENT_LABELS[e.type] ?? e.type}</span>
                    <span className="text-xs text-muted-foreground">{new Date(e.at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{e.message}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
        {synthesized && events.length > 0 && (
          <p className="text-xs text-muted-foreground/70 mt-2 border-t border-border pt-3">
            Timeline reconstructed from this run&apos;s stored data — it predates full audit-event logging.
          </p>
        )}
      </Card>

      {/* 4. Verification summary */}
      <Card className="p-6 bg-card border-border space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground flex-1">Verification summary</h3>
          {summary.verificationStatus && <VerificationBadge status={summary.verificationStatus} />}
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-success">{summary.verPassed} passed</span>
          <span className="text-warning">{summary.verNeedsReview} need review</span>
          <span className="text-destructive">{summary.verFailed} failed</span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase mb-1">Recommended commands</p>
          <div className="flex flex-wrap gap-2">
            {(run.diff?.testsToRun?.length ? run.diff.testsToRun : ['npm install', 'npm run build', 'npm run test', 'npm run lint']).map(
              (c) => (
                <code key={c} className="text-xs bg-muted/50 rounded px-2 py-1 text-muted-foreground font-mono">
                  {c}
                </code>
              )
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground/80">
          Commands are recommended only. RepoPulse does not execute arbitrary code automatically.
        </p>
      </Card>

      {/* 5. Sandbox verification */}
      <Card className="p-6 bg-card border-border space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <FlaskConical className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground flex-1">Sandbox verification</h3>
          <SandboxBadge status={sandbox?.status ?? 'not_run'} />
        </div>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Sandbox verification trials approved patches in an isolated workspace. Nothing is committed, pushed, or merged.
          </p>
          {sandboxEnabled === null ? (
            <p>Checking sandbox availability…</p>
          ) : !sandboxEnabled ? (
            <p>
              Sandbox execution is disabled in this environment. Enable it with{' '}
              <code className="font-mono">SANDBOX_EXECUTION_ENABLED=true</code> to run sandbox verification.
            </p>
          ) : !approvedPatches.length ? (
            <p>No approved file patches yet. Approve patches in Diff Review to enable sandbox verification.</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={runSandbox}
            disabled={sandboxRunning || !sandboxEnabled || approvedPatches.length === 0}
            size="sm"
          >
            {sandboxRunning ? 'Running sandbox…' : 'Run Sandbox Verification'}
          </Button>
          <span className="text-xs text-muted-foreground">
            Only approved patches are trialed; rejected and pending patches are excluded.
          </span>
        </div>
        {sandboxError && <p className="text-sm text-destructive">Error: {sandboxError}</p>}
        {sandbox && (
          <div className="space-y-4">
            {/* Final conclusion banner */}
            <div className={`rounded-md border p-3 ${SANDBOX_CONCLUSION_TONE[sandbox.conclusion ?? 'inconclusive'] ?? 'border-border'}`}>
              <p className="text-sm font-medium">
                {sandbox.conclusionMessage ?? sandbox.failureReason ?? 'Sandbox verification complete.'}
              </p>
            </div>

            {/* Pipeline */}
            <div className="rounded-md border border-border p-4">
              <p className="text-sm font-semibold text-foreground mb-3">Pipeline</p>
              <ol className="space-y-2">
                <PipelineStep
                  label="Repository prepared"
                  state={sandbox.sourceType === 'unavailable' || sandbox.sourceType === 'unsupported' ? 'fail' : 'ok'}
                  detail={
                    sandbox.sourceType === 'cloned_from_github'
                      ? 'cloned from GitHub into isolated workspace'
                      : sandbox.sourceType === 'local_checkout'
                        ? 'local checkout copied into workspace'
                        : undefined
                  }
                />
                <PipelineStep
                  label="Package manager detected"
                  state={sandbox.packageManager?.manager ? 'ok' : 'pending'}
                  detail={sandbox.packageManager?.manager}
                />
                <PipelineStep
                  label="Package manager bootstrapped"
                  state={
                    !sandbox.packageManagerBootstrap
                      ? 'pending'
                      : !sandbox.packageManagerBootstrap.ok
                        ? 'fail'
                        : sandbox.packageManagerBootstrap.bootstrapped
                          ? 'ok'
                          : 'skip'
                  }
                  detail={sandbox.packageManagerBootstrap?.bootstrapped ? sandbox.packageManagerBootstrap.method : 'already available'}
                />
                <PipelineStep
                  label="Baseline verification (clean clone)"
                  state={
                    sandbox.conclusion === 'setup_failed' || sandbox.conclusion === 'baseline_failed'
                      ? 'fail'
                      : (sandbox.baselineCommands?.length ?? 0) > 0
                        ? 'ok'
                        : 'pending'
                  }
                  detail={
                    sandbox.conclusion === 'baseline_failed'
                      ? 'repository failed before changes'
                      : `${sandbox.baselineCommands?.filter((c) => c.status === 'passed').length ?? 0}/${sandbox.baselineCommands?.length ?? 0} passed`
                  }
                />
                <PipelineStep
                  label="Patch application"
                  state={
                    sandbox.conclusion === 'baseline_failed' || sandbox.conclusion === 'setup_failed'
                      ? 'skip'
                      : sandbox.conclusion === 'patch_application_failed'
                        ? 'fail'
                        : (sandbox.approvedApplied ?? 0) > 0
                          ? 'ok'
                          : 'pending'
                  }
                  detail={`${sandbox.approvedApplied ?? 0} applied / ${sandbox.failedToApply ?? 0} failed`}
                />
                <PipelineStep
                  label="Patched verification"
                  state={
                    sandbox.conclusion === 'patch_failed'
                      ? 'fail'
                      : sandbox.conclusion === 'sandbox_passed'
                        ? 'ok'
                        : 'skip'
                  }
                  detail={
                    (sandbox.patchedCommands?.length ?? 0) > 0
                      ? `${sandbox.patchedCommands?.filter((c) => c.status === 'passed').length ?? 0}/${sandbox.patchedCommands?.length ?? 0} passed`
                      : 'not run'
                  }
                />
              </ol>
            </div>

            {/* Counts */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Approved queued" value={sandbox.approvedQueued ?? approvedPatches.length} />
              <Stat label="Applied" value={sandbox.approvedApplied ?? 0} tone="text-success" />
              <Stat label="Failed to apply" value={sandbox.failedToApply ?? sandbox.applyFailures.length} tone="text-destructive" />
              <Stat label="Excluded (rejected/pending)" value={sandbox.excludedPatches ?? 0} />
            </div>

            {sandbox.applyFailures.length > 0 && (
              <div className="rounded-md border border-destructive/40 p-3">
                <p className="text-sm text-destructive mb-1">Patches that could not be applied safely:</p>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {sandbox.applyFailures.map((f) => (
                    <li key={f.path}>
                      <span className="font-mono">{f.path}</span>: {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Baseline vs patched command results */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-md border border-border p-4 space-y-2">
                <p className="text-sm font-semibold text-foreground">Baseline command results</p>
                <SandboxCommandList commands={sandbox.baselineCommands ?? sandbox.commands} />
              </div>
              <div className="rounded-md border border-border p-4 space-y-2">
                <p className="text-sm font-semibold text-foreground">Patched command results</p>
                <SandboxCommandList commands={sandbox.patchedCommands} />
              </div>
            </div>

            <div className="text-xs text-muted-foreground/80 space-y-1">
              {sandbox.workspaceId && (
                <p>
                  Sandbox workspace: <code className="font-mono">{sandbox.workspaceId}</code> (deleted after the run)
                </p>
              )}
              {sandbox.failureReason && <p>Reason: {sandbox.failureReason}</p>}
            </div>
          </div>
        )}
      </Card>

      {/* 6. File decisions */}
      <Card className="p-6 bg-card border-border space-y-3">
        <h3 className="text-sm font-semibold text-foreground">File decisions</h3>
        {patches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No file-level decisions recorded for this run.</p>
        ) : (
          <div className="space-y-2">
            {patches.map((p) => {
              const isOpen = openFile === p.path
              return (
                <div key={p.path} className="border border-border rounded-md">
                  <button
                    onClick={() => setOpenFile(isOpen ? null : p.path)}
                    className="w-full flex flex-wrap items-center gap-2 p-3 text-left"
                  >
                    {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                    <span className="font-mono text-sm text-foreground flex-1 min-w-40 truncate">{p.path}</span>
                    {p.verification && <VerificationBadge status={p.verification.status} score={p.verification.score} />}
                    <RiskBadge risk={p.risk} />
                    <Badge
                      variant="outline"
                      className={
                        p.approval === 'approved'
                          ? 'text-success border-success uppercase'
                          : p.approval === 'rejected'
                            ? 'text-destructive border-destructive uppercase'
                            : 'text-muted-foreground border-border uppercase'
                      }
                    >
                      {p.approval}
                    </Badge>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                      {p.verification && p.verification.issues.length > 0 && (
                        <ul className="space-y-1">
                          {p.verification.issues.map((iss) => (
                            <li key={iss.id} className="text-xs text-muted-foreground flex items-start gap-1.5">
                              <span className={iss.severity === 'fail' ? 'text-destructive' : 'text-warning'}>
                                {iss.severity === 'fail' ? '✕' : '!'}
                              </span>
                              {iss.detail}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="text-sm text-muted-foreground">{p.reasoning}</p>
                      <pre className="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-72 text-muted-foreground whitespace-pre-wrap">
                        {p.proposedChange}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {patches.length > 0 && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/diff-review?run=${run.runId}`}>Open in Diff Review →</Link>
          </Button>
        )}
      </Card>

      {/* 6 + 7. Safety panel + recruiter framing */}
      <Card className="p-6 bg-card border-border space-y-3">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Human approval &amp; safety</h3>
        </div>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-muted-foreground">
          <li>• Nothing is applied automatically</li>
          <li>• Nothing is committed automatically</li>
          <li>• Nothing is pushed automatically</li>
          <li>• Nothing is merged automatically</li>
          <li>• Approval records a decision in the audit log</li>
          <li>• Applying patches via branch / commit / PR is a future phase</li>
        </ul>
        <p className="text-sm text-muted-foreground leading-relaxed border-t border-border pt-3">
          <span className="text-foreground font-medium">Why this matters:</span> this workflow is designed for
          engineering teams that want AI assistance without losing review control. RepoPulse makes weak AI output
          visible through verification checks and keeps humans responsible for final decisions.
        </p>
      </Card>

      {/* 8. Final Engineering Report */}
      <Card className="p-6 bg-card border-border space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <FileText className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground flex-1">Final Engineering Report</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{finalReportPreview.businessSummary}</p>
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase text-muted-foreground">Conclusion</p>
            <p className="mt-1 text-foreground font-medium">{finalReportPreview.facts.conclusion}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase text-muted-foreground">Confidence</p>
            <p className="mt-1 text-foreground font-medium">{finalReportPreview.confidence.score}%</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase text-muted-foreground">Next action</p>
            <p className="mt-1 text-foreground font-medium">{finalReportPreview.recommendations[0]}</p>
          </div>
        </div>
        <Button asChild size="sm">
          <Link href={`/final-report?run=${run.runId}`}>Open Final Engineering Report</Link>
        </Button>
      </Card>
    </div>
  )
}
