// Analysis/Insights must use the shared provider chain (openai first when
// keyed), never the old Groq-only client, and must cache repeated analyses.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateRepoAnalytics, analyzeTrends } from '@/lib/ai-service'
import { resolveProviderName } from '@/lib/ai/provider'
import type { CommitData } from '@/lib/github-service'

function commit(sha: string, message: string): CommitData {
  return {
    sha,
    message,
    author: { name: 'dev', email: 'dev@example.com', avatar: '' },
    date: '2026-06-12T00:00:00Z',
    stats: { additions: 10, deletions: 2, total: 12 },
    files: [],
  }
}

const COMMITS = [commit('abc1234', 'feat: add dashboard'), commit('def5678', 'fix: rate limit handling')]

function mockOpenAIFetch() {
  return vi.fn(async (url: any) => {
    expect(String(url)).toContain('api.openai.com')
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"insights": ["i1", "i2", "i3", "i4"]}' } }],
      }),
    } as any
  })
}

describe('repository analytics on the provider chain', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-not-real')
    vi.stubEnv('GROQ_API_KEY', '')
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('AI_PROVIDER', 'openai')
    // Isolate from the real .ai-usage.json: lift both the monthly budget and
    // the daily call limit so accumulated demo usage can't trip the budget gate
    // (which would otherwise fall back to mock and skip the OpenAI fetch).
    vi.stubEnv('AI_MONTHLY_BUDGET_USD', '9999')
    vi.stubEnv('AI_DAILY_CALL_LIMIT', '1000000')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('selects openai when AI_PROVIDER=openai, with no Groq key needed', () => {
    expect(resolveProviderName()).toBe('openai')
  })

  it('generates analysis via OpenAI and reports provider/model metadata', async () => {
    const fetchMock = mockOpenAIFetch()
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateRepoAnalytics('owner/analysis-repo', COMMITS)

    expect(fetchMock).toHaveBeenCalled() // hit OpenAI, not Groq SDK
    expect(result.meta.provider).toBe('openai')
    expect(result.meta.model).toBe('gpt-4o-mini')
    expect(result.meta.unavailableReason).toBeUndefined()
    expect(result.summary.length).toBeGreaterThan(0)
    expect(result.insights.length).toBeGreaterThan(0)
    expect(result.trends.length).toBeGreaterThan(0)
  })

  it('serves a repeated analysis of the same snapshot from cache without a second model call', async () => {
    const fetchMock = mockOpenAIFetch()
    vi.stubGlobal('fetch', fetchMock)

    const first = await generateRepoAnalytics('owner/cache-repo', COMMITS)
    const callsAfterFirst = fetchMock.mock.calls.length
    expect(first.meta.cached).toBe(false)

    const second = await generateRepoAnalytics('owner/cache-repo', COMMITS)
    expect(second.meta.cached).toBe(true)
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst) // no new API calls
    expect(second.summary).toBe(first.summary)
    expect(second.insights).toEqual(first.insights)
  })

  it('a new head commit (new snapshot) busts the cache', async () => {
    const fetchMock = mockOpenAIFetch()
    vi.stubGlobal('fetch', fetchMock)

    await generateRepoAnalytics('owner/snapshot-repo', COMMITS)
    const callsAfterFirst = fetchMock.mock.calls.length
    const newHead = [commit('zzz9999', 'feat: brand new work'), ...COMMITS]
    const result = await generateRepoAnalytics('owner/snapshot-repo', newHead)
    expect(result.meta.cached).toBe(false)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst)
  })

  it('explains exactly why output is mock when no key is configured', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('AI_PROVIDER', '')
    const result = await generateRepoAnalytics('owner/no-key-repo', COMMITS)
    expect(result.meta.provider).toBe('mock')
    expect(result.meta.unavailableReason).toMatch(/OPENAI_API_KEY/)
  })
})

describe('analyzeTrends (deterministic, no AI)', () => {
  it('classifies fix-dominant activity', () => {
    const commits = [commit('1', 'fix: a'), commit('2', 'fix: b'), commit('3', 'feat: c')]
    expect(analyzeTrends(commits)).toMatch(/bug fixes/i)
  })
})
