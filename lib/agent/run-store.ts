// Client-side persistence for Agent Runs (the audit log). Backed by
// localStorage for now; the API surface (list/get/create/update) is shaped so
// a database-backed implementation can replace it without touching callers.

import type { AgentEvent, AgentEventType, AgentRun, AgentRunStatus, ApprovalRecord } from './types'

const STORAGE_KEY = 'repopulse-agent-runs'
const MAX_RUNS = 100

type Listener = () => void
const listeners = new Set<Listener>()

// Cached snapshot so useSyncExternalStore gets a stable reference between
// store mutations (returning a fresh array each call would loop forever).
let snapshot: AgentRun[] | null = null

function emit() {
  snapshot = null
  for (const l of listeners) l()
}

export function subscribeToRuns(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function listRuns(): AgentRun[] {
  if (typeof window === 'undefined') return []
  if (snapshot) return snapshot
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    snapshot = raw ? (JSON.parse(raw) as AgentRun[]) : []
  } catch {
    snapshot = []
  }
  return snapshot
}

function persist(runs: AgentRun[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(0, MAX_RUNS)))
  emit()
}

export function getRun(runId: string): AgentRun | undefined {
  return listRuns().find((r) => r.runId === runId)
}

export function createRun(input: Pick<AgentRun, 'repo' | 'task' | 'intent' | 'provider'>): AgentRun {
  const now = new Date().toISOString()
  const run: AgentRun = {
    runId: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    repo: input.repo,
    task: input.task,
    status: 'planned',
    intent: input.intent,
    retrievedFiles: [],
    plan: null,
    diff: null,
    verification: null,
    approvals: [],
    provider: input.provider,
    errors: [],
    createdAt: now,
    updatedAt: now,
  }
  persist([run, ...listRuns()])
  return run
}

export function updateRun(runId: string, updates: Partial<AgentRun>): AgentRun | undefined {
  const runs = listRuns().map((r) =>
    r.runId === runId ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r
  )
  persist(runs)
  return runs.find((r) => r.runId === runId)
}

export function setRunStatus(runId: string, status: AgentRunStatus): AgentRun | undefined {
  return updateRun(runId, { status })
}

/** Append an audit event to a run (read-modify-write; safe to chain). */
export function appendEvent(runId: string, type: AgentEventType, message: string): AgentRun | undefined {
  const run = getRun(runId)
  if (!run) return undefined
  const event: AgentEvent = { type, message, at: new Date().toISOString() }
  return updateRun(runId, { events: [...(run.events ?? []), event] })
}

export function addApproval(runId: string, approval: ApprovalRecord): AgentRun | undefined {
  const run = getRun(runId)
  if (!run) return undefined

  const approvals = [...run.approvals.filter((a) => a.filePath !== approval.filePath), approval]
  const diff = run.diff
    ? {
        ...run.diff,
        patches: run.diff.patches.map((p) =>
          p.path === approval.filePath ? { ...p, approval: approval.decision } : p
        ),
      }
    : null

  let status = run.status
  if (diff && diff.patches.length > 0) {
    const decided = diff.patches.every((p) => p.approval !== 'pending')
    if (decided) {
      status = diff.patches.some((p) => p.approval === 'approved') ? 'approved' : 'rejected'
    }
  }

  const event: AgentEvent = {
    type: approval.decision === 'approved' ? 'file_approved' : 'file_rejected',
    message: `${approval.decision === 'approved' ? 'Approved' : 'Rejected'} ${approval.filePath}`,
    at: new Date().toISOString(),
  }

  return updateRun(runId, { approvals, diff, status, events: [...(run.events ?? []), event] })
}

/**
 * Whether every patch with a verification result has NOT failed. Approve-All
 * is forbidden if any file failed verification (the safety rule).
 */
export function canApproveAll(run: Pick<AgentRun, 'diff'>): boolean {
  const patches = run.diff?.patches ?? []
  if (patches.length === 0) return false
  return patches.every((p) => p.verification?.status !== 'failed')
}

/** Whether any pending patch needs review — Approve-All must confirm first. */
export function approveAllRequiresConfirmation(run: Pick<AgentRun, 'diff'>): boolean {
  const patches = run.diff?.patches ?? []
  return patches.some((p) => p.approval === 'pending' && p.verification?.status === 'needs_review')
}

/**
 * Approve every pending, non-failed patch in one action. Failed-verification
 * files are never auto-approved; if any exists the whole action is blocked and
 * logged. Already-rejected files are left rejected (excluded from the result).
 * Nothing is applied — this only records approval decisions in the audit log.
 */
export function approveAllPatches(
  runId: string,
  opts: { confirmedNeedsReview?: boolean } = {}
): { ok: boolean; reason?: string; run?: AgentRun } {
  const run = getRun(runId)
  if (!run || !run.diff) return { ok: false, reason: 'No diff to approve.' }

  if (!canApproveAll(run)) {
    appendEvent(runId, 'approval_blocked', 'Approve All blocked: one or more files failed verification.')
    return { ok: false, reason: 'One or more files failed verification — resolve or reject them first.' }
  }
  if (approveAllRequiresConfirmation(run) && !opts.confirmedNeedsReview) {
    return { ok: false, reason: 'Some files need review — explicit confirmation required before approving.' }
  }

  const now = new Date().toISOString()
  const approvedPaths: string[] = []
  const patches = run.diff.patches.map((p) => {
    if (p.approval === 'rejected') return p
    approvedPaths.push(p.path)
    return { ...p, approval: 'approved' as const }
  })
  const approvals: ApprovalRecord[] = [
    ...run.approvals.filter((a) => !approvedPaths.includes(a.filePath)),
    ...approvedPaths.map((filePath) => ({ filePath, decision: 'approved' as const, createdAt: now })),
  ]
  const events: AgentEvent[] = [
    ...(run.events ?? []),
    { type: 'proposal_approved', message: `Approved ${approvedPaths.length} file(s); nothing applied automatically.`, at: now },
  ]
  const updated = updateRun(runId, { diff: { ...run.diff, patches }, approvals, status: 'approved', events })
  return { ok: true, run: updated }
}

export function deleteRun(runId: string) {
  persist(listRuns().filter((r) => r.runId !== runId))
}

/**
 * Status for a run after a diff-generation attempt fails. A successful plan
 * is preserved work: the run returns to 'planned' (retryable) rather than
 * being marked 'failed' just because a later fetch/UI step broke. Only runs
 * with no plan at all are truly failed.
 */
export function statusAfterDiffFailure(run: Pick<AgentRun, 'plan'>): AgentRunStatus {
  return run.plan ? 'planned' : 'failed'
}
