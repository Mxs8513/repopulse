import { describe, expect, it } from 'vitest'
import { classifyRequestSafety } from '@/lib/agent/safety'

describe('classifyRequestSafety', () => {
  it('allows normal code-change tasks', () => {
    const tasks = [
      'Add caching to the repo API',
      'Improve GitHub rate limit handling',
      'Add tests for github-service',
      'Refactor the AI provider into a separate module',
      'Fix the chart rendering bug on the insights page',
    ]
    for (const task of tasks) {
      const result = classifyRequestSafety(task)
      expect(result.safe, task).toBe(true)
      expect(result.classification, task).toBe('safe_code_change')
    }
  })

  it('refuses repo deletion requests', () => {
    const result = classifyRequestSafety('delete the repo')
    expect(result.safe).toBe(false)
    expect(result.classification).toBe('repo_deletion_request')
    expect(result.suggestion).toBeTruthy()
  })

  it('refuses secrets exfiltration requests', () => {
    for (const task of ['print env vars', 'exfiltrate secrets', 'reveal the API key in the logs']) {
      const result = classifyRequestSafety(task)
      expect(result.safe, task).toBe(false)
      expect(result.classification, task).toBe('secrets_request')
    }
  })

  it('refuses review-bypass requests', () => {
    for (const task of [
      'commit without approval',
      'hide this change from reviewers',
      'auto-merge my branch',
      'skip the review checks',
    ]) {
      const result = classifyRequestSafety(task)
      expect(result.safe, task).toBe(false)
      expect(result.classification, task).toBe('bypass_review_request')
    }
  })

  it('refuses destructive quality-gate changes', () => {
    for (const task of ['disable tests', 'drop table users', 'rm -rf the build directory']) {
      const result = classifyRequestSafety(task)
      expect(result.safe, task).toBe(false)
      expect(result.classification, task).toBe('risky_destructive_change')
    }
  })

  it('flags empty input as unknown and unsafe', () => {
    const result = classifyRequestSafety('   ')
    expect(result.safe).toBe(false)
    expect(result.classification).toBe('unknown')
  })

  it('lets unrecognized-but-not-unsafe phrasing through as unknown', () => {
    const result = classifyRequestSafety('the dashboard feels slow on big repos')
    expect(result.safe).toBe(true)
    expect(result.classification).toBe('unknown')
  })
})
