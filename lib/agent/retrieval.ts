// Evidence retrieval over the indexed file tree. Given a question or task,
// score every indexed file by keyword overlap with its path, boosted by the
// file category the question intent suggests. Answers are grounded in these
// results — files that score zero are never cited.

import type { FileCategory, IndexedFile, QuestionIntent, RetrievedFile } from './types'
import { extractKeywords } from './intent'

// Domain synonyms so "fetch GitHub data" matches lib/github-service.ts even
// when the exact words differ.
const SYNONYMS: Record<string, string[]> = {
  fetch: ['service', 'api', 'client', 'request'],
  fetched: ['service', 'api', 'client'],
  data: ['service', 'store'],
  ai: ['ai', 'groq', 'anthropic', 'llm', 'provider'],
  analysis: ['ai', 'insights', 'analysis'],
  chart: ['chart', 'graph', 'recharts', 'performance'],
  charts: ['chart', 'graph', 'performance'],
  caching: ['cache', 'swr', 'storage'],
  cache: ['cache', 'swr', 'storage'],
  auth: ['auth', 'token', 'session'],
  token: ['token', 'auth', 'env'],
  route: ['route', 'api', 'page'],
  routes: ['route', 'api', 'page'],
  test: ['test', 'spec'],
  tests: ['test', 'spec'],
  environment: ['env', 'config'],
  env: ['env', 'config'],
  dashboard: ['dashboard', 'page', 'overview'],
  commit: ['commit', 'github'],
  commits: ['commit', 'github'],
  rate: ['rate', 'limit', 'github'],
  github: ['github', 'octokit'],
}

const INTENT_CATEGORY_BOOST: Partial<Record<QuestionIntent, Partial<Record<FileCategory, number>>>> = {
  test_coverage_question: { test: 5 },
  configuration_question: { config: 4, service_or_lib: 1 },
  dependency_question: { config: 5 },
  architecture_question: { config: 2, backend_api: 1, frontend_page: 1 },
  file_location_question: { service_or_lib: 1, backend_api: 1 },
  feature_implementation_question: { service_or_lib: 2, backend_api: 2 },
  change_impact_question: { service_or_lib: 1, backend_api: 1, frontend_page: 1 },
}

function expandKeywords(keywords: string[]): string[] {
  const expanded = new Set(keywords)
  for (const k of keywords) {
    for (const syn of SYNONYMS[k] || []) expanded.add(syn)
  }
  return [...expanded]
}

/**
 * Paths that rarely contain the implementation a question is about:
 * examples, mocks, fixtures, generated/vendored output, minified bundles.
 * They stay retrievable but are heavily down-ranked.
 */
const LOW_VALUE_PATH_RE =
  /(^|\/)(examples?|demos?|samples?|mocks?|__mocks__|fixtures?|__fixtures__|testdata|snapshots|__snapshots__|generated|__generated__|codegen|dist|build|out|vendor|third_party|node_modules)(\/|$)|\.(min\.(js|css))$|\.(snap|map|lock)$|-lock\.(json|yaml)$/i

export function isLowValuePath(path: string): boolean {
  return LOW_VALUE_PATH_RE.test(path)
}

const LOW_VALUE_MULTIPLIER = 0.25

/** Crude stemmer for semantic-ish matching: caching→cach, indexed→index. */
export function stemToken(token: string): string {
  return token
    .replace(/(ing|ied|ies)$/i, '')
    .replace(/(ed|er|es|s)$/i, '')
}

export type FileConfidence = 'high' | 'medium' | 'low'

export interface RetrievalOptions {
  limit?: number
  intent?: QuestionIntent
  /** Files to exclude (glob patterns or exact paths). */
  disallowedPatterns?: string[]
  /** Penalize generic keyword matches like "test", "error", "input". */
  penalizeGenericMatches?: boolean
}

export interface RetrievedFileWithConfidence extends RetrievedFile {
  confidence: FileConfidence
}

/**
 * Generic keywords that are weak signals (should penalize if that's the only match).
 */
const GENERIC_KEYWORDS = new Set([
  'test',
  'spec',
  'error',
  'message',
  'input',
  'output',
  'handler',
  'helper',
  'util',
  'utils',
  'component',
  'page',
  'route',
  'service',
])

function isGenericKeyword(keyword: string): boolean {
  return GENERIC_KEYWORDS.has(keyword.toLowerCase())
}

function matchesPattern(path: string, pattern: string): boolean {
  if (pattern === path) return true
  if (pattern.includes('*')) {
    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*').replace(/\//g, '\\/')}$`)
    return regex.test(path)
  }
  return path.includes(pattern)
}

export function retrieveRelevantFiles(
  query: string,
  files: IndexedFile[],
  options: RetrievalOptions = {}
): RetrievedFileWithConfidence[] {
  const { limit = 8, intent, disallowedPatterns = [], penalizeGenericMatches = true } = options
  const baseKeywords = extractKeywords(query)
  const keywords = expandKeywords(baseKeywords)
  const boosts = (intent && INTENT_CATEGORY_BOOST[intent]) || {}

  const scored: RetrievedFileWithConfidence[] = []

  const stemmedKeywords = new Map(baseKeywords.map((k) => [stemToken(k), k]))

  for (const file of files) {
    // Skip disallowed files.
    if (disallowedPatterns.some((p) => matchesPattern(file.path, p))) {
      continue
    }

    const pathTokens = extractKeywords(file.path)
    const tokenSet = new Set(pathTokens)
    const filename = file.path.split('/').pop() || file.path
    const filenameTokens = new Set(extractKeywords(filename))
    const matched: string[] = []
    const matchSources: ('exact' | 'semantic' | 'category' | 'generic')[] = []
    let score = 0

    for (const kw of keywords) {
      if (tokenSet.has(kw)) {
        // Exact path-token match; original query words count more than synonyms.
        const points = baseKeywords.includes(kw) ? 3 : 1.5
        score += points
        // Path-aware: a match in the filename itself is a stronger signal
        // than a match somewhere in the directory chain.
        if (filenameTokens.has(kw)) score += 1.5
        matched.push(kw)
        matchSources.push('exact')
      } else if (
        // Partial containment only between tokens long enough to be meaningful
        // (prevents e.g. "blockchain" matching the "ai" path token).
        pathTokens.some((t) => (kw.length >= 4 && t.includes(kw)) || (t.length >= 4 && kw.includes(t)))
      ) {
        score += 0.5
        if (!matched.includes(kw)) {
          matched.push(kw)
          matchSources.push('exact')
        }
      }
    }

    // Semantic-ish stage: stem matching catches morphological variants the
    // exact pass missed (caching↔cache, indexed↔indexing).
    for (const t of pathTokens) {
      const stem = stemToken(t)
      if (stem.length < 4) continue
      const original = stemmedKeywords.get(stem)
      if (original && !matched.includes(original)) {
        score += 2
        matched.push(`${original}~${t}`)
        matchSources.push('semantic')
      }
    }

    const categoryBoost = boosts[file.category] || 0
    if (score > 0 && categoryBoost) score += categoryBoost
    // Category-only relevance (e.g. test files for "what tests exist?" even
    // with no keyword overlap).
    if (score === 0 && categoryBoost >= 4) {
      score = categoryBoost
      matched.push(`category:${file.category}`)
      matchSources.push('category')
    }

    // Penalize if match is only through generic keywords.
    if (penalizeGenericMatches && matched.length > 0 && matched.every((m) => isGenericKeyword(m))) {
      score *= 0.4
      matchSources.push('generic')
    }

    // Low-value path penalty: examples/mocks/fixtures/generated keep a
    // residual score but rank far below real implementation files.
    let lowValue = false
    if (score > 0 && isLowValuePath(file.path)) {
      score *= LOW_VALUE_MULTIPLIER
      lowValue = true
    }

    if (score > 0) {
      // Determine confidence level based on match sources and score.
      let confidence: FileConfidence = 'low'
      if (matchSources.includes('category') && !matchSources.includes('exact') && !matchSources.includes('semantic')) {
        confidence = 'low'
      } else if (score >= 5 && matchSources.includes('exact')) {
        confidence = 'high'
      } else if (score >= 2 && (matchSources.includes('exact') || matchSources.includes('semantic'))) {
        confidence = 'medium'
      } else {
        confidence = 'low'
      }

      scored.push({
        path: file.path,
        category: file.category,
        score: Math.round(score * 10) / 10,
        confidence,
        reason:
          (matched.length > 0
            ? `Matched: ${matched.slice(0, 5).join(', ')}`
            : 'Category relevant to question intent') +
          (lowValue ? ' (down-ranked: example/mock/generated path)' : '') +
          (matchSources.includes('generic') ? ' (weak: generic keywords only)' : ''),
      })
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}

/**
 * Select files a change task would likely touch. Same scoring as retrieval
 * but biased toward source files over docs/config noise.
 */
export function selectAffectedFiles(
  task: string,
  files: IndexedFile[],
  limit = 6
): RetrievedFile[] {
  const sourceCategories: FileCategory[] = [
    'backend_api', 'service_or_lib', 'frontend_page', 'frontend_component', 'test', 'config',
  ]
  const candidates = files.filter((f) => sourceCategories.includes(f.category))
  return retrieveRelevantFiles(task, candidates, { limit })
}
