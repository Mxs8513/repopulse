// Request safety gate. Every task entering the Change Planner is classified
// before any retrieval or AI call. Unsafe requests are refused with a reason
// and a safer alternative — they never reach the planning pipeline.

import type { SafetyClassification, SafetyResult } from './types'

interface SafetyRule {
  classification: SafetyClassification
  patterns: RegExp[]
  reason: string
  suggestion: string
}

const UNSAFE_RULES: SafetyRule[] = [
  {
    classification: 'repo_deletion_request',
    patterns: [
      /\bdelete\s+(the\s+)?(entire\s+|whole\s+)?repo(sitory)?\b/i,
      /\b(remove|wipe|destroy|nuke)\s+(the\s+)?(entire\s+|whole\s+)?(repo(sitory)?|project|codebase)\b/i,
      /\bforce[- ]?push\b.*\b(main|master)\b/i,
      /\bdelete\s+all\s+(branches|files|history)\b/i,
    ],
    reason: 'This request would destroy the repository or its history.',
    suggestion: 'If you want to remove a specific feature or file, name it explicitly and I can plan a scoped, reviewable change.',
  },
  {
    classification: 'secrets_request',
    patterns: [
      /\b(print|show|reveal|dump|expose|leak|read out|exfiltrate|steal)\b.*\b(env|environment variable|secret|token|api[_ ]?key|credential|password)/i,
      /\b(env|secret|token|api[_ ]?key|credential|password)s?\b.*\b(exfiltrate|leak|steal|send to|upload to|post to)\b/i,
      /\bexfiltrate\b/i,
      /\bcommit\b.*\.(env|pem|key)\b/i,
      /\bhardcode\b.*\b(secret|token|key|password)\b/i,
    ],
    reason: 'This request involves exposing or exfiltrating secrets or credentials.',
    suggestion: 'Secrets stay server-side in environment variables. I can plan improvements to env-var handling or secret scanning instead.',
  },
  {
    classification: 'bypass_review_request',
    patterns: [
      /\b(commit|merge|push|apply|deploy)\b.*\bwithout\s+(approval|review|asking|confirmation)\b/i,
      /\b(skip|bypass|disable)\b.*\b(review|approval|checks?|ci)\b/i,
      /\bhide\b.*\b(change|commit|diff)s?\b.*\b(from|reviewer)/i,
      /\bauto[- ]?(merge|commit|push)\b/i,
      /\bsilently\b.*\b(change|modify|commit|push)\b/i,
    ],
    reason: 'This request tries to bypass the human review/approval gate, which RepoPulse Agent enforces by design.',
    suggestion: 'Generate the plan and proposed diff normally — review and approval are required before anything is applied.',
  },
  {
    classification: 'risky_destructive_change',
    patterns: [
      /\b(disable|delete|remove|skip)\s+(all\s+)?(the\s+)?tests?\b/i,
      /\b(disable|remove|turn off)\b.*\b(lint(ing|er)?|type[- ]?check(ing)?|validation|auth(entication|orization)?|security)\b/i,
      /\bdrop\s+(table|database|schema|column)\b/i,
      /\brm\s+-rf\b/i,
      /\bdelete\s+(the\s+)?(migrations?|database|prod(uction)? data)\b/i,
    ],
    reason: 'This change is destructive or weakens quality/safety gates (tests, linting, auth, data).',
    suggestion: 'If a test or check is genuinely obsolete, plan a scoped change that documents why and removes only that item with review.',
  },
]

const SAFE_HINTS = [
  /\b(add|implement|improve|fix|refactor|optimi[sz]e|create|update|extend|write|document|test|migrate|rename|extract|clean ?up)\b/i,
]

export function classifyRequestSafety(task: string): SafetyResult {
  const trimmed = task.trim()

  if (!trimmed) {
    return {
      classification: 'unknown',
      safe: false,
      reason: 'Empty task — nothing to classify.',
      suggestion: 'Describe the code change you want, e.g. "Add caching to the repo API".',
    }
  }

  for (const rule of UNSAFE_RULES) {
    if (rule.patterns.some((p) => p.test(trimmed))) {
      return {
        classification: rule.classification,
        safe: false,
        reason: rule.reason,
        suggestion: rule.suggestion,
      }
    }
  }

  if (SAFE_HINTS.some((p) => p.test(trimmed))) {
    return {
      classification: 'safe_code_change',
      safe: true,
      reason: 'Recognized as a normal, scoped code-change request.',
    }
  }

  // Unrecognized phrasing: allow planning but flag it for the reviewer.
  return {
    classification: 'unknown',
    safe: true,
    reason: 'Task intent not clearly recognized — proceeding, but review the generated plan carefully.',
  }
}
