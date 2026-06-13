import { describe, expect, it } from 'vitest'
import {
  buildArchitectureSummary,
  buildCodebaseMap,
  classifyFile,
  countCategories,
  detectFrameworks,
  detectLanguage,
  indexFiles,
  isBinaryPath,
} from '@/lib/agent/file-classifier'

describe('classifyFile', () => {
  it('classifies Next.js app router pages', () => {
    expect(classifyFile('app/page.tsx')).toBe('frontend_page')
    expect(classifyFile('app/analysis/page.tsx')).toBe('frontend_page')
    expect(classifyFile('app/layout.tsx')).toBe('frontend_page')
  })

  it('classifies API routes ahead of pages', () => {
    expect(classifyFile('app/api/repo/route.ts')).toBe('backend_api')
    expect(classifyFile('pages/api/user.ts')).toBe('backend_api')
    expect(classifyFile('src/controllers/auth.go')).toBe('backend_api')
  })

  it('classifies components and hooks', () => {
    expect(classifyFile('components/dashboard/quick-stats.tsx')).toBe('frontend_component')
    expect(classifyFile('hooks/use-repo-data.ts')).toBe('frontend_component')
  })

  it('classifies services and libs', () => {
    expect(classifyFile('lib/github-service.ts')).toBe('service_or_lib')
    expect(classifyFile('src/utils/format.py')).toBe('service_or_lib')
  })

  it('classifies tests with priority over other categories', () => {
    expect(classifyFile('lib/__tests__/github-service.test.ts')).toBe('test')
    expect(classifyFile('tests/file-classifier.test.ts')).toBe('test')
    expect(classifyFile('pkg/server_test.go')).toBe('test')
    expect(classifyFile('app/api/repo/route.spec.ts')).toBe('test')
  })

  it('classifies config files', () => {
    expect(classifyFile('package.json')).toBe('config')
    expect(classifyFile('tsconfig.json')).toBe('config')
    expect(classifyFile('next.config.mjs')).toBe('config')
    expect(classifyFile('.env.example')).toBe('config')
  })

  it('classifies CI/CD and Docker', () => {
    expect(classifyFile('.github/workflows/ci.yml')).toBe('ci_cd')
    expect(classifyFile('Dockerfile')).toBe('ci_cd')
    expect(classifyFile('docker-compose.yml')).toBe('ci_cd')
    expect(classifyFile('vercel.json')).toBe('ci_cd')
  })

  it('classifies documentation', () => {
    expect(classifyFile('README.md')).toBe('documentation')
    expect(classifyFile('docs/setup.md')).toBe('documentation')
  })

  it('classifies database/model files', () => {
    expect(classifyFile('prisma/schema.prisma')).toBe('database_model')
    expect(classifyFile('migrations/001_init.sql')).toBe('database_model')
  })

  it('falls back to unknown', () => {
    expect(classifyFile('random.xyz')).toBe('unknown')
  })
})

describe('detectLanguage / isBinaryPath', () => {
  it('detects languages from extensions', () => {
    expect(detectLanguage('lib/a.ts')).toBe('TypeScript')
    expect(detectLanguage('main.py')).toBe('Python')
    expect(detectLanguage('noext')).toBeNull()
  })

  it('flags binary paths', () => {
    expect(isBinaryPath('public/logo.png')).toBe(true)
    expect(isBinaryPath('fonts/Rebels-Fett.woff2')).toBe(true)
    expect(isBinaryPath('lib/github-service.ts')).toBe(false)
  })
})

describe('indexFiles', () => {
  it('keeps only blobs and drops node_modules', () => {
    const files = indexFiles([
      { path: 'app', type: 'tree' },
      { path: 'app/page.tsx', type: 'blob', size: 100 },
      { path: 'node_modules/react/index.js', type: 'blob', size: 5 },
    ])
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('app/page.tsx')
    expect(files[0].category).toBe('frontend_page')
  })
})

describe('architecture summary', () => {
  const entries = [
    { path: 'app/page.tsx', type: 'blob' as const, size: 10 },
    { path: 'app/layout.tsx', type: 'blob' as const, size: 10 },
    { path: 'app/api/repo/route.ts', type: 'blob' as const, size: 10 },
    { path: 'components/ui/button.tsx', type: 'blob' as const, size: 10 },
    { path: 'lib/github-service.ts', type: 'blob' as const, size: 10 },
    { path: 'package.json', type: 'blob' as const, size: 10 },
    { path: 'README.md', type: 'blob' as const, size: 10 },
  ]

  it('detects Next.js App Router and entrypoints', () => {
    const files = indexFiles(entries)
    const frameworks = detectFrameworks(files)
    expect(frameworks).toContain('Next.js (App Router)')
    expect(frameworks).not.toContain('React') // implied by Next.js

    const summary = buildArchitectureSummary('a/b', files)
    expect(summary.entrypoints).toContain('app/page.tsx')
    expect(summary.apiRoutes).toContain('app/api/repo/route.ts')
    expect(summary.text).toContain('Next.js')
    expect(summary.text).toContain('No test files were detected')
  })

  it('builds a complete codebase map with category counts', () => {
    const map = buildCodebaseMap('a/b', 'main', entries, false)
    expect(map.repo).toBe('a/b')
    expect(map.defaultBranch).toBe('main')
    expect(map.files).toHaveLength(7)
    const counts = countCategories(map.files)
    expect(counts.backend_api).toBe(1)
    expect(counts.frontend_page).toBe(2)
    expect(counts.config).toBe(1)
    expect(counts.documentation).toBe(1)
  })
})
