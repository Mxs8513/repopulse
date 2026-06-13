// Derivations for the Agent Runs detail view. Pure and deterministic so they
// can be unit-tested and so they degrade gracefully on older localStorage runs
// that predate per-file verification or the audit-event trail.

import type { AgentEvent, AgentEventType, AgentRun } from './types'

export interface RunSummary {
  proposed: number
  approved: number
  rejected: number
  pending: number
  verPassed: number
  verNeedsReview: number
  verFailed: number
  /** Overall verification status across files, or null if none were verified. */
  verificationStatus: 'passed' | 'needs_review' | 'failed' | null
}

/**
 * Count proposed files and their approval + verification states. `approval` on
 * each patch is the source of truth (approveAllPatches and addApproval both
 * write it); we fall back to nothing when a run has no diff.
 */
export function summarizeRun(run: Pick<AgentRun, 'diff'>): RunSummary {
  const patches = run.diff?.patches ?? []
  let approved = 0
  let rejected = 0
  let pending = 0
  let verPassed = 0
  let verNeedsReview = 0
  let verFailed = 0

  for (const p of patches) {
    if (p.approval === 'approved') approved++
    else if (p.approval === 'rejected') rejected++
    else pending++

    const s = p.verification?.status
    if (s === 'passed') verPassed++
    else if (s === 'needs_review') verNeedsReview++
    else if (s === 'failed') verFailed++
  }

  const anyVerified = verPassed + verNeedsReview + verFailed > 0
  const verificationStatus = !anyVerified
    ? null
    : verFailed > 0
      ? 'failed'
      : verNeedsReview > 0
        ? 'needs_review'
        : 'passed'

  return { proposed: patches.length, approved, rejected, pending, verPassed, verNeedsReview, verFailed, verificationStatus }
}

/** One-line, recruiter-readable summary for the runs list metadata row. */
export function summaryLine(run: Pick<AgentRun, 'diff'>): string | null {
  const s = summarizeRun(run)
  if (s.proposed === 0) return null
  const parts = [`${s.proposed} proposed file${s.proposed === 1 ? '' : 's'}`]
  if (s.approved) parts.push(`${s.approved} approved`)
  if (s.rejected) parts.push(`${s.rejected} rejected`)
  if (s.verificationStatus) {
    parts.push(`${s.verPassed} passed / ${s.verNeedsReview} needs review / ${s.verFailed} failed`)
  }
  return parts.join(' · ')
}

export const EVENT_LABELS: Record<AgentEventType, string> = {
  plan_generated: 'Plan generated',
  diff_generated: 'Diff generated',
  verification_completed: 'Verification completed',
  file_approved: 'File approved',
  file_rejected: 'File rejected',
  approval_blocked: 'Approval blocked',
  proposal_approved: 'Final approval recorded',
  run_failed: 'Run failed',
  sandbox_verification_started: 'Sandbox verification started',
  sandbox_patch_applied: 'Sandbox patch applied',
  sandbox_patch_failed: 'Sandbox patch failed',
  sandbox_package_manager_bootstrapped: 'Sandbox package manager bootstrapped',
  sandbox_command_started: 'Sandbox command started',
  sandbox_command_passed: 'Sandbox command passed',
  sandbox_command_failed: 'Sandbox command failed',
  sandbox_command_skipped: 'Sandbox command skipped',
  sandbox_verification_completed: 'Sandbox verification completed',
}

function byTime(a: AgentEvent, b: AgentEvent): number {
  return new Date(a.at).getTime() - new Date(b.at).getTime()
}

/**
 * The audit timeline for a run. Prefers the recorded `events`; for older runs
 * with no event trail, synthesizes a best-effort timeline from the plan, diff,
 * approval records, and final status so the workflow is still legible.
 */
export function buildTimeline(run: AgentRun): { events: AgentEvent[]; synthesized: boolean } {
  if (run.events && run.events.length > 0) {
    return { events: [...run.events].sort(byTime), synthesized: false }
  }

  const events: AgentEvent[] = []
  if (run.plan) {
    events.push({ type: 'plan_generated', message: `Plan generated for ${run.repo}`, at: run.createdAt })
  }
  if (run.diff) {
    events.push({
      type: 'diff_generated',
      message: `Diff generated with ${run.diff.patches.length} proposed file change${run.diff.patches.length === 1 ? '' : 's'}`,
      at: run.updatedAt,
    })
  }
  for (const a of run.approvals ?? []) {
    events.push({
      type: a.decision === 'approved' ? 'file_approved' : 'file_rejected',
      message: `${a.decision === 'approved' ? 'Approved' : 'Rejected'} ${a.filePath}`,
      at: a.createdAt,
    })
  }
  if (run.status === 'failed' || run.status === 'verification_failed') {
    events.push({ type: 'run_failed', message: run.errors?.[0] || 'Run failed', at: run.updatedAt })
  }
  return { events: events.sort(byTime), synthesized: true }
}
