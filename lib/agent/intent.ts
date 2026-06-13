// Ask Repo intent routing. Questions are classified before retrieval so the
// retrieval layer can boost the right file categories, and the UI can show
// what kind of question the system thinks it is answering.

import type { QuestionIntent } from './types'

interface IntentRule {
  intent: QuestionIntent
  patterns: RegExp[]
}

const INTENT_RULES: IntentRule[] = [
  {
    intent: 'test_coverage_question',
    patterns: [
      /\btests?\b.*\b(exist|coverage|cover|present|written)\b/i,
      /\b(what|which|any|are there)\b.*\btests?\b/i,
      /\btest (coverage|suite|files?)\b/i,
    ],
  },
  {
    intent: 'configuration_question',
    patterns: [
      /\b(env(ironment)? variables?|config(uration)?|settings|\.env|secrets? handling|tokens? handled)\b/i,
      /\bwhere\b.*\b(configured|config)\b/i,
    ],
  },
  {
    intent: 'dependency_question',
    patterns: [
      /\b(dependenc(y|ies)|packages?|libraries|npm modules?|imports?)\b.*\b(used|installed|listed|rely|depend)\b/i,
      /\bwhat (dependencies|packages|libraries)\b/i,
      /\bwhich (dependencies|packages|libraries)\b/i,
    ],
  },
  {
    intent: 'change_impact_question',
    patterns: [
      /\bwhat\b.*\b(would|will|might)\b.*\bchange\b/i,
      /\b(files?|code)\b.*\b(affected|impacted|touched|modified)\b.*\b(if|when)\b/i,
      /\bif i (add|change|remove|refactor|modify)\b/i,
      /\bwhere would i add\b/i,
    ],
  },
  {
    intent: 'architecture_question',
    patterns: [
      /\b(architecture|structure|organi[sz]ed|layout|overview|high[- ]level|stack|frameworks?)\b/i,
      /\bhow (is|does)\b.*\b(structured|organized|work overall)\b/i,
      /\bwhich (routes|pages) are\b/i,
    ],
  },
  {
    intent: 'feature_implementation_question',
    patterns: [
      /\bhow (is|are|does|do)\b.*\b(implemented|work|handled|done|built)\b/i,
      /\bwhere is\b.*\b(implemented|handled|done|logic)\b/i,
    ],
  },
  {
    intent: 'file_location_question',
    patterns: [
      /\bwhere\b.*\b(is|are|does|do|can i find|defined|located|fetched|stored|handled)\b/i,
      /\bwhich files?\b/i,
      /\bfind the (file|code|module)\b/i,
      /\bwhat files?\b.*\b(control|handle|contain)\b/i,
    ],
  },
]

export function classifyQuestionIntent(question: string): QuestionIntent {
  const trimmed = question.trim()
  if (!trimmed) return 'unknown_repo_question'
  for (const rule of INTENT_RULES) {
    if (rule.patterns.some((p) => p.test(trimmed))) return rule.intent
  }
  return 'unknown_repo_question'
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'can', 'could',
  'would', 'should', 'where', 'what', 'which', 'who', 'how', 'why', 'when', 'i', 'we',
  'you', 'it', 'this', 'that', 'these', 'those', 'in', 'on', 'at', 'to', 'for', 'of',
  'and', 'or', 'not', 'with', 'from', 'by', 'be', 'been', 'being', 'have', 'has', 'had',
  'my', 'our', 'your', 'its', 'there', 'here', 'if', 'add', 'find', 'me', 'any', 'exist',
  'file', 'files', 'code', 'repo', 'repository', 'project', 'implemented', 'handled',
  'located', 'defined', 'done',
])

// Short tokens that carry real meaning in code despite the length filter.
const SHORT_ALLOWLIST = new Set(['ai', 'ui', 'db', 'ci', 'cd', 'js', 'ts', 'go', 'rs', 'py'])

/**
 * Extract meaningful keywords from a question/task for retrieval scoring.
 * Tokenizes both with and without camelCase splitting so "githubService"
 * matches "github-service.ts" while "GitHub" still yields "github".
 */
export function extractKeywords(text: string): string[] {
  const tokenize = (input: string): string[] =>
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((w) => (w.length > 2 || SHORT_ALLOWLIST.has(w)) && !STOP_WORDS.has(w))

  const plain = tokenize(text)
  const camelSplit = tokenize(text.replace(/([a-z])([A-Z])/g, '$1 $2'))
  return [...new Set([...plain, ...camelSplit])]
}
