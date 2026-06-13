import { describe, expect, it, vi } from 'vitest'
import {
  classifyGitHubError,
  fetchRepoTree,
  validateRepoInput,
} from '@/lib/agent/repo-indexer'
import type { TreeClient } from '@/lib/agent/repo-indexer'
import type { RawTreeEntry } from '@/lib/agent/file-classifier'
import { buildCodebaseMap, indexFiles } from '@/lib/agent/file-classifier'

const ENTRIES: RawTreeEntry[] = [
  { path: 'app', type: 'tree' },
  { path: 'app/page.tsx', type: 'blob', size: 100 },
  { path: 'lib/service.ts', type: 'blob', size: 200 },
  { path: 'package.json', type: 'blob', size: 300 },
]

function clientWith(overrides: Partial<TreeClient> = {}): TreeClient {
  return {
    getRepo: async () => ({ defaultBranch: 'main' }),
    getTree: async () => ({ truncated: false, entries: ENTRIES }),
    getDirListing: async () => [],
    ...overrides,
  }
}

function githubError(status: number, message = '', headers: Record<string, string> = {}) {
  return Object.assign(new Error(message), { status, response: { headers } })
}

describe('validateRepoInput', () => {
  it('accepts normal owner/repo names', () => {
    expect(validateRepoInput('facebook', 'react')).toBeNull()
    expect(validateRepoInput('XiaomiMiMo', 'MiMo-Code')).toBeNull()
    expect(validateRepoInput('user-1', 'my.repo_name')).toBeNull()
  })

  it('rejects malformed input', () => {
    expect(validateRepoInput('', 'react')).toMatch(/owner\/repo/)
    expect(validateRepoInput('bad owner', 'react')).toMatch(/not a valid/)
    expect(validateRepoInput('a', 'repo with spaces')).toMatch(/not a valid/)
  })
})

describe('classifyGitHubError', () => {
  it('classifies 403 with exhausted quota as rate_limited with a clear message', () => {
    const result = classifyGitHubError(
      githubError(403, 'API rate limit exceeded for 1.2.3.4', { 'x-ratelimit-remaining': '0' }),
      false
    )
    expect(result.kind).toBe('rate_limited')
    expect(result.status).toBe(429)
    expect(result.message).toMatch(/rate limit/i)
    expect(result.message).toMatch(/MY_GITHUB_PAT/) // tells the user how to fix it
  })

  it('classifies 404 without a token as token-required (private repo case)', () => {
    const result = classifyGitHubError(githubError(404, 'Not Found'), false)
    expect(result.kind).toBe('auth_required')
    expect(result.message).toMatch(/private/i)
    expect(result.message).toMatch(/MY_GITHUB_PAT/)
  })

  it('classifies 404 with a token as repo-not-found', () => {
    const result = classifyGitHubError(githubError(404, 'Not Found'), true)
    expect(result.kind).toBe('not_found')
    expect(result.status).toBe(404)
    expect(result.message).toMatch(/not found/i)
  })

  it('classifies 401 as auth_required', () => {
    const result = classifyGitHubError(githubError(401, 'Bad credentials'), true)
    expect(result.kind).toBe('auth_required')
    expect(result.message).toMatch(/token/i)
  })

  it('falls back to github_error for anything else', () => {
    const result = classifyGitHubError(githubError(500, 'Server error'), false)
    expect(result.kind).toBe('github_error')
    expect(result.status).toBe(502)
  })

  it('never leaks raw error internals into the message', () => {
    const result = classifyGitHubError(githubError(500, 'token ghp_secret123 leaked in message'), false)
    expect(result.message).not.toContain('ghp_secret123')
  })
})

describe('fetchRepoTree', () => {
  it('indexes a valid public repo successfully', async () => {
    const outcome = await fetchRepoTree(clientWith(), 'facebook', 'react', false)
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.defaultBranch).toBe('main')
      expect(outcome.partial).toBe(false)
      expect(outcome.entries).toHaveLength(4)
    }
  })

  it('rejects invalid input before any API call', async () => {
    const getRepo = vi.fn()
    const outcome = await fetchRepoTree(clientWith({ getRepo }), 'bad owner', 'react', false)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.kind).toBe('invalid_input')
    expect(getRepo).not.toHaveBeenCalled()
  })

  it('surfaces rate limits from metadata fetch without further calls', async () => {
    const getTree = vi.fn()
    const outcome = await fetchRepoTree(
      clientWith({
        getRepo: async () => {
          throw githubError(403, 'rate limit exceeded', { 'x-ratelimit-remaining': '0' })
        },
        getTree,
      }),
      'facebook',
      'react',
      false
    )
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.kind).toBe('rate_limited')
    expect(getTree).not.toHaveBeenCalled()
  })

  it('returns not-found/token-required for 404s', async () => {
    const notFound = clientWith({
      getRepo: async () => {
        throw githubError(404, 'Not Found')
      },
    })
    const noToken = await fetchRepoTree(notFound, 'nobody', 'ghost-repo', false)
    expect(!noToken.ok && noToken.kind).toBe('auth_required')

    const withToken = await fetchRepoTree(notFound, 'nobody', 'ghost-repo', true)
    expect(!withToken.ok && withToken.kind).toBe('not_found')
  })

  it('marks a truncated recursive tree as a partial index instead of failing', async () => {
    const outcome = await fetchRepoTree(
      clientWith({ getTree: async () => ({ truncated: true, entries: ENTRIES }) }),
      'big',
      'monorepo',
      false
    )
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.truncated).toBe(true)
      expect(outcome.partial).toBe(true)
      expect(outcome.entries.length).toBeGreaterThan(0)
    }
  })

  it('falls back to indexing important directories when the tree fetch fails', async () => {
    const outcome = await fetchRepoTree(
      clientWith({
        getTree: async () => {
          throw githubError(422, 'tree too large')
        },
        getDirListing: async (_o, _r, path) => {
          if (path === '') {
            return [
              { path: 'app', type: 'tree' },
              { path: 'docs-assets', type: 'tree' }, // not an important dir — not expanded
              { path: 'package.json', type: 'blob', size: 10 },
              { path: 'README.md', type: 'blob', size: 10 },
            ]
          }
          if (path === 'app') return [{ path: 'app/page.tsx', type: 'blob', size: 10 }]
          throw new Error(`unexpected listing for ${path}`)
        },
      }),
      'big',
      'monorepo',
      false
    )
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.partial).toBe(true)
      const paths = outcome.entries.map((e) => e.path)
      expect(paths).toContain('package.json')
      expect(paths).toContain('app/page.tsx')
    }
  })

  it('does not attempt the fallback when the tree fetch was rate limited', async () => {
    const getDirListing = vi.fn()
    const outcome = await fetchRepoTree(
      clientWith({
        getTree: async () => {
          throw githubError(403, 'rate limit', { 'x-ratelimit-remaining': '0' })
        },
        getDirListing,
      }),
      'facebook',
      'react',
      false
    )
    expect(!outcome.ok && outcome.kind).toBe('rate_limited')
    expect(getDirListing).not.toHaveBeenCalled()
  })

  it('tolerates individual directory failures during fallback', async () => {
    const outcome = await fetchRepoTree(
      clientWith({
        getTree: async () => {
          throw githubError(422, 'too large')
        },
        getDirListing: async (_o, _r, path) => {
          if (path === '') {
            return [
              { path: 'app', type: 'tree' },
              { path: 'src', type: 'tree' },
              { path: 'go.mod', type: 'blob', size: 5 },
            ]
          }
          if (path === 'app') throw githubError(500, 'flaky')
          return [{ path: 'src/main.go', type: 'blob', size: 5 }]
        },
      }),
      'big',
      'gorepo',
      false
    )
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      const paths = outcome.entries.map((e) => e.path)
      expect(paths).toContain('src/main.go')
      expect(paths).toContain('go.mod')
    }
  })
})

describe('binary and oversized handling in the index', () => {
  it('skips binary files and counts them in filesSkipped', () => {
    const entries: RawTreeEntry[] = [
      { path: 'app/page.tsx', type: 'blob', size: 100 },
      { path: 'public/logo.png', type: 'blob', size: 5000 },
      { path: 'fonts/font.woff2', type: 'blob', size: 9000 },
      { path: 'node_modules/x/index.js', type: 'blob', size: 10 },
    ]
    const files = indexFiles(entries)
    expect(files.map((f) => f.path)).toEqual(['app/page.tsx'])

    const map = buildCodebaseMap('a/b', 'main', entries, false)
    expect(map.files).toHaveLength(1)
    expect(map.filesSkipped).toBe(3)
    expect(map.partial).toBe(false)
  })

  it('propagates partial/truncated flags into the map', () => {
    const map = buildCodebaseMap('a/b', 'main', ENTRIES, true, true)
    expect(map.truncated).toBe(true)
    expect(map.partial).toBe(true)
  })
})
