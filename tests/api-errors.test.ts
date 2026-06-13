import { describe, expect, it } from 'vitest'
import { classifyFetchFailure, describeHttpFailure } from '@/lib/client/api-errors'
import { statusAfterDiffFailure } from '@/lib/agent/run-store'
import type { ChangePlan } from '@/lib/agent/types'

describe('classifyFetchFailure', () => {
  it('turns the browser "Failed to fetch" into a route-named, actionable message', () => {
    const result = classifyFetchFailure('/api/diff', new TypeError('Failed to fetch'))
    expect(result.route).toBe('/api/diff')
    expect(result.status).toBeNull()
    expect(result.message).toContain('/api/diff')
    expect(result.message).toMatch(/never reached the server/i)
    expect(result.message).toMatch(/retry/i)
    expect(result.message).not.toBe('Failed to fetch')
  })

  it('classifies aborted requests', () => {
    const result = classifyFetchFailure('/api/plan', new DOMException('The user aborted a request.', 'AbortError'))
    expect(result.message).toMatch(/cancelled/i)
    expect(result.message).toContain('/api/plan')
  })

  it('passes through unknown errors with the route name', () => {
    const result = classifyFetchFailure('/api/ask', new Error('something odd'))
    expect(result.message).toContain('/api/ask')
    expect(result.message).toContain('something odd')
  })
})

describe('describeHttpFailure', () => {
  it('includes route, status, and the server error', () => {
    const result = describeHttpFailure('/api/codebase-map', 429, 'GitHub API rate limit exceeded. Limit resets in about 5 minutes.')
    expect(result.status).toBe(429)
    expect(result.message).toContain('/api/codebase-map')
    expect(result.message).toContain('429')
    expect(result.message).toMatch(/rate limit/i)
  })

  it('provides a safe default reason when the server sent none', () => {
    const result = describeHttpFailure('/api/diff', 500, null)
    expect(result.message).toContain('HTTP 500')
    expect(result.message).toMatch(/internal error/i)
    expect(result.message).toMatch(/retry/i)
  })
})

describe('statusAfterDiffFailure', () => {
  const plan = { taskSummary: 't' } as ChangePlan

  it('keeps a run with a successful plan in planned (retryable), not failed', () => {
    expect(statusAfterDiffFailure({ plan })).toBe('planned')
  })

  it('marks runs without any plan as failed', () => {
    expect(statusAfterDiffFailure({ plan: null })).toBe('failed')
  })
})
