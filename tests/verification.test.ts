import { describe, expect, it } from 'vitest'
import { buildVerificationPlan, detectRepoType } from '@/lib/agent/verification'

describe('detectRepoType', () => {
  it('detects Next.js from dependencies', () => {
    expect(
      detectRepoType({ packageJson: { dependencies: { next: '^16.0.0' } }, topLevelFiles: ['package.json'] })
    ).toBe('Next.js')
  })

  it('detects Python from pyproject', () => {
    expect(detectRepoType({ topLevelFiles: ['pyproject.toml'] })).toBe('Python')
  })

  it('detects Go and Rust', () => {
    expect(detectRepoType({ topLevelFiles: ['go.mod'] })).toBe('Go')
    expect(detectRepoType({ topLevelFiles: ['Cargo.toml'] })).toBe('Rust')
  })

  it('falls back to Unknown', () => {
    expect(detectRepoType({ topLevelFiles: ['weird.bin'] })).toBe('Unknown')
  })
})

describe('buildVerificationPlan', () => {
  it('recommends build/test/lint based on real package.json scripts', () => {
    const plan = buildVerificationPlan({
      packageJson: {
        scripts: { build: 'next build', lint: 'eslint .' },
        dependencies: { next: '^16.0.0' },
      },
      topLevelFiles: ['package.json'],
    })
    expect(plan.repoType).toBe('Next.js')

    const byCommand = Object.fromEntries(plan.commands.map((c) => [c.command, c]))
    expect(byCommand['npm install'].exists).toBe(true)
    expect(byCommand['npm run build'].exists).toBe(true)
    expect(byCommand['npm run lint'].exists).toBe(true)
    // No test script → recommended but flagged as missing
    expect(byCommand['npm run test'].exists).toBe(false)
    expect(plan.notes.join(' ')).toMatch(/test/i)
  })

  it('uses the repository package manager for verification commands', () => {
    const plan = buildVerificationPlan({
      packageJson: {
        packageManager: 'pnpm@8.0.0',
        scripts: { build: 'next build', lint: 'eslint .' },
        dependencies: { next: '^16.0.0' },
      },
      topLevelFiles: ['package.json'],
    })

    const byCommand = Object.fromEntries(plan.commands.map((c) => [c.command, c]))
    expect(byCommand['pnpm install']).toBeDefined()
    expect(byCommand['pnpm run build']).toBeDefined()
    expect(byCommand['pnpm run lint']).toBeDefined()
  })

  it('recommends pytest and ruff for Python repos', () => {
    const plan = buildVerificationPlan({ topLevelFiles: ['pyproject.toml', 'requirements.txt'] })
    const commands = plan.commands.map((c) => c.command)
    expect(commands).toContain('pytest')
    expect(commands).toContain('ruff check .')
  })

  it('never includes execution — only manual instructions', () => {
    const plan = buildVerificationPlan({ topLevelFiles: ['package.json'], packageJson: { scripts: {} } })
    expect(plan.manualInstructions.join(' ')).toMatch(/does not execute/i)
  })
})
