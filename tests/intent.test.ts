import { describe, expect, it } from 'vitest'
import { classifyQuestionIntent, extractKeywords } from '@/lib/agent/intent'

describe('classifyQuestionIntent', () => {
  it('routes file location questions', () => {
    expect(classifyQuestionIntent('Where is GitHub API data fetched?')).toBe('file_location_question')
    expect(classifyQuestionIntent('Which files control the dashboard charts?')).toBe('file_location_question')
  })

  it('routes architecture questions', () => {
    expect(classifyQuestionIntent('How is this project structured?')).toBe('architecture_question')
    expect(classifyQuestionIntent('Which routes are API routes?')).toBe('architecture_question')
  })

  it('routes test coverage questions', () => {
    expect(classifyQuestionIntent('What tests exist?')).toBe('test_coverage_question')
    expect(classifyQuestionIntent('Are there any tests for the API?')).toBe('test_coverage_question')
  })

  it('routes change impact questions', () => {
    expect(classifyQuestionIntent('What files would likely change if I add PR analytics?')).toBe('change_impact_question')
    expect(classifyQuestionIntent('Where would I add caching?')).toBe('change_impact_question')
  })

  it('routes configuration questions', () => {
    expect(classifyQuestionIntent('Where is environment variable handling done?')).toBe('configuration_question')
  })

  it('routes dependency questions', () => {
    expect(classifyQuestionIntent('What packages are installed?')).toBe('dependency_question')
  })

  it('falls back to unknown for unrelated questions', () => {
    expect(classifyQuestionIntent('hello there')).toBe('unknown_repo_question')
    expect(classifyQuestionIntent('')).toBe('unknown_repo_question')
  })
})

describe('extractKeywords', () => {
  it('drops stop words and short tokens', () => {
    const kws = extractKeywords('Where is the GitHub API data fetched?')
    expect(kws).toContain('github')
    expect(kws).toContain('api')
    expect(kws).not.toContain('the')
    expect(kws).not.toContain('is')
  })

  it('splits camelCase and kebab-case', () => {
    expect(extractKeywords('githubService caching')).toEqual(expect.arrayContaining(['github', 'service', 'caching']))
    expect(extractKeywords('lib/github-service.ts')).toEqual(expect.arrayContaining(['github', 'service']))
  })

  it('dedupes keywords', () => {
    const kws = extractKeywords('cache cache caching cache')
    expect(kws.filter((k) => k === 'cache')).toHaveLength(1)
  })
})
