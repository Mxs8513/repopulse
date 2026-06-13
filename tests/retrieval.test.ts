import { describe, expect, it } from 'vitest'
import { retrieveRelevantFiles, selectAffectedFiles } from '@/lib/agent/retrieval'
import { indexFiles } from '@/lib/agent/file-classifier'

const files = indexFiles([
  { path: 'app/page.tsx', type: 'blob', size: 10 },
  { path: 'app/api/repo/route.ts', type: 'blob', size: 10 },
  { path: 'lib/github-service.ts', type: 'blob', size: 10 },
  { path: 'lib/ai-service.ts', type: 'blob', size: 10 },
  { path: 'lib/getGithubToken.ts', type: 'blob', size: 10 },
  { path: 'components/dashboard/performance-chart.tsx', type: 'blob', size: 10 },
  { path: 'hooks/use-repo-data.ts', type: 'blob', size: 10 },
  { path: 'tests/safety.test.ts', type: 'blob', size: 10 },
  { path: 'package.json', type: 'blob', size: 10 },
  { path: 'README.md', type: 'blob', size: 10 },
])

describe('retrieveRelevantFiles', () => {
  it('finds the GitHub service for API-fetch questions', () => {
    const results = retrieveRelevantFiles('Where is GitHub API data fetched?', files, {
      intent: 'file_location_question',
    })
    expect(results.length).toBeGreaterThan(0)
    expect(results.map((r) => r.path)).toContain('lib/github-service.ts')
  })

  it('finds AI service for AI questions', () => {
    const results = retrieveRelevantFiles('Where is AI analysis implemented?', files, {
      intent: 'feature_implementation_question',
    })
    expect(results[0].path).toBe('lib/ai-service.ts')
  })

  it('finds chart components for chart questions', () => {
    const results = retrieveRelevantFiles('Which files control the dashboard charts?', files, {
      intent: 'file_location_question',
    })
    expect(results.map((r) => r.path)).toContain('components/dashboard/performance-chart.tsx')
  })

  it('surfaces test files for test-coverage intent even without keyword overlap', () => {
    const results = retrieveRelevantFiles('What coverage do we have?', files, {
      intent: 'test_coverage_question',
    })
    expect(results.map((r) => r.path)).toContain('tests/safety.test.ts')
  })

  it('returns empty for completely unrelated queries', () => {
    const results = retrieveRelevantFiles('quantum blockchain pizza', files, {
      intent: 'unknown_repo_question',
    })
    expect(results).toHaveLength(0)
  })

  it('never cites files that are not in the index', () => {
    const results = retrieveRelevantFiles('Where is GitHub API data fetched?', files)
    const indexed = new Set(files.map((f) => f.path))
    for (const r of results) {
      expect(indexed.has(r.path)).toBe(true)
    }
  })

  it('respects the limit option', () => {
    const results = retrieveRelevantFiles('github repo api service data', files, { limit: 2 })
    expect(results.length).toBeLessThanOrEqual(2)
  })
})

describe('selectAffectedFiles', () => {
  it('biases toward source files for change tasks', () => {
    const results = selectAffectedFiles('Add caching to the repo API', files)
    const paths = results.map((r) => r.path)
    expect(paths).toContain('app/api/repo/route.ts')
    expect(paths).not.toContain('README.md')
  })
})
