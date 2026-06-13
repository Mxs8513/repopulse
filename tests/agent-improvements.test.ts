import { describe, it, expect } from 'vitest'
import { classifyTask } from '../lib/agent/task-classifier'
import {
  detectPackageManager,
  detectPackageManagerFromFiles,
  detectFromPackageManagerField,
  detectWorkspaceTool,
  inferPackagePath,
  extractScripts,
} from '../lib/agent/package-manager'

describe('Task Classifier', () => {
  it('classifies bug fix tasks', () => {
    const result = classifyTask('Fix bug in the handleClick function')
    expect(result.type).toBe('bug_fix')
    expect(result.detectedKeywords).toContain('fix')
    expect(result.riskLevel).toMatch(/low|medium/)
  })

  it('classifies test addition tasks', () => {
    const result = classifyTask('Add a unit test for the getUserData function')
    expect(result.type).toBe('test_addition')
  })

  it('classifies UI change tasks', () => {
    const result = classifyTask('Update the Button component styles with Tailwind')
    expect(result.type).toBe('ui_change')
  })

  it('classifies refactor tasks', () => {
    const result = classifyTask('Refactor the authentication to use hooks')
    expect(result.type).toMatch(/refactor|backend_change/)
  })

  it('detects test_only constraint', () => {
    const result = classifyTask('Add test only for the login form behavior')
    expect(result.constraints).toContain('test_only')
  })

  it('extracts target file path', () => {
    const result = classifyTask('Fix the bug in `src/utils/helpers.ts`')
    expect(result.targetFile).toBe('src/utils/helpers.ts')
  })

  it('flags low-clarity tasks', () => {
    const result = classifyTask('do something with the thing')
    expect(result.clarityScore).toBeLessThanOrEqual(70)
  })

  it('detects high-risk keywords', () => {
    const result = classifyTask('migrate database schema to support new auth')
    expect(result.riskLevel).toBe('high')
  })
})

describe('Package Manager Detection', () => {
  it('detects pnpm from pnpm-lock.yaml', () => {
    const files = ['package.json', 'pnpm-lock.yaml']
    const result = detectPackageManagerFromFiles(files)
    expect(result).toBe('pnpm')
  })

  it('detects yarn from yarn.lock', () => {
    const files = ['package.json', 'yarn.lock']
    const result = detectPackageManagerFromFiles(files)
    expect(result).toBe('yarn')
  })

  it('detects npm from package-lock.json', () => {
    const files = ['package.json', 'package-lock.json']
    const result = detectPackageManagerFromFiles(files)
    expect(result).toBe('npm')
  })

  it('defaults to npm when no lock file', () => {
    const files = ['package.json']
    const result = detectPackageManagerFromFiles(files)
    expect(result).toBe('npm')
  })

  it('detects turbo workspace', () => {
    const files = ['turbo.json', 'package.json']
    const result = detectWorkspaceTool(files)
    expect(result).toBe('turbo')
  })

  it('detects nx workspace', () => {
    const files = ['nx.json', 'package.json']
    const result = detectWorkspaceTool(files)
    expect(result).toBe('nx')
  })

  it('extracts scripts from package.json', () => {
    const pkg = {
      scripts: {
        build: 'tsc && next build',
        test: 'vitest',
        lint: 'eslint .',
      },
    }
    const result = extractScripts(pkg)
    expect(result.build).toBe('tsc && next build')
    expect(result.test).toBe('vitest')
    expect(result.lint).toBe('eslint .')
  })

  it('infers package path in monorepo', () => {
    const path = 'packages/ui/src/Button.tsx'
    const result = inferPackagePath(path, 'turbo')
    expect(result).toBe('packages/ui')
  })

  it('detects packageManager field', () => {
    const pkg = { packageManager: 'pnpm@8.0.0' }
    const result = detectPackageManager(['package.json'], pkg as any)
    expect(result.manager).toBe('pnpm')
    expect(result.detectionMethod).toBe('package-manager-field')
    expect(result.packageManagerVersion).toBe('8.0.0')
  })

  it('rejects invalid packageManager field syntax safely', () => {
    const field = detectFromPackageManagerField({ packageManager: 'pnpm@8.0.0 && rm -rf /' })
    expect(field).toBeUndefined()
  })

  it('handles packageManager field without unsafe shell injection', () => {
    const field = detectFromPackageManagerField({ packageManager: 'yarn@4.0.0' })
    expect(field).toEqual({ manager: 'yarn', version: '4.0.0', raw: 'yarn@4.0.0' })
  })
})
