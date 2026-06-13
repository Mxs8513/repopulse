// Verification planning. Recommends build/test/lint commands based on what
// actually exists in the repository (package.json scripts, pyproject, Makefile).
// This module only RECOMMENDS commands — it never executes anything. Sandboxed
// execution is a deliberate later step (see README, Phase 8).

import { detectPackageManager, getInstallCommand, getRunCommand } from './package-manager'
import type { VerificationCommand, VerificationPlan } from './types'

export interface RepoManifest {
  /** Parsed package.json, when present. */
  packageJson?: {
    packageManager?: string
    scripts?: Record<string, string>
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  } | null
  /** Top-level file paths in the repo. */
  topLevelFiles: string[]
}

export function detectRepoType(manifest: RepoManifest): string {
  const files = new Set(manifest.topLevelFiles)
  if (manifest.packageJson) {
    const deps = {
      ...manifest.packageJson.dependencies,
      ...manifest.packageJson.devDependencies,
    }
    if (deps['next']) return 'Next.js'
    if (deps['react']) return 'React'
    if (deps['vue']) return 'Vue'
    if (deps['svelte']) return 'Svelte'
    return 'Node.js'
  }
  if (files.has('pyproject.toml') || files.has('requirements.txt') || files.has('setup.py')) return 'Python'
  if (files.has('go.mod')) return 'Go'
  if (files.has('Cargo.toml')) return 'Rust'
  if (files.has('Makefile')) return 'Make-based'
  return 'Unknown'
}

export function buildVerificationPlan(manifest: RepoManifest): VerificationPlan {
  const repoType = detectRepoType(manifest)
  const commands: VerificationCommand[] = []
  const notes: string[] = []
  const files = new Set(manifest.topLevelFiles)
  const scripts = manifest.packageJson?.scripts || {}

  const packageManager = detectPackageManager(manifest.topLevelFiles, manifest.packageJson ?? undefined)

  if (manifest.packageJson) {
    commands.push({
      command: getInstallCommand(packageManager.manager),
      purpose: 'Install dependencies before any other check',
      exists: true,
      source: 'package.json',
    })
    if (scripts['build']) {
      commands.push({
        command: getRunCommand(packageManager.manager, 'build'),
        purpose: 'Compile/bundle the project; catches type and build errors',
        exists: true,
        source: `package.json scripts.build: "${scripts['build']}"`,
      })
    }
    if (scripts['test']) {
      commands.push({
        command: getRunCommand(packageManager.manager, 'test'),
        purpose: 'Run the automated test suite',
        exists: true,
        source: `package.json scripts.test: "${scripts['test']}"`,
      })
    } else {
      commands.push({
        command: getRunCommand(packageManager.manager, 'test'),
        purpose: 'Run automated tests',
        exists: false,
        source: 'No "test" script found in package.json',
      })
      notes.push('No test script detected — consider adding Vitest with a few utility tests.')
    }
    if (scripts['lint']) {
      commands.push({
        command: getRunCommand(packageManager.manager, 'lint'),
        purpose: 'Static analysis / code style checks',
        exists: true,
        source: `package.json scripts.lint: "${scripts['lint']}"`,
      })
    }
    if (scripts['typecheck'] || scripts['type-check']) {
      const name = scripts['typecheck'] ? 'typecheck' : 'type-check'
      commands.push({
        command: getRunCommand(packageManager.manager, name),
        purpose: 'TypeScript type checking',
        exists: true,
        source: `package.json scripts.${name}`,
      })
    }
  }

  if (repoType === 'Python') {
    commands.push(
      { command: 'pytest', purpose: 'Run Python test suite', exists: files.has('pytest.ini') || files.has('pyproject.toml') || files.has('tests'), source: 'Python project convention' },
      { command: 'ruff check .', purpose: 'Lint Python code', exists: files.has('ruff.toml') || files.has('pyproject.toml'), source: 'Python project convention' },
    )
    if (files.has('mypy.ini')) {
      commands.push({ command: 'mypy .', purpose: 'Static type checking', exists: true, source: 'mypy.ini' })
    }
  }

  if (repoType === 'Go') {
    commands.push(
      { command: 'go build ./...', purpose: 'Compile all packages', exists: true, source: 'go.mod' },
      { command: 'go test ./...', purpose: 'Run Go test suite', exists: true, source: 'go.mod' },
    )
  }

  if (repoType === 'Rust') {
    commands.push(
      { command: 'cargo build', purpose: 'Compile the crate', exists: true, source: 'Cargo.toml' },
      { command: 'cargo test', purpose: 'Run Rust test suite', exists: true, source: 'Cargo.toml' },
    )
  }

  if (repoType === 'Unknown') {
    notes.push('Could not detect a known toolchain. Inspect the repository for a Makefile, CI workflow, or README instructions.')
    if (files.has('Makefile')) {
      commands.push({ command: 'make test', purpose: 'Run Makefile test target if defined', exists: true, source: 'Makefile' })
    }
  }

  const manualInstructions = [
    'Run the recommended commands locally from the repository root.',
    'Verification commands are recommendations only — RepoPulse Agent does not execute code in your environment.',
    'Record pass/fail results on the run before approving the change.',
  ]

  return { repoType, commands, manualInstructions, notes }
}
