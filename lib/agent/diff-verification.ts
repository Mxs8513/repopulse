// Quality gate for AI-proposed diffs. RepoPulse Agent is not an autonomous
// code applier — it proposes changes, then this module evaluates each proposal
// so weak or placeholder output is made obvious instead of being treated as
// production-ready. Pure, deterministic, and unit-tested; runs server-side in
// the diff route and again is safe to re-run anywhere.

import type {
  DiffVerification,
  FilePatchProposal,
  VerificationCheck,
  VerificationStatus,
} from './types'

export interface VerifyContext {
  /** The change request the diff is supposed to implement. */
  task: string
  /** Paths the plan said it would touch (to detect unrelated edits). */
  affectedPaths?: string[]
  /** Total number of patches in the proposal (for the "too many files" check). */
  totalPatches?: number
  /** Whether the proposal shipped a test plan (testsToRun). */
  hasTestPlan?: boolean
  /** Task constraints: test_only, source_only, etc. */
  constraints?: string[]
  /** Confidence score of the selected file (high/medium/low). */
  fileConfidence?: 'high' | 'medium' | 'low'
}

// --- Placeholder / non-actionable content ---------------------------------

// Strong signals that the "diff" is not real, applicable code → hard fail.
const PLACEHOLDER_FAIL: Array<{ re: RegExp; detail: string }> = [
  { re: /\bTODO\b/, detail: 'Contains a TODO marker' },
  { re: /\bFIXME\b/, detail: 'Contains a FIXME marker' },
  { re: /placeholder/i, detail: 'Contains the word "placeholder"' },
  { re: /implement(ation)?\s+(the\s+)?(logic|me|here|this)/i, detail: 'Contains "implement logic here"-style stub text' },
  { re: /your\s+(implementation|code)\s+here/i, detail: 'Contains "your implementation here" stub text' },
  { re: /dummy\s+function/i, detail: 'Declares a dummy function' },
  { re: /fake\s+security\s+check/i, detail: 'Contains a fake security check' },
  { re: /exact\s+edits?\s+require\s+an?\s+AI\s+provider/i, detail: 'Is a mock/conceptual stub, not an applicable patch' },
  { re: /need\s+file\s+content\s+before\s+proposing/i, detail: 'No patch was generated (file content unavailable)' },
]

// Weaker signals — suspicious, but the diff may still be reviewable → warn.
const PLACEHOLDER_WARN: Array<{ re: RegExp; detail: string }> = [
  { re: /(^|\n)\s*\+?\s*return\s+true\s*;?\s*(\n|$)/i, detail: 'Body is essentially "return true" — likely a stub' },
  { re: /\bconsole\.warn\s*\(/, detail: 'Uses console.warn — may be stub logging rather than real behavior' },
  { re: /\bnot\s+implemented\b/i, detail: 'Mentions "not implemented"' },
]

/**
 * Check if a string looks like unstructured JSON or provider debug output
 * (not a real code diff).
 */
function isUnstructuredJsonOutput(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  // Looks like JSON object or array.
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed)
      return true // Valid JSON, not a diff.
    } catch {
      return false // Invalid JSON, might be a diff.
    }
  }

  // Looks like raw provider error/debug output.
  if (trimmed.includes('"error"') || trimmed.includes('"message"') || trimmed.includes('"type"')) {
    return true
  }

  return false
}

/**
 * Check if a patch appears to modify a different file than the one declared.
 * E.g., proposedChange mentions "src/Button.tsx" but patch.path is "src/Icon.tsx".
 */
function extractModifiedPath(code: string): string | undefined {
  // Look for diff-style headers like "--- a/src/Button.tsx" or "diff --git a/src/Button.tsx".
  const diffMatch = code.match(/^(?:---|diff --git a\/|modified:)\s*(\S+)/m)
  if (diffMatch) return diffMatch[1]

  // Look for common file path patterns in the code.
  const pathMatch = code.match(/(?:file|path|from|to)\s*:?\s*['"]?([a-zA-Z0-9/_.-]+\.[a-z]{1,4})['"]?/i)
  if (pathMatch) return pathMatch[1]

  return undefined
}

/**
 * Check if the patch violates a constraint (e.g., test_only but modifies source).
 */
function violatesConstraint(patch: FilePatchProposal, constraints: string[]): string | undefined {
  if (constraints.includes('test_only')) {
    const isSourceFile = !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(patch.path)
    if (isSourceFile && !/package\.json|tsconfig|jest\.config/.test(patch.path)) {
      return `Task is test-only, but patch modifies source file: ${patch.path}`
    }
  }

  if (constraints.includes('source_only')) {
    const isTestFile = /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(patch.path)
    if (isTestFile) {
      return `Task is source-only, but patch modifies test file: ${patch.path}`
    }
  }

  if (constraints.includes('docs_only')) {
    const isDocFile = /(readme|docs?|\.md)$/i.test(patch.path)
    if (!isDocFile) {
      return `Task is docs-only, but patch modifies code file: ${patch.path}`
    }
  }

  return undefined
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
}

const STATUS_RANK: Record<VerificationStatus, number> = { passed: 0, needs_review: 1, failed: 2 }

/**
 * Evaluate a single proposed file patch. Returns a status, a 0–100 score, and
 * the specific issues found (only failing/warning checks are listed).
 */
export function analyzePatch(patch: FilePatchProposal, ctx: VerifyContext): DiffVerification {
  const issues: VerificationCheck[] = []
  const passedChecks: string[] = []
  const code = patch.proposedChange || ''

  const record = (passed: boolean, id: string, label: string, severity: 'fail' | 'warn', detail: string) => {
    if (passed) passedChecks.push(label)
    else issues.push({ id, label, severity, detail })
  }

  // 0. Check for unstructured JSON or provider output.
  const isJson = isUnstructuredJsonOutput(code)
  record(!isJson, 'structured', 'Is a real diff, not JSON/debug output', 'fail', isJson ? 'Patch appears to be raw provider output (JSON or debug text), not a valid code diff.' : '')

  // 1. Grounded in real file content.
  record(
    patch.groundedInContent === true,
    'grounded',
    'Grounded in file content',
    'fail',
    patch.contentUnavailableReason || 'Patch was not generated from the real file content.'
  )

  // 2. Strong placeholder / non-actionable content.
  const strong = PLACEHOLDER_FAIL.find((p) => p.re.test(code))
  record(!strong, 'placeholder', 'No placeholder/stub content', 'fail', strong?.detail || '')

  // 3. Weak placeholder signals.
  const weak = PLACEHOLDER_WARN.find((p) => p.re.test(code))
  record(!weak, 'weak_placeholder', 'No weak-stub signals', 'warn', weak?.detail || '')

  // 4. Explanation present (change summary + reasoning).
  const explained = (patch.changeSummary || '').trim().length > 8 && (patch.reasoning || '').trim().length > 15
  record(explained, 'explanation', 'Includes an explanation', 'warn', 'Missing a clear change summary or reasoning.')

  // 5. Risky runtime behavior: throwing in a normal execution path (no surrounding catch).
  const throws = /\bthrow\s+new\s+\w*Error/.test(code)
  const guarded = /\bcatch\s*\(/.test(code)
  record(!(throws && !guarded), 'risky_throw', 'No unguarded throws in normal paths', 'warn', 'Adds a throw in what looks like a normal execution path (no surrounding catch).')

  // 6. Unused exported function/const (only flag when detectable within the diff).
  const exportNames = [...code.matchAll(/export\s+(?:async\s+)?(?:function|const|let)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1])
  const unused = exportNames.find((name) => {
    const occurrences = code.split(new RegExp(`\\b${name}\\b`)).length - 1
    return occurrences <= 1
  })
  record(!unused, 'unused_export', 'No unused exports', 'warn', unused ? `Exports "${unused}" but it is never referenced within the diff.` : '')

  // 7. Feature flag added without integration (a flag declared but never branched on).
  const flagDecl = code.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*(?:[Ff]lag|[Ee]nabled?|[Ff]eature)[\w$]*)\s*=/)
  const flagName = flagDecl?.[1]
  const flagUsed = flagName ? new RegExp(`if\\s*\\([^)]*\\b${flagName}\\b`).test(code) : true
  record(flagUsed, 'feature_flag', 'Feature flags are integrated', 'warn', flagName ? `Declares feature flag "${flagName}" but never branches on it.` : '')

  // 8. File path mismatch: declared file vs modified file.
  const modifiedPath = extractModifiedPath(code)
  const pathMatches = !modifiedPath || modifiedPath.includes(patch.path) || patch.path.includes(modifiedPath)
  record(pathMatches, 'path_match', 'Patch path matches declared file', 'fail', modifiedPath ? `Patch modifies "${modifiedPath}" but file is declared as "${patch.path}".` : '')

  // 9. File appears unrelated to the request (no token overlap with the task; skip tests/config).
  if (ctx.task) {
    const isInfra = /(test|spec|\.config\.|\.lock|readme)/i.test(patch.path)
    const taskTokens = new Set(tokenize(ctx.task))
    const pathTokens = tokenize(patch.path)
    const overlap = pathTokens.some((t) => taskTokens.has(t))
    const declaredAffected = ctx.affectedPaths ? ctx.affectedPaths.includes(patch.path) : true
    record(isInfra || overlap || declaredAffected, 'unrelated', 'File is relevant to the request', 'warn', 'File has no obvious connection to the requested change.')
  }

  // 10. Low-confidence file not required.
  if (ctx.fileConfidence === 'low' && ctx.affectedPaths && !ctx.affectedPaths.includes(patch.path)) {
    record(false, 'low_confidence', 'File was high-confidence selection', 'warn', 'File was selected with low confidence and is not in the affected files list.')
  }

  // 11. Constraint violations.
  const constraintViolation = violatesConstraint(patch, ctx.constraints || [])
  record(!constraintViolation, 'constraints', 'Respects task constraints', 'fail', constraintViolation || '')

  return finalize(issues, passedChecks)
}

function finalize(issues: VerificationCheck[], passedChecks: string[]): DiffVerification {
  const fails = issues.filter((i) => i.severity === 'fail').length
  const warns = issues.filter((i) => i.severity === 'warn').length
  const status: VerificationStatus = fails > 0 ? 'failed' : warns > 0 ? 'needs_review' : 'passed'
  const score = Math.max(0, 100 - fails * 40 - warns * 15)
  return { status, score, issues, passedChecks }
}

export interface ProposalVerificationSummary {
  /** Worst status across all files. */
  status: VerificationStatus
  passed: number
  needsReview: number
  failed: number
  /** Approve-All is forbidden when any file failed verification. */
  canApproveAll: boolean
  /** Approve-All needs explicit confirmation when any file needs review. */
  requiresConfirmation: boolean
  /** Proposal-level notes (e.g. too many files, missing test plan). */
  notes: string[]
}

/**
 * Verify every patch in a proposal (mutating each patch's `verification`),
 * apply proposal-level checks, and summarize for the approval workflow.
 */
export function verifyProposalPatches(
  patches: FilePatchProposal[],
  ctx: VerifyContext
): { patches: FilePatchProposal[]; summary: ProposalVerificationSummary } {
  const notes: string[] = []

  // Proposal-level: too many files for a simple request.
  const simpleRequest = tokenize(ctx.task).length <= 6
  if (simpleRequest && patches.length > 3) {
    notes.push(`Proposal changes ${patches.length} files for what looks like a simple request — review scope.`)
  }
  // Proposal-level: no test plan.
  if (ctx.hasTestPlan === false) {
    notes.push('No test plan was included with this proposal.')
  }

  const verified = patches.map((p) => {
    const verification = analyzePatch(p, { ...ctx, totalPatches: patches.length })
    return { ...p, verification }
  })

  let worst: VerificationStatus = 'passed'
  let passed = 0
  let needsReview = 0
  let failed = 0
  for (const p of verified) {
    const s = p.verification!.status
    if (STATUS_RANK[s] > STATUS_RANK[worst]) worst = s
    if (s === 'passed') passed++
    else if (s === 'needs_review') needsReview++
    else failed++
  }
  // A proposal-level note bumps a clean proposal to needs_review.
  if (worst === 'passed' && notes.length > 0) worst = 'needs_review'

  return {
    patches: verified,
    summary: {
      status: worst,
      passed,
      needsReview,
      failed,
      canApproveAll: failed === 0,
      requiresConfirmation: failed === 0 && (needsReview > 0 || notes.length > 0),
      notes,
    },
  }
}
