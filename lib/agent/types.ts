// Core domain types for the RepoPulse Agent workflow:
// Repository → Index → Ask → Plan → Propose Diff → Verify → Human Approval → Optional PR
//
// These interfaces are structured so a real database (Prisma/Drizzle) can be
// added later without reshaping the domain model. For now agent runs persist
// to localStorage on the client (see lib/agent/run-store.ts).

export type FileCategory =
  | 'frontend_page'
  | 'frontend_component'
  | 'backend_api'
  | 'service_or_lib'
  | 'test'
  | 'config'
  | 'documentation'
  | 'ci_cd'
  | 'database_model'
  | 'unknown'

export interface IndexedFile {
  path: string
  type: 'blob' | 'tree'
  size: number
  category: FileCategory
  language: string | null
}

export interface ArchitectureSummary {
  text: string
  detectedFrameworks: string[]
  entrypoints: string[]
  apiRoutes: string[]
  testFiles: string[]
  configFiles: string[]
  keyFiles: string[]
}

export interface CodebaseMap {
  repo: string
  defaultBranch: string
  truncated: boolean
  /** True when only important directories were indexed (large-repo fallback or truncated tree). */
  partial: boolean
  indexedAt: string
  files: IndexedFile[]
  /** Blobs skipped during indexing (binary files, node_modules). */
  filesSkipped: number
  categoryCounts: Record<FileCategory, number>
  architecture: ArchitectureSummary
}

// ---------- Ask Repo ----------

export type QuestionIntent =
  | 'file_location_question'
  | 'architecture_question'
  | 'feature_implementation_question'
  | 'change_impact_question'
  | 'test_coverage_question'
  | 'dependency_question'
  | 'configuration_question'
  | 'unknown_repo_question'

export type Confidence = 'high' | 'medium' | 'low'

export interface RetrievedFile {
  path: string
  category: FileCategory
  score: number
  reason: string
  snippet?: string
}

export interface AskAnswer {
  question: string
  intent: QuestionIntent
  answer: string
  confidence: Confidence
  sources: RetrievedFile[]
  provider: AIProviderName
  grounded: boolean
}

// ---------- Safety ----------

export type SafetyClassification =
  | 'safe_code_change'
  | 'risky_destructive_change'
  | 'secrets_request'
  | 'repo_deletion_request'
  | 'bypass_review_request'
  | 'unknown'

export interface SafetyResult {
  classification: SafetyClassification
  safe: boolean
  reason: string
  suggestion?: string
}

// ---------- Change Planner ----------

export type RiskLevel = 'low' | 'medium' | 'high'
export type ChangeScope = 'frontend' | 'backend' | 'full-stack' | 'config' | 'docs'
export type TaskConstraint = 'test_only' | 'source_only' | 'docs_only' | 'no_breaking_changes'

export interface ChangePlan {
  taskSummary: string
  steps: string[]
  affectedFiles: RetrievedFile[]
  assumptions: string[]
  risks: string[]
  riskLevel: RiskLevel
  scope: ChangeScope
  testPlan: string[]
  rollbackPlan: string[]
  confidence: Confidence
  provider: AIProviderName
  /** User-specified or inferred constraints on the change. */
  constraints: TaskConstraint[]
  /** Files that should NOT be modified (paths or glob patterns). */
  disallowedFiles?: string[]
}

// ---------- Diff Proposal (Stage A: conceptual / structured patch) ----------

export interface FilePatchProposal {
  path: string
  changeSummary: string
  reasoning: string
  risk: RiskLevel
  /** Pseudo-diff or unified diff text. Labeled AI-generated in the UI. */
  proposedChange: string
  /** True when the source file content was retrieved and the patch is grounded in it. */
  groundedInContent: boolean
  /** Set when content could not be fetched (too large, binary, missing). */
  contentUnavailableReason?: string
  approval: 'pending' | 'approved' | 'rejected'
  /** Automated quality verification of the proposed change (see diff-verification). */
  verification?: DiffVerification
  // --- Structured patch (enables real full-file application in the sandbox) ---
  /** Full original file content at generation time (basis for hash + safe replacement). */
  originalContent?: string
  /** SHA-256 of originalContent, checked before replacing to detect drift. */
  originalContentHash?: string
  /** Full proposed file content. When present, the sandbox replaces the file with this. */
  proposedContent?: string
}

// ---------- Diff verification (quality gate before human approval) ----------

export type VerificationStatus = 'passed' | 'needs_review' | 'failed'

export interface VerificationCheck {
  id: string
  label: string
  /** 'fail' forces status to failed; 'warn' forces at least needs_review. */
  severity: 'fail' | 'warn'
  detail: string
}

export interface DiffVerification {
  status: VerificationStatus
  /** 0–100 confidence score derived from the checks. */
  score: number
  /** Only the checks that failed or warned, with human-readable reasons. */
  issues: VerificationCheck[]
  /** Labels of the checks that passed, for transparency. */
  passedChecks: string[]
}

export interface DiffProposal {
  patches: FilePatchProposal[]
  skippedFiles: Array<{ path: string; reason: string }>
  testsToRun: string[]
  provider: AIProviderName
}

// ---------- Verification ----------

export interface VerificationCommand {
  command: string
  purpose: string
  exists: boolean
  source: string
}

export interface VerificationPlan {
  repoType: string
  commands: VerificationCommand[]
  manualInstructions: string[]
  notes: string[]
}

// ---------- Agent Runs / Audit Log ----------

export type AgentRunStatus =
  | 'planned'
  | 'awaiting_diff'
  | 'diff_generated'
  | 'verification_pending'
  | 'verification_failed'
  | 'verification_passed'
  | 'approved'
  | 'rejected'
  | 'pr_created'
  | 'failed'

export type AIProviderName = 'openai' | 'groq' | 'anthropic' | 'mock'

export interface ApprovalRecord {
  filePath: string
  decision: 'approved' | 'rejected'
  comment?: string
  createdAt: string
}

export type AgentEventType =
  | 'plan_generated'
  | 'diff_generated'
  | 'verification_completed'
  | 'file_approved'
  | 'file_rejected'
  | 'approval_blocked'
  | 'proposal_approved'
  | 'run_failed'
  | 'sandbox_verification_started'
  | 'sandbox_patch_applied'
  | 'sandbox_patch_failed'
  | 'sandbox_command_started'
  | 'sandbox_command_passed'
  | 'sandbox_command_failed'
  | 'sandbox_command_skipped'
  | 'sandbox_package_manager_bootstrapped'
  | 'sandbox_verification_completed'

// ---------- Sandbox verification (Phase 8: trial-run approved patches) ----------

export type SandboxStatus = 'not_run' | 'running' | 'passed' | 'failed' | 'disabled' | 'unavailable'

export interface SandboxCommandResult {
  command: string
  status: 'passed' | 'failed' | 'skipped'
  exitCode: number | null
  durationMs: number
  stdoutPreview: string
  stderrPreview: string
  timedOut?: boolean
}

import type { PackageManagerInfo } from './package-manager'

export interface PackageManagerBootstrapResult {
  ok: boolean
  bootstrapped: boolean
  method?: 'native' | 'corepack' | 'npm-exec-fallback'
  command?: string
  executionCommand?: string
  packageSpec?: string
  stdout?: string
  stderr?: string
  reason?: string
}

/**
 * Structured outcome distinguishing repository problems from patch problems.
 * Never blames the patch when the baseline already fails.
 */
export type SandboxConclusion =
  | 'sandbox_passed' // baseline passed and patched verification passed
  | 'patch_failed' // baseline passed but patched verification failed
  | 'baseline_failed' // baseline failed before patches → patch not independently verified
  | 'patch_application_failed' // approved patch(es) could not be safely applied
  | 'setup_failed' // clone/package-manager/bootstrap/install failed before verification
  | 'inconclusive' // sandbox could not isolate the cause

export interface SandboxResult {
  status: SandboxStatus
  /** Structured classification (see SandboxConclusion). */
  conclusion?: SandboxConclusion
  /** Human-readable one-line conclusion for the UI. */
  conclusionMessage?: string
  /** Identifier of the isolated temporary workspace (never the real repo). */
  workspaceId: string
  /** Approved patches queued for application. */
  approvedQueued?: number
  /** Approved patches actually applied to the sandbox clone. */
  approvedApplied: number
  /** Approved patches that could not be safely applied. */
  failedToApply?: number
  /** Rejected/pending patches excluded from application. */
  excludedPatches?: number
  applyFailures: Array<{ path: string; reason: string }>
  /** Verification commands run on the clean clone (before patches). */
  baselineCommands?: SandboxCommandResult[]
  /** Verification commands re-run after approved patches were applied. */
  patchedCommands?: SandboxCommandResult[]
  /** Back-compat: mirrors baselineCommands (the full command set that ran). */
  commands: SandboxCommandResult[]
  durationMs: number
  failureReason?: string
  /** Local repository checkout or clone source path used for sandbox preparation. */
  sourceRepoPath?: string
  /** Source type used for repository preparation. */
  sourceType?: 'local_checkout' | 'cloned_from_github' | 'unsupported' | 'unavailable'
  /** True when the mapped local checkout was verified against the expected repository. */
  repoIdentityVerified?: boolean
  /** Detected package manager for sandbox verification. */
  packageManager?: PackageManagerInfo
  /** Bootstrapping details for the sandbox package manager. */
  packageManagerBootstrap?: PackageManagerBootstrapResult
  startedAt: string
  completedAt?: string
}

export interface AgentEvent {
  type: AgentEventType
  message: string
  at: string
}

export interface AgentRun {
  runId: string
  repo: string
  task: string
  status: AgentRunStatus
  intent: SafetyClassification
  retrievedFiles: RetrievedFile[]
  plan: ChangePlan | null
  diff: DiffProposal | null
  verification: VerificationPlan | null
  /** Phase 8 trial-run of approved patches in a temporary sandbox. */
  sandbox?: SandboxResult | null
  approvals: ApprovalRecord[]
  provider: AIProviderName
  errors: string[]
  /** Audit trail of workflow actions (diff generated, verification, approvals). */
  events?: AgentEvent[]
  createdAt: string
  updatedAt: string
}
