// /api/health must expose status booleans and public model names only —
// never a key, a key prefix, or any env value.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const FAKE_PAT = 'github_pat_FAKEVALUE0000000000000000'
const FAKE_OPENAI = 'sk-proj-FAKEVALUE00000000000000000'

describe('/api/health', () => {
  beforeEach(() => {
    vi.stubEnv('MY_GITHUB_PAT', FAKE_PAT)
    vi.stubEnv('OPENAI_API_KEY', FAKE_OPENAI)
    vi.stubEnv('AI_PROVIDER', 'openai')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reports provider, model, and config booleans without any secret material', async () => {
    const { GET } = await import('@/app/api/health/route')
    const res = await GET()
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(body.aiProvider).toBe('openai')
    expect(body.mockMode).toBe(false)
    expect(body.activeModel).toBe('gpt-4o-mini')
    expect(typeof body.githubTokenConfigured).toBe('boolean')
    expect(typeof body.openaiConfigured).toBe('boolean')
    expect(typeof body.costGuardEnabled).toBe('boolean')
    expect(typeof body.sandboxEnabled).toBe('boolean')
    expect(body.githubTokenConfigured).toBe(true)
    expect(body.openaiConfigured).toBe(true)
    expect(body.costGuardEnabled).toBe(true)

    // No secret or partial secret anywhere in the payload.
    const raw = JSON.stringify(body)
    expect(raw).not.toContain(FAKE_PAT)
    expect(raw).not.toContain(FAKE_OPENAI)
    expect(raw).not.toContain(FAKE_PAT.slice(0, 12))
    expect(raw).not.toContain(FAKE_OPENAI.slice(0, 12))
  })
})
