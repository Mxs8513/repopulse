// Repository tree indexing with real diagnostics. This module is pure logic
// over an injected TreeClient so the error handling and large-repo fallback
// can be unit tested without hitting the GitHub API. GitHubService provides
// the Octokit-backed client.

import type { RawTreeEntry } from './file-classifier'

export type IndexErrorKind =
  | 'invalid_input'
  | 'not_found'
  | 'auth_required'
  | 'rate_limited'
  | 'github_error'

export interface IndexError {
  ok: false
  kind: IndexErrorKind
  message: string
  /** Suggested HTTP status for API responses. */
  status: number
}

export interface IndexSuccess {
  ok: true
  defaultBranch: string
  /** GitHub reported the recursive tree listing as incomplete. */
  truncated: boolean
  /** We could not get a full tree and indexed important directories instead. */
  partial: boolean
  entries: RawTreeEntry[]
}

export type RepoTreeOutcome = IndexSuccess | IndexError

/** Minimal GitHub surface the indexer needs — injected for testability. */
export interface TreeClient {
  /** Repo metadata; must throw Octokit-shaped errors ({status, message}). */
  getRepo(owner: string, repo: string): Promise<{ defaultBranch: string }>
  /** Recursive tree for a branch. */
  getTree(owner: string, repo: string, branch: string): Promise<{ truncated: boolean; entries: RawTreeEntry[] }>
  /** Shallow listing of a single directory ('' = repo root). */
  getDirListing(owner: string, repo: string, path: string): Promise<RawTreeEntry[]>
}

// owner: GitHub usernames/orgs; repo: GitHub repo name charset.
const OWNER_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/
const REPO_RE = /^[a-zA-Z0-9._-]{1,100}$/

export function validateRepoInput(owner: string, repo: string): string | null {
  if (!owner || !repo) return 'Repository must be in owner/repo format.'
  if (!OWNER_RE.test(owner)) return `"${owner}" is not a valid GitHub owner name.`
  if (!REPO_RE.test(repo)) return `"${repo}" is not a valid GitHub repository name.`
  return null
}

interface GitHubishError {
  status?: number
  message?: string
  response?: { headers?: Record<string, string | undefined> }
}

function rateLimitResetHint(error: GitHubishError): string {
  const reset = error.response?.headers?.['x-ratelimit-reset']
  if (!reset) return ''
  const resetMs = Number(reset) * 1000
  if (!Number.isFinite(resetMs) || resetMs <= Date.now()) return ''
  const minutes = Math.max(1, Math.ceil((resetMs - Date.now()) / 60000))
  return ` Limit resets in about ${minutes} minute${minutes === 1 ? '' : 's'}.`
}

function isRateLimit(error: GitHubishError): boolean {
  if (error.status !== 403 && error.status !== 429) return false
  const remaining = error.response?.headers?.['x-ratelimit-remaining']
  if (remaining === '0') return true
  return /rate limit/i.test(error.message || '')
}

/**
 * Map a GitHub API error to a user-safe, actionable diagnosis. Never includes
 * token values or raw response bodies in the message.
 */
export function classifyGitHubError(error: unknown, tokenConfigured: boolean): IndexError {
  const e = (error || {}) as GitHubishError

  if (isRateLimit(e)) {
    return {
      ok: false,
      kind: 'rate_limited',
      status: 429,
      message:
        `GitHub API rate limit exceeded.${rateLimitResetHint(e)}` +
        (tokenConfigured
          ? ' Your token limit (5,000 requests/hour) was exhausted — wait for the reset.'
          : ' Unauthenticated requests are limited to 60/hour. Add MY_GITHUB_PAT to .env.local to raise this to 5,000/hour.'),
    }
  }

  if (e.status === 404) {
    if (!tokenConfigured) {
      return {
        ok: false,
        kind: 'auth_required',
        status: 404,
        message:
          'Repository not found. If it is public, check the owner/repo spelling. ' +
          'If it is private, no GitHub token is configured — add MY_GITHUB_PAT to .env.local and restart the dev server.',
      }
    }
    return {
      ok: false,
      kind: 'not_found',
      status: 404,
      message: 'Repository not found. Check the owner/repo spelling, or verify your token has access to it.',
    }
  }

  if (e.status === 401) {
    return {
      ok: false,
      kind: 'auth_required',
      status: 401,
      message: 'GitHub rejected the configured token (401 bad credentials). Check MY_GITHUB_PAT in .env.local.',
    }
  }

  if (e.status === 403) {
    return {
      ok: false,
      kind: 'auth_required',
      status: 403,
      message: 'GitHub denied access to this repository (403). Your token may lack the required scopes.',
    }
  }

  return {
    ok: false,
    kind: 'github_error',
    status: 502,
    message: `GitHub API request failed${e.status ? ` (HTTP ${e.status})` : ''}. Try again shortly.`,
  }
}

/**
 * Directories/files worth indexing when the full recursive tree is
 * unavailable (truncated or failed for a very large repository).
 */
export const IMPORTANT_PATHS = [
  'app', 'src', 'components', 'lib', 'pages', 'api', 'server', 'backend', 'tests', 'test',
] as const

export const IMPORTANT_FILES = [
  'package.json', 'README.md', 'readme.md', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml',
] as const

/**
 * Fallback for large repos: shallow root listing, then one level into the
 * directories that usually matter. Individual directory failures are
 * tolerated — a partial index beats a hard failure.
 */
async function buildPartialIndex(
  client: TreeClient,
  owner: string,
  repo: string,
  defaultBranch: string
): Promise<IndexSuccess | null> {
  let root: RawTreeEntry[]
  try {
    root = await client.getDirListing(owner, repo, '')
  } catch {
    return null
  }

  const entries = new Map<string, RawTreeEntry>(root.map((e) => [e.path, e]))
  const dirsToExpand = root.filter(
    (e) => e.type === 'tree' && (IMPORTANT_PATHS as readonly string[]).includes(e.path)
  )

  const listings = await Promise.all(
    dirsToExpand.map((dir) =>
      client.getDirListing(owner, repo, dir.path).catch(() => [] as RawTreeEntry[])
    )
  )
  for (const listing of listings) {
    for (const entry of listing) entries.set(entry.path, entry)
  }

  return {
    ok: true,
    defaultBranch,
    truncated: true,
    partial: true,
    entries: [...entries.values()],
  }
}

/**
 * Full indexing pipeline: validate input → repo metadata (existence, default
 * branch, auth) → recursive tree → partial-index fallback. Every failure mode
 * returns a typed, user-safe diagnosis instead of null.
 */
export async function fetchRepoTree(
  client: TreeClient,
  owner: string,
  repo: string,
  tokenConfigured: boolean
): Promise<RepoTreeOutcome> {
  const inputError = validateRepoInput(owner, repo)
  if (inputError) {
    return { ok: false, kind: 'invalid_input', status: 400, message: inputError }
  }

  let defaultBranch: string
  try {
    const meta = await client.getRepo(owner, repo)
    defaultBranch = meta.defaultBranch
  } catch (error) {
    return classifyGitHubError(error, tokenConfigured)
  }

  try {
    const tree = await client.getTree(owner, repo, defaultBranch)
    return {
      ok: true,
      defaultBranch,
      truncated: tree.truncated,
      partial: tree.truncated,
      entries: tree.entries,
    }
  } catch (error) {
    // Rate limits make further calls pointless; surface them immediately.
    const classified = classifyGitHubError(error, tokenConfigured)
    if (classified.kind === 'rate_limited' || classified.kind === 'auth_required') return classified

    // Tree too large / unusual structure → partial index of important paths.
    const partial = await buildPartialIndex(client, owner, repo, defaultBranch)
    return partial ?? classified
  }
}
