// In-memory TTL cache for codebase maps so Ask/Plan/Diff requests don't
// re-fetch the whole repository tree on every call. Best-effort: on
// serverless deploys the cache may be cold per instance, which only costs an
// extra tree fetch. A database-backed index can replace this later.

import { GitHubService } from '@/lib/github-service'
import { buildCodebaseMap } from './file-classifier'
import type { CodebaseMap } from './types'
import type { IndexErrorKind } from './repo-indexer'

const TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { map: CodebaseMap; expires: number }>()

export type CodebaseMapResult =
  | { ok: true; map: CodebaseMap }
  | { ok: false; kind: IndexErrorKind; message: string; status: number }

export async function getOrBuildCodebaseMap(owner: string, repo: string): Promise<CodebaseMapResult> {
  const key = `${owner}/${repo}`.toLowerCase()
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return { ok: true, map: hit.map }

  const outcome = await GitHubService.getRepoTreeDetailed(owner, repo)
  if (!outcome.ok) {
    // Errors are not cached — a rate limit or transient failure should not
    // poison the cache for the next request.
    return outcome
  }

  const map = buildCodebaseMap(
    `${owner}/${repo}`,
    outcome.defaultBranch,
    outcome.entries,
    outcome.truncated,
    outcome.partial
  )
  cache.set(key, { map, expires: Date.now() + TTL_MS })
  return { ok: true, map }
}

export function parseRepoParam(repoParam: string | null): { owner: string; repo: string } | null {
  if (!repoParam) return null
  const parts = repoParam.split('/').filter(Boolean)
  if (parts.length !== 2) return null
  return { owner: parts[0].trim(), repo: parts[1].trim() }
}
