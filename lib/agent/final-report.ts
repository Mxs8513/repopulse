// Phase 12 — Final Engineering Report.
//
// Turns a completed AgentRun into a polished, shareable engineering audit
// document. EVERYTHING factual here is derived DETERMINISTICALLY from stored
// run data — statuses, counts, conclusions, and the confidence score are never
// produced by AI. An optional single AI call may rephrase ONLY the executive
// summary narrative (see app/api/final-report/route.ts); it can never change a
// status, count, or conclusion. The report therefore works perfectly with zero
// AI calls.
//
// The builder emits a structured section/block model (rendered natively by the
// UI as clean cards) plus a complete Markdown string (for copy / download).

import type {
  AgentRun,
  FilePatchProposal,
  SandboxCommandResult,
  SandboxConclusion,
  SandboxResult,
  SandboxStatus,
} from './types'
import { buildTimeline, EVENT_LABELS, summarizeRun } from './run-summary'
import { inferPackagePath } from './package-manager'

// ---------- Block / section model ----------

export type FileRole = 'considered' | 'approved' | 'rejected' | 'pending' | 'applied' | 'not_applied' | 'failed'

export interface ReportFileEntry {
  path: string
  role: FileRole
  note?: string
}

export interface ReportTreeGroup {
  dir: string
  files: ReportFileEntry[]
}

export type ReportBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'keyvalue'; items: Array<{ label: string; value: string }> }
  | { kind: 'list'; items: string[]; ordered?: boolean }
  | { kind: 'files'; items: ReportFileEntry[] }
  | { kind: 'tree'; groups: ReportTreeGroup[] }
  | { kind: 'commands'; phase: string; commands: SandboxCommandResult[] }
  | { kind: 'note'; text: string }

export interface ReportSection {
  id: string
  title: string
  blocks: ReportBlock[]
}

export interface ConfidenceScore {
  score: number
  reasons: string[]
  cautions: string[]
}

export type ReportCompletenessState =
  | 'planning_only'
  | 'diff_generated'
  | 'review_completed'
  | 'sandbox_completed'
  | 'stakeholder_ready'

export interface ReportCompleteness {
  state: ReportCompletenessState
  label: string
  warning: string | null
  nextRequiredStep: string
  hasProposedFiles: boolean
  hasHumanDecisions: boolean
  sandboxHasRun: boolean
}

export interface ExecutiveSummaryFacts {
  repo: string
  request: string
  conclusion: string
  conclusionStatus: SandboxConclusion | 'not_run'
  overallConfidence: number
  approvalStatus: string
  sandboxStatus: SandboxStatus
  patchTestedInSandbox: boolean
  baselinePassed: boolean | null
  patchedPassed: boolean | null
}

export interface FinalReport {
  runId: string
  generatedAt: string
  /** True when the executive narrative was rephrased by a live AI provider. */
  aiPolished: boolean
  summaryMode: 'ai_polished' | 'deterministic'
  /** The narrative shown in the Executive Summary (AI-polished or deterministic). */
  narrative: string
  /** Plain-English summary for non-technical stakeholders. */
  businessSummary: string
  /** Short stakeholder-readable findings derived from run data. */
  keyFindings: string[]
  /** Plain-English explanation of the confidence score. */
  confidenceExplanation: string
  /** Truthful readiness classification for UI labels and export layout. */
  completeness: ReportCompleteness
  /** Facts behind the executive summary — always deterministic. */
  facts: ExecutiveSummaryFacts
  confidence: ConfidenceScore
  recommendations: string[]
  sections: ReportSection[]
  markdown: string
}

export interface BuildReportInput {
  run: AgentRun
  /** Optional AI-polished executive summary. Replaces ONLY the narrative text. */
  aiSummary?: string | null
  /** Optional wording improvements. Replaces prose only, never facts/statuses/counts. */
  aiWording?: Partial<Pick<FinalReport, 'narrative' | 'businessSummary' | 'keyFindings' | 'confidenceExplanation' | 'recommendations'>> | null
  /** Force deterministic narrative even if aiSummary is provided. */
  deterministicReportOnly?: boolean
  generatedAt?: string
}

// ---------- Plain-English helpers ----------

export const SANDBOX_CONCLUSION_PLAIN: Record<SandboxConclusion, string> = {
  sandbox_passed: 'Baseline and patched verification both passed.',
  patch_failed: 'Baseline passed, but patched verification failed. The approved patch likely introduced the failure.',
  baseline_failed: 'The repository failed before approved patches were applied. The patch was not blamed.',
  patch_application_failed: 'Approved patch could not be safely applied to sandbox files.',
  setup_failed: 'Sandbox could not prepare the repository or tooling.',
  inconclusive: 'Sandbox could not isolate patch impact.',
}

export function classifyReportCompleteness(run: AgentRun): ReportCompleteness {
  const patches = run.diff?.patches ?? []
  const hasProposedFiles = patches.length > 0
  const hasHumanDecisions =
    run.approvals.length > 0 || patches.some((patch) => patch.approval === 'approved' || patch.approval === 'rejected')
  const sandboxHasRun = Boolean(run.sandbox && run.sandbox.status !== 'not_run' && run.sandbox.conclusion)

  if (!hasProposedFiles) {
    return {
      state: 'planning_only',
      label: 'Draft planning report',
      warning: 'No proposed file changes exist for this run yet. Generate a proposed diff before creating a final engineering report.',
      nextRequiredStep: 'Generate Proposed Diff',
      hasProposedFiles,
      hasHumanDecisions,
      sandboxHasRun,
    }
  }

  if (!hasHumanDecisions) {
    return {
      state: 'diff_generated',
      label: 'Draft diff report',
      warning: 'This report is not final yet. Complete Diff Review and human approval before exporting a stakeholder-ready report.',
      nextRequiredStep: 'Complete Diff Review and human approval',
      hasProposedFiles,
      hasHumanDecisions,
      sandboxHasRun,
    }
  }

  if (sandboxHasRun) {
    const passed = run.sandbox?.conclusion === 'sandbox_passed'
    return {
      state: passed ? 'stakeholder_ready' : 'sandbox_completed',
      label: passed ? 'Stakeholder-ready report' : 'Final verification report',
      warning: null,
      nextRequiredStep: passed ? 'Move into guarded engineering review' : 'Review sandbox conclusion and follow recommended next action',
      hasProposedFiles,
      hasHumanDecisions,
      sandboxHasRun,
    }
  }

  return {
    state: 'review_completed',
    label: 'Pre-verification report',
    warning: null,
    nextRequiredStep: 'Run sandbox verification before PR creation',
    hasProposedFiles,
    hasHumanDecisions,
    sandboxHasRun,
  }
}

function approvalStatusText(run: AgentRun): string {
  const s = summarizeRun(run)
  if (s.proposed === 0) return 'No proposed file changes exist yet'
  if (s.approved > 0 && s.rejected > 0) return `${s.approved} approved, ${s.rejected} rejected (human-reviewed)`
  if (s.approved > 0) return `${s.approved} approved (human-reviewed)`
  if (s.rejected > 0) return `${s.rejected} rejected (human-reviewed)`
  return `${s.pending} pending human review`
}

/** Baseline / patched pass state: null when that phase never ran. */
function phasePassState(commands?: SandboxCommandResult[]): boolean | null {
  if (!commands || commands.length === 0) return null
  return commands.every((c) => c.status !== 'failed')
}

function patchTestedInSandbox(sandbox?: SandboxResult | null): boolean {
  return Boolean(sandbox && (sandbox.approvedApplied ?? 0) > 0 && (sandbox.patchedCommands?.length ?? 0) > 0)
}

// ---------- File classification (for the codebase map) ----------

/**
 * Assign each proposed file a role for the codebase map. Sandbox outcomes
 * refine the approval state: applied / failed-to-apply are computed from the
 * sandbox result, never assumed.
 */
export function classifyFiles(run: AgentRun): ReportFileEntry[] {
  const patches = run.diff?.patches ?? []
  const sandbox = run.sandbox
  const failedPaths = new Set((sandbox?.applyFailures ?? []).map((f) => f.path))
  const sandboxApplied = sandbox && (sandbox.approvedApplied ?? 0) > 0

  const entries: ReportFileEntry[] = patches.map((p) => {
    if (p.approval === 'rejected') {
      return { path: p.path, role: 'rejected', note: p.changeSummary }
    }
    if (p.approval === 'approved') {
      if (failedPaths.has(p.path)) return { path: p.path, role: 'failed', note: 'failed to apply in sandbox' }
      if (sandboxApplied) return { path: p.path, role: 'applied', note: 'applied in sandbox clone' }
      return { path: p.path, role: 'approved', note: p.changeSummary }
    }
    return { path: p.path, role: 'pending', note: 'pending review' }
  })

  // Retrieved-but-not-proposed files count as "considered".
  const proposedPaths = new Set(patches.map((p) => p.path))
  for (const rf of run.retrievedFiles ?? []) {
    if (!proposedPaths.has(rf.path)) {
      entries.push({ path: rf.path, role: 'considered', note: rf.reason })
    }
  }
  return entries
}

function topLevelGroup(path: string): string {
  const pkg = inferPackagePath(path, 'turbo') // any non-'none' tool triggers packages/apps detection
  if (pkg) return pkg
  const parts = path.split('/')
  return parts.length > 1 ? parts[0] : '(root)'
}

function buildTree(entries: ReportFileEntry[]): ReportTreeGroup[] {
  const byDir = new Map<string, ReportFileEntry[]>()
  for (const e of entries) {
    const dir = topLevelGroup(e.path)
    const list = byDir.get(dir) ?? []
    list.push(e)
    byDir.set(dir, list)
  }
  return [...byDir.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dir, files]) => ({ dir, files: files.sort((a, b) => a.path.localeCompare(b.path)) }))
}

// ---------- Confidence score ----------

/**
 * Overall confidence from deterministic signals only. The score moves with the
 * sandbox outcome: a passed sandbox scores materially higher than a failed
 * baseline for an otherwise-identical run.
 */
export function computeConfidence(run: AgentRun): ConfidenceScore {
  const reasons: string[] = []
  const cautions: string[] = []
  let score = 50

  const summary = summarizeRun(run)
  const patches = run.diff?.patches ?? []
  const approved = patches.filter((p) => p.approval === 'approved')
  const rejected = patches.filter((p) => p.approval === 'rejected')

  // Deterministic diff verification.
  if (summary.verFailed > 0) {
    score -= 15
    cautions.push(`${summary.verFailed} file(s) failed deterministic verification.`)
  } else if (summary.verPassed > 0) {
    score += 8
    reasons.push('Deterministic diff verification passed for all reviewed files.')
  }

  // Grounded, human-approved target.
  if (approved.length > 0 && approved.every((p) => p.groundedInContent)) {
    score += 8
    reasons.push('Approved patches were grounded in retrieved file content.')
  }

  // Unrelated files excluded by a human (proves review happened).
  if (rejected.length > 0) {
    score += 5
    reasons.push(`${rejected.length} unrelated/low-quality file(s) were rejected, not silently applied.`)
  }

  // Task constraints obeyed (e.g. test_only → only test files approved).
  const constraints = run.plan?.constraints ?? []
  if (constraints.includes('test_only') && approved.length > 0) {
    const allTests = approved.every((p) => /(\.|\/)(test|spec)[./]|\b__tests__\b/i.test(p.path) || /test/i.test(p.path))
    if (allTests) {
      score += 4
      reasons.push('test_only constraint obeyed — only test files were approved.')
    } else {
      score -= 8
      cautions.push('test_only constraint requested, but non-test files were approved.')
    }
  }

  // Sandbox outcome dominates.
  const sb = run.sandbox
  switch (sb?.conclusion) {
    case 'sandbox_passed':
      score += 22
      reasons.push('Sandbox baseline and patched verification both passed.')
      break
    case 'patch_failed':
      score -= 12
      cautions.push('Patched verification failed in the sandbox — the patch likely introduced a failure.')
      break
    case 'baseline_failed':
      score -= 18
      cautions.push('Repository baseline failed before the patch — patch impact was not independently verified.')
      break
    case 'patch_application_failed':
      score -= 15
      cautions.push('Approved patch could not be applied to the sandbox clone — not tested.')
      break
    case 'setup_failed':
      score -= 12
      cautions.push('Sandbox setup failed before verification could run.')
      break
    case 'inconclusive':
      cautions.push('Sandbox ran but could not isolate patch impact.')
      break
    default:
      cautions.push('Sandbox verification has not been run — patch impact is unverified.')
  }

  score = Math.max(5, Math.min(99, Math.round(score)))
  return { score, reasons, cautions }
}

// ---------- Deterministic narrative ----------

export function buildDeterministicNarrative(run: AgentRun): string {
  const s = summarizeRun(run)
  const sb = run.sandbox
  const completeness = classifyReportCompleteness(run)
  if (completeness.state === 'planning_only') {
    return (
      `RepoPulse analyzed ${run.repo} for the request “${run.task}” and created planning context. ` +
      'No proposed file changes exist for this run yet, so human file review, sandbox verification, and final safety conclusions have not started.'
    )
  }
  if (completeness.state === 'diff_generated') {
    return (
      `RepoPulse analyzed ${run.repo} for the request “${run.task}” and generated proposed file changes. ` +
      'Human approval has not been completed yet, so the report is still a draft and no approved patch is eligible for sandbox verification.'
    )
  }
  const conclusion = sb?.conclusion ? SANDBOX_CONCLUSION_PLAIN[sb.conclusion] : 'Sandbox verification has not been run.'
  const fileClause =
    s.proposed === 0
      ? 'did not produce a proposed change'
      : `generated ${s.proposed} proposed file change${s.proposed === 1 ? '' : 's'} (${s.approved} approved, ${s.rejected} rejected after human review)`

  const sandboxClause =
    sb && sb.conclusion === 'sandbox_passed'
      ? 'applied the approved changes inside an isolated sandbox clone and confirmed both baseline and patched verification passed'
      : sb && sb.conclusion === 'baseline_failed'
        ? 'attempted sandbox verification, but the repository baseline failed before the patch could be independently judged'
        : sb && sb.conclusion === 'patch_failed'
          ? 'applied the approved changes inside an isolated sandbox clone, where patched verification then failed'
          : sb
            ? `ran sandbox verification with the conclusion: ${conclusion.toLowerCase()}`
            : 'has not yet run sandbox verification on the approved changes'

  return (
    `RepoPulse analyzed ${run.repo} for the request “${run.task}”, ` +
    `${fileClause}, verified patch quality, and required human approval before any change was applied. ` +
    `It ${sandboxClause}. ` +
    `Nothing was committed, pushed, or merged, and the original repository was never modified.`
  )
}

export function buildBusinessSummary(run: AgentRun): string {
  const s = summarizeRun(run)
  const sb = run.sandbox
  const completeness = classifyReportCompleteness(run)
  if (completeness.state === 'planning_only') {
    return (
      `The user requested: “${run.task}”. RepoPulse analyzed ${run.repo} and prepared a plan, but no proposed file changes exist for this run yet. ` +
      'Generate a proposed diff before creating a final engineering report.'
    )
  }
  if (completeness.state === 'diff_generated') {
    return (
      `The user requested: “${run.task}”. RepoPulse analyzed ${run.repo} and generated proposed file changes, but human approval has not been completed. ` +
      'Complete Diff Review before exporting a stakeholder-ready report.'
    )
  }
  const reviewText =
    s.proposed === 0
      ? 'No file changes were proposed for review.'
      : `${s.approved} file${s.approved === 1 ? ' was' : 's were'} approved, ${s.rejected} file${s.rejected === 1 ? ' was' : 's were'} rejected, and ${s.pending} file${s.pending === 1 ? ' is' : 's are'} still pending review.`
  const sandboxText =
    !sb || sb.status === 'not_run'
      ? 'Sandbox validation has not yet been completed.'
      : sb.conclusion === 'sandbox_passed'
        ? 'Sandbox validation completed successfully in a temporary copy of the repository.'
        : sb.conclusion === 'baseline_failed'
          ? 'Sandbox validation found that the repository already had issues before the approved change was tested.'
          : sb.conclusion === 'patch_failed'
            ? 'Sandbox validation found a failure after the approved change was applied.'
            : sb.conclusion === 'patch_application_failed'
              ? 'Sandbox validation could not safely apply the approved change.'
              : sb.conclusion === 'setup_failed'
                ? 'Sandbox validation could not prepare the repository for testing.'
                : 'Sandbox validation could not produce a clear pass-or-fail result.'

  return (
    `The user requested: “${run.task}”. RepoPulse analyzed ${run.repo}, reviewed the files most likely to be involved, ` +
    `prepared proposed modifications, and required human approval before any change could be tested. ${reviewText} ${sandboxText}`
  )
}

export function buildConfidenceExplanation(confidence: ConfidenceScore, run: AgentRun): string {
  const score = confidence.score
  const level = score >= 80 ? 'high' : score >= 60 ? 'moderate' : 'limited'
  const sb = run.sandbox
  const base =
    `A confidence score of ${score}% means RepoPulse has ${level} confidence in this report based on repository analysis, file review decisions, and available verification data.`

  if (!sb || sb.status === 'not_run') {
    return `${base} Confidence is lower because sandbox verification has not yet been completed, so the approved change has not been tested in an isolated copy of the repository.`
  }
  if (sb.conclusion === 'sandbox_passed') {
    return `${base} Confidence is higher because the repository passed verification before and after the approved change was tested in the sandbox.`
  }
  if (sb.conclusion === 'baseline_failed') {
    return `${base} Confidence is reduced because the repository failed before the approved change was tested, so RepoPulse cannot fairly judge whether the change is safe yet.`
  }
  if (sb.conclusion === 'patch_failed') {
    return `${base} Confidence is reduced because verification passed before the change but failed after the approved change was applied.`
  }
  if (sb.conclusion === 'patch_application_failed') {
    return `${base} Confidence is reduced because the approved change could not be safely applied inside the sandbox.`
  }
  if (sb.conclusion === 'setup_failed') {
    return `${base} Confidence is reduced because the sandbox could not prepare the repository and verification could not run.`
  }
  return `${base} Confidence is limited because the sandbox result was inconclusive.`
}

function buildKeyFindings(run: AgentRun, facts: ExecutiveSummaryFacts, confidence: ConfidenceScore): string[] {
  const s = summarizeRun(run)
  const completeness = classifyReportCompleteness(run)
  if (completeness.state === 'planning_only') {
    return [
      `Request reviewed: ${run.task}`,
      'Planning status: initial planning data exists.',
      'No proposed file changes exist for this run yet.',
      `Next required step: ${completeness.nextRequiredStep}.`,
    ]
  }
  if (completeness.state === 'diff_generated') {
    return [
      `Request reviewed: ${run.task}`,
      `Proposed files generated: ${s.proposed}.`,
      'Human review has not been completed yet.',
      `Next required step: ${completeness.nextRequiredStep}.`,
    ]
  }
  const findings = [
    `Request reviewed: ${run.task}`,
    `Human review outcome: ${facts.approvalStatus}.`,
    `Sandbox outcome: ${facts.conclusion}`,
    `Confidence: ${confidence.score}% - ${buildConfidenceExplanation(confidence, run)}`,
    `Recommended next action: ${buildRecommendations(run)[0] ?? 'Review the report and choose the next engineering step.'}`,
  ]
  if (s.rejected > 0) findings.splice(2, 0, `${s.rejected} proposed file change${s.rejected === 1 ? ' was' : 's were'} rejected and excluded from testing.`)
  return findings
}

// ---------- Section builders ----------

function executiveSection(run: AgentRun, facts: ExecutiveSummaryFacts, narrative: string, confidence: number): ReportSection {
  return {
    id: 'executive-summary',
    title: 'Executive Summary',
    blocks: [
      { kind: 'paragraph', text: narrative },
      {
        kind: 'keyvalue',
        items: [
          { label: 'Repository', value: facts.repo },
          { label: 'Request', value: facts.request },
          { label: 'Final conclusion', value: facts.conclusion },
          { label: 'Overall confidence', value: `${confidence}%` },
          { label: 'Approval status', value: facts.approvalStatus },
          { label: 'Sandbox status', value: facts.sandboxStatus },
          { label: 'Patch tested in sandbox', value: facts.patchTestedInSandbox ? 'yes' : 'no' },
          {
            label: 'Baseline passed before patch',
            value: facts.baselinePassed === null ? 'not run' : facts.baselinePassed ? 'yes' : 'no',
          },
          {
            label: 'Patched verification passed',
            value: facts.patchedPassed === null ? 'not run' : facts.patchedPassed ? 'yes' : 'no',
          },
        ],
      },
    ],
  }
}

function repositoryOverviewSection(run: AgentRun): ReportSection {
  const sb = run.sandbox
  const pm = sb?.packageManager
  const scripts = pm?.availableScripts ?? {}
  const bootstrap = sb?.packageManagerBootstrap
  const bootstrapMethod = bootstrap
    ? !bootstrap.bootstrapped
      ? 'already available'
      : bootstrap.method === 'corepack'
        ? 'corepack'
        : bootstrap.method === 'npm-exec-fallback'
          ? 'npm-exec fallback'
          : bootstrap.method === 'native'
            ? 'native'
            : 'bootstrapped'
    : 'not run'

  const sourceType =
    sb?.sourceType === 'cloned_from_github'
      ? 'GitHub clone'
      : sb?.sourceType === 'local_checkout'
        ? 'local checkout'
        : sb?.sourceType ?? 'not determined'

  const items: Array<{ label: string; value: string }> = [
    { label: 'Repository', value: run.repo },
    { label: 'Source type', value: sourceType },
    { label: 'Package manager', value: pm?.manager ?? 'not detected' },
    { label: 'Detection method', value: pm?.detectionMethod ?? 'n/a' },
    { label: 'Package manager version', value: pm?.packageManagerVersion ?? pm?.packageManagerField ?? 'unspecified' },
    { label: 'Bootstrap method', value: bootstrapMethod },
    { label: 'Workspace tool', value: pm?.workspaceTool ?? 'not detected' },
    { label: 'Sandbox support', value: sb ? sb.status : 'not run' },
  ]

  const scriptList = ['build', 'test', 'lint', 'typecheck', 'type-check']
    .filter((name) => name in scripts)
    .map((name) => `${name}: ${scripts[name]}`)

  const blocks: ReportBlock[] = [{ kind: 'keyvalue', items }]
  blocks.push({
    kind: 'list',
    items: scriptList.length > 0 ? scriptList : ['No build/test/lint/type-check scripts detected from sandbox data.'],
  })
  return { id: 'repository-overview', title: 'Repository Overview', blocks }
}

function codebaseMapSection(run: AgentRun): ReportSection {
  const entries = classifyFiles(run)
  const blocks: ReportBlock[] = []
  if (entries.length === 0) {
    blocks.push({ kind: 'note', text: 'No files were considered or proposed for this run.' })
  } else {
    blocks.push({ kind: 'tree', groups: buildTree(entries) })
  }
  return { id: 'codebase-map', title: 'Codebase Map / Architecture Snapshot', blocks }
}

function requestUnderstandingSection(run: AgentRun): ReportSection {
  const plan = run.plan
  const constraints = plan?.constraints ?? []
  const target = run.retrievedFiles?.[0]
  const items: Array<{ label: string; value: string }> = [
    { label: 'Task summary', value: plan?.taskSummary ?? run.task },
    { label: 'Scope', value: plan?.scope ?? 'unspecified' },
    { label: 'Risk level', value: plan?.riskLevel ?? 'unspecified' },
    { label: 'Safety classification', value: run.intent },
    { label: 'Target file (top candidate)', value: target?.path ?? 'not identified' },
    { label: 'Constraints', value: constraints.length ? constraints.join(', ') : 'none specified' },
  ]
  const disallowed = plan?.disallowedFiles ?? []
  const blocks: ReportBlock[] = [{ kind: 'keyvalue', items }]
  if (plan?.assumptions?.length) {
    blocks.push({ kind: 'list', items: plan.assumptions.map((a) => `Assumption: ${a}`) })
  }
  if (disallowed.length) {
    blocks.push({ kind: 'list', items: disallowed.map((d) => `Disallowed: ${d}`) })
  }
  return { id: 'request-understanding', title: 'Request Understanding', blocks }
}

function planningSection(run: AgentRun): ReportSection {
  const plan = run.plan
  const blocks: ReportBlock[] = []
  if (!plan) {
    blocks.push({ kind: 'note', text: 'No plan was recorded for this run.' })
    return { id: 'planning-summary', title: 'Planning Summary', blocks }
  }
  if (plan.steps?.length) blocks.push({ kind: 'list', ordered: true, items: plan.steps })
  if (plan.affectedFiles?.length) {
    blocks.push({
      kind: 'list',
      items: plan.affectedFiles.map((f) => `${f.path} — ${f.reason} (${f.category})`),
    })
  }
  if (plan.risks?.length) blocks.push({ kind: 'list', items: plan.risks.map((r) => `Risk: ${r}`) })
  if (plan.rollbackPlan?.length) blocks.push({ kind: 'list', items: plan.rollbackPlan.map((r) => `Rollback: ${r}`) })
  if (plan.testPlan?.length) blocks.push({ kind: 'list', items: plan.testPlan.map((t) => `Test: ${t}`) })
  return { id: 'planning-summary', title: 'Planning Summary', blocks }
}

function diffReviewSection(run: AgentRun): ReportSection {
  const patches = run.diff?.patches ?? []
  const sandbox = run.sandbox
  const failedPaths = new Set((sandbox?.applyFailures ?? []).map((f) => f.path))
  const sandboxApplied = sandbox && (sandbox.approvedApplied ?? 0) > 0
  const blocks: ReportBlock[] = []
  if (patches.length === 0) {
    blocks.push({ kind: 'note', text: 'No proposed file changes were generated for this run.' })
    return { id: 'diff-review', title: 'Diff Review Summary', blocks }
  }
  for (const p of patches) {
    const appliedInSandbox =
      p.approval === 'approved' && !failedPaths.has(p.path) && Boolean(sandboxApplied)
    const items: Array<{ label: string; value: string }> = [
      { label: 'File', value: p.path },
      { label: 'Change', value: p.changeSummary },
      { label: 'Decision', value: p.approval },
      { label: 'Verification', value: p.verification?.status ?? 'not verified' },
      { label: 'Risk', value: p.risk },
      { label: 'Reason', value: p.reasoning },
      { label: 'Eligible for sandbox', value: p.approval === 'approved' ? 'yes' : 'no' },
      {
        label: 'Applied in sandbox',
        value: failedPaths.has(p.path) ? 'failed to apply' : appliedInSandbox ? 'yes' : 'no',
      },
    ]
    blocks.push({ kind: 'keyvalue', items })
  }
  return { id: 'diff-review', title: 'Diff Review Summary', blocks }
}

function sandboxSection(run: AgentRun): ReportSection {
  const sb = run.sandbox
  const blocks: ReportBlock[] = []
  if (!sb || sb.status === 'not_run') {
    blocks.push({ kind: 'note', text: 'Sandbox verification has not been run for this run.' })
    return { id: 'sandbox-summary', title: 'Sandbox Verification Summary', blocks }
  }
  const conclusion = sb.conclusion ?? 'inconclusive'
  blocks.push({
    kind: 'keyvalue',
    items: [
      { label: 'Sandbox status', value: sb.status },
      { label: 'Conclusion', value: conclusion },
      { label: 'Plain-English', value: SANDBOX_CONCLUSION_PLAIN[conclusion] },
      {
        label: 'Source',
        value:
          sb.sourceType === 'cloned_from_github'
            ? 'cloned from GitHub into isolated workspace'
            : sb.sourceType === 'local_checkout'
              ? 'local checkout copied into workspace'
              : sb.sourceType ?? 'n/a',
      },
      { label: 'Repo identity verified', value: sb.repoIdentityVerified ? 'yes' : 'no' },
      { label: 'Package manager', value: sb.packageManager?.manager ?? 'n/a' },
      { label: 'Workspace ID', value: sb.workspaceId ?? 'n/a' },
      { label: 'Source repository path', value: sb.sourceRepoPath ?? 'n/a' },
      { label: 'Approved patches queued', value: String(sb.approvedQueued ?? 0) },
      { label: 'Applied patches', value: String(sb.approvedApplied ?? 0) },
      { label: 'Failed to apply', value: String(sb.failedToApply ?? sb.applyFailures.length) },
      { label: 'Excluded (rejected/pending)', value: String(sb.excludedPatches ?? 0) },
    ],
  })
  blocks.push({
    kind: 'list',
    items: [
      'Repository cloned / checked out into an isolated workspace',
      sb.repoIdentityVerified ? 'Repository identity verified' : 'Repository identity not verified',
      `Package manager detected: ${sb.packageManager?.manager ?? 'n/a'}`,
      sb.packageManagerBootstrap?.bootstrapped ? 'Package manager bootstrapped inside sandbox' : 'Package manager already available',
      `Baseline verification ${phasePassState(sb.baselineCommands ?? sb.commands) === null ? 'did not run' : phasePassState(sb.baselineCommands ?? sb.commands) ? 'passed' : 'failed'}`,
      `Approved patches applied to temp clone: ${sb.approvedApplied ?? 0}`,
      `Patched verification ${phasePassState(sb.patchedCommands) === null ? 'did not run' : phasePassState(sb.patchedCommands) ? 'passed' : 'failed'}`,
      'Baseline vs patched comparison completed',
    ],
  })
  if (sb.applyFailures.length > 0) {
    blocks.push({ kind: 'list', items: sb.applyFailures.map((f) => `Could not apply ${f.path}: ${f.reason}`) })
  }
  return { id: 'sandbox-summary', title: 'Sandbox Verification Summary', blocks }
}

function commandResultsSection(run: AgentRun): ReportSection {
  const sb = run.sandbox
  const baseline = sb?.baselineCommands ?? sb?.commands ?? []
  const patched = sb?.patchedCommands ?? []
  const blocks: ReportBlock[] = [
    { kind: 'commands', phase: 'Baseline', commands: baseline },
    { kind: 'commands', phase: 'Patched', commands: patched },
  ]
  return { id: 'command-results', title: 'Command Results', blocks }
}

function safetySection(run: AgentRun): ReportSection {
  const sb = run.sandbox
  return {
    id: 'safety-governance',
    title: 'Safety & Governance',
    blocks: [
      {
        kind: 'list',
        items: [
          'Nothing was applied automatically — every change required explicit human approval',
          'Only approved patches were eligible for the sandbox',
          'Rejected and pending patches were excluded from sandbox application',
          'No commit was created',
          'No push occurred',
          'No merge occurred',
          'The original repository was never modified',
          sb ? 'Sandbox changes were restricted to a temporary clone' : 'Sandbox was not run; no files were modified anywhere',
          'Path-traversal protections were enabled during patch application',
          'Absolute paths were blocked during patch application',
          'SHA-256 content hash checks were used when available to detect drift before replacement',
          'Package manager was bootstrapped inside sandbox-local cache paths when possible',
        ],
      },
    ],
  }
}

function auditTrailSection(run: AgentRun): ReportSection {
  const { events, synthesized } = buildTimeline(run)
  const blocks: ReportBlock[] = []
  if (events.length === 0) {
    blocks.push({ kind: 'note', text: 'No audit events were recorded for this run.' })
    return { id: 'audit-trail', title: 'Engineering Audit Trail', blocks }
  }
  blocks.push({
    kind: 'list',
    items: events.map((e) => `${new Date(e.at).toLocaleString()} — ${EVENT_LABELS[e.type] ?? e.type}: ${e.message}`),
  })
  if (synthesized) {
    blocks.push({ kind: 'note', text: 'Timeline reconstructed from stored run data (predates full audit-event logging).' })
  }
  return { id: 'audit-trail', title: 'Engineering Audit Trail', blocks }
}

function buildRecommendations(run: AgentRun): string[] {
  const completeness = classifyReportCompleteness(run)
  if (completeness.state === 'planning_only') {
    return [
      'Next required step: Generate Proposed Diff.',
      'Do not export this as a stakeholder-ready final report until proposed files and human review exist.',
    ]
  }
  if (completeness.state === 'diff_generated') {
    return [
      'Next required step: Complete Diff Review and human approval.',
      'Do not run sandbox verification until the proposed files have approval decisions.',
    ]
  }
  const sb = run.sandbox
  const recs: string[] = []
  switch (sb?.conclusion) {
    case 'sandbox_passed':
      recs.push('Recommended next step: move this change into guarded PR creation.')
      recs.push('Patch appears safe to move into engineering review.')
      break
    case 'baseline_failed':
      recs.push('Recommended next step: fix repository baseline setup or existing failures before evaluating patch impact.')
      recs.push('Inspect the failing baseline commands listed under Command Results.')
      break
    case 'patch_failed':
      recs.push('Recommended next step: revise the approved patch and rerun sandbox verification.')
      recs.push('Inspect the failing patched command output to locate the regression.')
      break
    case 'patch_application_failed':
      recs.push('Recommended next step: regenerate a full-file patch or choose a smaller target file.')
      break
    case 'setup_failed':
      recs.push('Check repository requirements such as Node version, package manager, secrets, Docker, or services.')
      break
    case 'inconclusive':
      recs.push('Re-run the sandbox with a clearer baseline, or narrow the verification commands.')
      break
    default:
      recs.push('Recommended next step: run sandbox verification before PR creation.')
  }
  return recs
}

function recommendationsSection(recommendations: string[]): ReportSection {
  return { id: 'recommendations', title: 'Recommended Next Actions', blocks: [{ kind: 'list', items: recommendations }] }
}

function confidenceSection(confidence: ConfidenceScore, explanation: string): ReportSection {
  const blocks: ReportBlock[] = [
    { kind: 'keyvalue', items: [{ label: 'Confidence', value: `${confidence.score}%` }] },
    { kind: 'paragraph', text: explanation },
  ]
  if (confidence.reasons.length) {
    blocks.push({ kind: 'list', items: confidence.reasons })
  }
  if (confidence.cautions.length) {
    blocks.push({ kind: 'list', items: confidence.cautions.map((c) => `Caution: ${c}`) })
  }
  return { id: 'confidence', title: 'Confidence Score', blocks }
}

// ---------- Markdown rendering ----------

const ROLE_LABEL: Record<FileRole, string> = {
  considered: 'considered',
  approved: 'approved',
  rejected: 'rejected',
  pending: 'pending',
  applied: 'applied',
  not_applied: 'not applied',
  failed: 'failed verification',
}

function blockToMarkdown(block: ReportBlock): string {
  switch (block.kind) {
    case 'paragraph':
      return block.text
    case 'note':
      return `> ${block.text}`
    case 'keyvalue':
      return block.items.map((i) => `- **${i.label}:** ${i.value}`).join('\n')
    case 'list':
      return block.items.map((i, idx) => (block.ordered ? `${idx + 1}. ${i}` : `- ${i}`)).join('\n')
    case 'files':
      return block.items.map((f) => `- \`${f.path}\` — _${ROLE_LABEL[f.role]}_${f.note ? ` (${f.note})` : ''}`).join('\n')
    case 'tree':
      return block.groups
        .map((g) => {
          const head = `- **${g.dir}/**`
          const files = g.files.map((f) => `  - \`${f.path}\` — _${ROLE_LABEL[f.role]}_`).join('\n')
          return `${head}\n${files}`
        })
        .join('\n')
    case 'commands': {
      if (block.commands.length === 0) return `**${block.phase} commands:** none run in this phase.`
      const lines = block.commands.map((c) => {
        const head = `- \`${c.command}\` — **${c.status}** (exit ${c.exitCode ?? 'n/a'}${c.durationMs ? `, ${c.durationMs}ms` : ''}${c.timedOut ? ', timed out' : ''})`
        const out = c.stderrPreview || c.stdoutPreview
        const detail = out ? `\n  \`\`\`\n${out.split('\n').slice(0, 12).join('\n')}\n  \`\`\`` : ''
        return head + detail
      })
      return `**${block.phase} commands:**\n${lines.join('\n')}`
    }
  }
}

function sectionToMarkdown(section: ReportSection, index: number): string {
  const body = section.blocks.map(blockToMarkdown).filter(Boolean).join('\n\n')
  return `## ${index}. ${section.title}\n\n${body}`
}

export function renderReportMarkdown(report: FinalReport): string {
  const header = [
    `# Engineering Report — ${report.facts.repo}`,
    '',
    `**Run:** ${report.runId}`,
    `**Generated:** ${new Date(report.generatedAt).toLocaleString()}`,
    `**Report:** Final Engineering Report`,
    `**Overall confidence:** ${report.confidence.score}%`,
    '',
    '## Business Summary',
    '',
    report.businessSummary,
    '',
    '## Key Findings',
    '',
    ...report.keyFindings.map((finding) => `- ${finding}`),
    '',
    '---',
  ].join('\n')
  const body = report.sections.map((s, i) => sectionToMarkdown(s, i + 1)).join('\n\n')
  const footer = [
    '---',
    '',
    '_Generated by RepoPulse. All statuses, counts, and conclusions are derived deterministically from stored run data._',
  ].join('\n')
  return `${header}\n\n${body}\n\n${footer}\n`
}

// ---------- Top-level builder ----------

export function buildFinalReport(input: BuildReportInput): FinalReport {
  const { run } = input
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const sb = run.sandbox
  const completeness = classifyReportCompleteness(run)

  const baselinePassed = phasePassState(sb?.baselineCommands ?? sb?.commands)
  const patchedPassed = phasePassState(sb?.patchedCommands)
  const confidence = computeConfidence(run)

  const facts: ExecutiveSummaryFacts = {
    repo: run.repo,
    request: run.task,
    conclusion: sb?.conclusion ? SANDBOX_CONCLUSION_PLAIN[sb.conclusion] : 'Sandbox verification has not been run.',
    conclusionStatus: sb?.conclusion ?? 'not_run',
    overallConfidence: confidence.score,
    approvalStatus: approvalStatusText(run),
    sandboxStatus: sb?.status ?? 'not_run',
    patchTestedInSandbox: patchTestedInSandbox(sb),
    baselinePassed,
    patchedPassed,
  }

  const deterministic = buildDeterministicNarrative(run)
  const deterministicRecommendations = buildRecommendations(run)
  const deterministicBusinessSummary = buildBusinessSummary(run)
  const deterministicConfidenceExplanation = buildConfidenceExplanation(confidence, run)
  const deterministicKeyFindings = buildKeyFindings(run, facts, confidence)
  const wording = input.deterministicReportOnly ? null : input.aiWording
  const useAi =
    !input.deterministicReportOnly &&
    (typeof input.aiSummary === 'string' && input.aiSummary.trim().length > 0 ||
      Boolean(wording && Object.keys(wording).length > 0))
  const narrative =
    wording?.narrative?.trim() ||
    (!input.deterministicReportOnly && typeof input.aiSummary === 'string' ? input.aiSummary.trim() : '') ||
    deterministic
  const recommendations = wording?.recommendations?.length ? wording.recommendations.map(String) : deterministicRecommendations
  const businessSummary = wording?.businessSummary?.trim() || deterministicBusinessSummary
  const confidenceExplanation = wording?.confidenceExplanation?.trim() || deterministicConfidenceExplanation
  const keyFindings = wording?.keyFindings?.length ? wording.keyFindings.map(String) : deterministicKeyFindings

  const sections: ReportSection[] = [
    executiveSection(run, facts, narrative, confidence.score),
    repositoryOverviewSection(run),
    codebaseMapSection(run),
    requestUnderstandingSection(run),
    planningSection(run),
    diffReviewSection(run),
    sandboxSection(run),
    commandResultsSection(run),
    safetySection(run),
    auditTrailSection(run),
    recommendationsSection(recommendations),
    confidenceSection(confidence, confidenceExplanation),
  ]

  const report: FinalReport = {
    runId: run.runId,
    generatedAt,
    aiPolished: useAi,
    summaryMode: useAi ? 'ai_polished' : 'deterministic',
    narrative,
    businessSummary,
    keyFindings,
    confidenceExplanation,
    completeness,
    facts,
    confidence,
    recommendations,
    sections,
    markdown: '',
  }
  report.markdown = renderReportMarkdown(report)
  return report
}
