/**
 * Task Classification and Normalization.
 *
 * Analyzes user task descriptions to extract intent, constraints, and risk signals.
 * Produces structured metadata for planner guidance.
 */

export type TaskType =
  | 'bug_fix'
  | 'test_addition'
  | 'test_fix'
  | 'ui_change'
  | 'api_change'
  | 'backend_change'
  | 'documentation'
  | 'refactor'
  | 'dependency_update'
  | 'config_change'
  | 'unknown'

export type TaskConstraint = 'test_only' | 'source_only' | 'docs_only' | 'no_breaking_changes'

export interface TaskClassification {
  /** Classified task type. */
  type: TaskType
  /** Extracted or inferred target symbol/function/component name (if any). */
  targetSymbol?: string
  /** Extracted or inferred target file/path pattern (if any). */
  targetFile?: string
  /** Inferred package/workspace name (if any). */
  likelyPackage?: string
  /** User-specified constraints (test_only, source_only, etc.). */
  constraints: TaskConstraint[]
  /** Initial risk level based on keywords and task type. */
  riskLevel: 'low' | 'medium' | 'high'
  /** Confidence that the task intent is clear (0-100). */
  clarityScore: number
  /** True if task is ambiguous and clarification may be needed. */
  requiresClarification: boolean
  /** Human-readable explanation of classification. */
  reasoning: string
  /** Detected keywords that influenced classification. */
  detectedKeywords: string[]
}

/**
 * Keywords that signal task type, constraints, or risk.
 */
const TASK_TYPE_INDICATORS = {
  bug_fix: ['fix', 'bug', 'broken', 'crash', 'error', 'failed', 'regression', 'issue'],
  test_addition: ['test', 'spec', 'unit test', 'integration test', 'e2e test', 'add test', 'write test'],
  test_fix: ['fix test', 'test failing', 'test broken', 'debug test', 'failing spec'],
  ui_change: [
    'ui',
    'component',
    'button',
    'form',
    'modal',
    'layout',
    'style',
    'css',
    'tailwind',
    'visual',
    'frontend',
    'react',
    'vue',
    'svelte',
  ],
  api_change: ['api', 'endpoint', 'route', 'request', 'response', 'rest', 'graphql', 'server'],
  backend_change: ['backend', 'database', 'sql', 'service', 'model', 'handler', 'logic'],
  documentation: ['doc', 'readme', 'comment', 'jsdoc', 'javadoc', 'docstring', 'explain', 'add docs'],
  refactor: ['refactor', 'rename', 'reorganize', 'cleanup', 'simplify', 'extract', 'move'],
  dependency_update: ['upgrade', 'update', 'dependency', 'package', 'version', 'npm', 'yarn', 'pnpm'],
  config_change: ['config', 'setting', 'environment', 'env', '.env', 'tsconfig', 'webpack', 'vite'],
}

const CONSTRAINT_INDICATORS = {
  test_only: ['test only', 'test changes only', 'test file', 'do not modify source', 'no source changes'],
  source_only: ['source only', 'source file', 'implementation only', 'no test', 'no test changes'],
  docs_only: ['docs only', 'documentation only', 'readme only', 'comment only'],
  no_breaking_changes: ['no breaking', 'backwards compatible', 'compatible', 'non-breaking'],
}

const HIGH_RISK_KEYWORDS = [
  'auth',
  'security',
  'password',
  'token',
  'secret',
  'migration',
  'database',
  'schema',
  'breaking',
  'critical',
  'monorepo',
  'root',
]

const CLARITY_PENALTY_KEYWORDS = ['something', 'stuff', 'thing', 'maybe', 'probably', 'unclear', 'not sure']

/**
 * Tokenize a task description for keyword matching.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)
}

/**
 * Find keywords in task that match a set of indicators.
 */
function findMatches(tokens: string[], keywords: string[]): string[] {
  const lowerKeywords = keywords.map((k) => k.toLowerCase())
  const matches: string[] = []

  for (const token of tokens) {
    for (const keyword of lowerKeywords) {
      if (keyword.includes(token) || token.includes(keyword)) {
        matches.push(keyword)
      }
    }
  }

  return [...new Set(matches)]
}

/**
 * Extract a likely symbol name from task description.
 * Look for patterns like: "fix get-error-message", "add test for handleClick", etc.
 */
function extractTargetSymbol(task: string): string | undefined {
  const patterns = [
    /(?:fix|test|add|implement|update|rename|for)\s+(?:(?:the|a)\s+)?(?:function|method|component|class|interface|type)?\s+`?([a-zA-Z0-9_-]+)`?/i,
    /(?:for|in|of)\s+(?:the\s+)?`?([a-zA-Z_][a-zA-Z0-9_]*)`/i,
    /`([a-zA-Z_][a-zA-Z0-9_]*)`/,
  ]

  for (const pattern of patterns) {
    const match = task.match(pattern)
    if (match && match[1] && match[1].length > 1) {
      return match[1]
    }
  }

  return undefined
}

/**
 * Extract a likely file path from task description.
 * Look for patterns like: "in src/utils/", "modify components/Button.tsx", etc.
 */
function extractTargetFile(task: string): string | undefined {
  const patterns = [
    /(?:in|file|path)\s+`?([a-zA-Z0-9/_.-]+\.[a-zA-Z]+)`?/i,
    /`([a-zA-Z0-9/_.-]+\.[a-zA-Z]+)`/,
  ]

  for (const pattern of patterns) {
    const match = task.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }

  return undefined
}

/**
 * Infer package/workspace name from task keywords.
 * Look for patterns like: "in the auth package", "for the UI library", etc.
 */
function inferLikelyPackage(task: string): string | undefined {
  const patterns = [
    /(?:in|for|within)\s+(?:the\s+)?([a-z][a-z0-9_]*)\s+(?:package|workspace|lib|folder)/i,
    /(?:in|for)\s+`([a-z][a-z0-9_]*)`/i,
  ]

  for (const pattern of patterns) {
    const match = task.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }

  return undefined
}

/**
 * Classify a user task description into structured metadata.
 */
export function classifyTask(task: string): TaskClassification {
  const tokens = tokenize(task)
  const detectedKeywords: string[] = []
  let primaryType: TaskType = 'unknown'
  let primaryScore = 0

  // Detect task type by scoring each category.
  for (const [type, keywords] of Object.entries(TASK_TYPE_INDICATORS)) {
    const matches = findMatches(tokens, keywords)
    const score = matches.length

    if (score > primaryScore) {
      primaryScore = score
      primaryType = type as TaskType
      detectedKeywords.push(...matches)
    }
  }

  // Detect constraints.
  const constraints: TaskConstraint[] = []
  for (const [constraint, keywords] of Object.entries(CONSTRAINT_INDICATORS)) {
    const matches = findMatches(tokens, keywords)
    if (matches.length > 0) {
      constraints.push(constraint as TaskConstraint)
      detectedKeywords.push(...matches)
    }
  }

  // Detect risk signals.
  const riskMatches = findMatches(tokens, HIGH_RISK_KEYWORDS)
  let riskLevel: 'low' | 'medium' | 'high' = 'low'
  if (riskMatches.length > 0) {
    riskLevel = riskMatches.some((k) => ['migration', 'breaking', 'auth', 'security'].includes(k))
      ? 'high'
      : 'medium'
    detectedKeywords.push(...riskMatches)
  }

  // Assess clarity.
  const clarityPenalties = findMatches(tokens, CLARITY_PENALTY_KEYWORDS)
  const clarityScore = Math.max(0, 100 - clarityPenalties.length * 15)
  const requiresClarification = clarityScore < 60 || (primaryType === 'unknown' && task.length < 30)

  // Extract optional metadata.
  const targetSymbol = extractTargetSymbol(task)
  const targetFile = extractTargetFile(task)
  const likelyPackage = inferLikelyPackage(task)

  // Build reasoning.
  let reasoning = `Classified as ${primaryType}.`
  if (targetSymbol) reasoning += ` Target symbol: ${targetSymbol}.`
  if (targetFile) reasoning += ` Target file: ${targetFile}.`
  if (likelyPackage) reasoning += ` Likely package: ${likelyPackage}.`
  if (constraints.length > 0) reasoning += ` Constraints: ${constraints.join(', ')}.`
  if (riskMatches.length > 0) reasoning += ` Risk signals detected: ${riskMatches.join(', ')}.`
  if (requiresClarification) reasoning += ` ⚠️ Task may be ambiguous; consider clarifying intent.`

  return {
    type: primaryType,
    targetSymbol,
    targetFile,
    likelyPackage,
    constraints,
    riskLevel,
    clarityScore,
    requiresClarification,
    reasoning,
    detectedKeywords: [...new Set(detectedKeywords)],
  }
}
