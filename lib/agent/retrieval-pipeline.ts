// Multi-stage retrieval orchestration:
//   1. lexical  — keyword/synonym scoring over the indexed tree (wide net)
//   2. path     — filename boosts + example/mock/generated penalties
//   3. semantic — stem matching for morphological variants
//   (1–3 are computed together in retrieveRelevantFiles; reported per stage)
//   4. rerank   — optional AI reranking of the top candidates
//
// The AI reranker is injected as a callback so this module stays pure and
// testable; routes wire it to the provider chain behind the budget guard.

import type { IndexedFile, QuestionIntent, RetrievedFile } from './types'
import { isLowValuePath, retrieveRelevantFiles, type RetrievedFileWithConfidence } from './retrieval'

export interface RetrievalStage {
  name: string
  description: string
  candidates: number
}

export interface MultiStageResult {
  results: RetrievedFileWithConfidence[]
  stages: RetrievalStage[]
  /** 'ai' when the AI reranker produced the final order, else 'lexical'. */
  reranker: 'ai' | 'lexical'
}

export type RerankFn = (query: string, candidates: RetrievedFileWithConfidence[]) => Promise<string[] | null>

const WIDE_LIMIT = 24
const RERANK_CANDIDATES = 12

/**
 * Apply an AI-proposed ordering, defensively: only paths that were actually
 * candidates count (the model cannot introduce files), and anything the
 * model dropped is appended in lexical order.
 */
export function applyRerankOrder(candidates: RetrievedFileWithConfidence[], order: string[]): RetrievedFileWithConfidence[] {
  const byPath = new Map(candidates.map((c) => [c.path, c]))
  const reranked: RetrievedFileWithConfidence[] = []
  for (const path of order) {
    const hit = byPath.get(path)
    if (hit) {
      reranked.push({ ...hit, reason: `${hit.reason} · AI-reranked #${reranked.length + 1}` })
      byPath.delete(path)
    }
  }
  return [...reranked, ...byPath.values()]
}

export async function retrieveMultiStage(
  query: string,
  files: IndexedFile[],
  options: { intent?: QuestionIntent; limit?: number; rerank?: RerankFn } = {}
): Promise<MultiStageResult> {
  const { intent, limit = 8, rerank } = options

  // Stages 1–3 (lexical + path heuristics + stem matching) share one scoring
  // pass; the stage report decomposes what happened for transparency.
  const wide = retrieveRelevantFiles(query, files, { intent, limit: WIDE_LIMIT })
  const downranked = wide.filter((r) => isLowValuePath(r.path)).length
  const stemMatched = wide.filter((r) => r.reason.includes('~')).length

  const stages: RetrievalStage[] = [
    {
      name: 'lexical',
      description: 'Keyword + synonym + intent-boost scoring over indexed paths',
      candidates: wide.length,
    },
    {
      name: 'path-aware',
      description: `Filename-match boosts; ${downranked} example/mock/generated path${downranked === 1 ? '' : 's'} down-ranked`,
      candidates: wide.length,
    },
    {
      name: 'semantic',
      description: `Stem matching for word variants (${stemMatched} file${stemMatched === 1 ? '' : 's'} gained matches)`,
      candidates: Math.min(wide.length, RERANK_CANDIDATES),
    },
  ]

  let results = wide.slice(0, RERANK_CANDIDATES)
  let reranker: 'ai' | 'lexical' = 'lexical'

  if (rerank && results.length > 1) {
    try {
      const order = await rerank(query, results)
      if (order && order.length > 0) {
        const applied = applyRerankOrder(results, order)
        // Defensive: a valid rerank must preserve the candidate set.
        if (applied.length === results.length) {
          results = applied
          reranker = 'ai'
        }
      }
    } catch {
      // Reranking is best-effort; lexical order already works.
    }
  }
  stages.push({
    name: 'rerank',
    description: reranker === 'ai' ? 'AI reranking of top candidates' : 'AI reranking skipped — lexical order kept',
    candidates: Math.min(results.length, limit),
  })

  return { results: results.slice(0, limit), stages, reranker }
}
