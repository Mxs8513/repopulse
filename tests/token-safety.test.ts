// The GitHub token must never appear in logs — not even a partial prefix.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getGithubToken } from '@/lib/getGithubToken'
import { isGithubTokenConfigured } from '@/lib/github-service'

const FAKE_TOKEN = 'ghp_THISVALUEMUSTNEVERBELOGGED1234567890'

describe('token safety', () => {
  const captured: string[] = []
  const spies: Array<ReturnType<typeof vi.spyOn>> = []

  beforeEach(() => {
    captured.length = 0
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      spies.push(
        vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
          captured.push(args.map(String).join(' '))
        })
      )
    }
    process.env.MY_GITHUB_PAT = FAKE_TOKEN
  })

  afterEach(() => {
    for (const spy of spies) spy.mockRestore()
    spies.length = 0
    delete process.env.MY_GITHUB_PAT
  })

  it('getGithubToken returns the token without logging its value or any prefix of it', () => {
    expect(getGithubToken()).toBe(FAKE_TOKEN)

    const allOutput = captured.join('\n')
    expect(allOutput).not.toContain(FAKE_TOKEN)
    expect(allOutput).not.toContain(FAKE_TOKEN.slice(0, 10)) // no partial leaks either
  })

  it('isGithubTokenConfigured reports presence without touching the value in logs', () => {
    expect(isGithubTokenConfigured()).toBe(true)
    delete process.env.MY_GITHUB_PAT
    expect(isGithubTokenConfigured()).toBe(false)
    expect(captured.join('\n')).not.toContain(FAKE_TOKEN)
  })
})
