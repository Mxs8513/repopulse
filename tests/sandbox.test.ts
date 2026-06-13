import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRun, getRun, updateRun } from '@/lib/agent/run-store'
import { allowlistCommands, runSandboxVerification, selectApprovedPatches } from '@/lib/agent/sandbox'
import { nodeSandboxExecutor, sha256 } from '@/lib/agent/sandbox-executor'
import type { SandboxExecutor } from '@/lib/agent/sandbox'
import type { FilePatchProposal } from '@/lib/agent/types'

const fakeApprovedPatch: FilePatchProposal = {
  path: 'src/approved.ts',
  changeSummary: 'Update approved file',
  reasoning: 'Needed for feature',
  risk: 'low',
  proposedChange: 'diff content',
  groundedInContent: true,
  approval: 'approved',
}

const fakeRejectedPatch: FilePatchProposal = {
  path: 'src/rejected.ts',
  changeSummary: 'Update rejected file',
  reasoning: 'Not approved',
  risk: 'medium',
  proposedChange: 'diff content',
  groundedInContent: true,
  approval: 'rejected',
}

const fakePendingPatch: FilePatchProposal = {
  path: 'src/pending.ts',
  changeSummary: 'Update pending file',
  reasoning: 'Awaiting decision',
  risk: 'medium',
  proposedChange: 'diff content',
  groundedInContent: true,
  approval: 'pending',
}

function makeExecutor(overrides: Partial<SandboxExecutor> = {}): SandboxExecutor {
  return {
    createWorkspace: async () => '/tmp/repopulse-sandbox-test',
    cloneRepository: async (_repo, destination) => ({ path: destination, cloned: true }),
    workspaceHasPackageJson: async () => true,
    workspaceFiles: async () => [],
    readPackageJson: async () => undefined,
    applyPatch: async () => ({ ok: true }),
    runCommand: async () => ({ exitCode: 0, stdout: 'ok', stderr: '', timedOut: false }),
    verifyRepositoryIdentity: async () => 'unverified',
    cleanup: async () => {},
    preparePackageManager: async () => ({ ok: true, bootstrapped: false, command: 'npm --version' }),
    ...overrides,
  }
}

describe('sandbox orchestration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('allows only approved patches to be selected', () => {
    const patches = [fakeApprovedPatch, fakeRejectedPatch, fakePendingPatch]
    const approved = selectApprovedPatches(patches)
    expect(approved).toEqual([fakeApprovedPatch])
  })

  it('allowlists commands and preserves canonical order', () => {
    const commands = ['npm run test', 'npm install', 'npm run test', 'invalid command']
    expect(allowlistCommands(commands)).toEqual(['npm install', 'npm run build', 'npm run test', 'npm run lint'].filter((c) => c === 'npm install' || c === 'npm run test'))
  })

  it('returns disabled result when sandbox execution is turned off', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'false')
    const executor = makeExecutor({
      createWorkspace: async () => {
        throw new Error('should not be called')
      },
    })
    const { result, events } = await runSandboxVerification(
      { runId: 'run1', patches: [fakeApprovedPatch], commands: ['npm install'] },
      executor
    )

    expect(result.status).toBe('disabled')
    expect(result.failureReason).toContain('disabled')
    expect(events.some((event) => event.type === 'sandbox_verification_completed')).toBe(true)
  })

  it('applies only approved files and skips rejected/pending files', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    const applied: string[] = []
    const executor = makeExecutor({
      applyPatch: async (_workspace, patch) => {
        applied.push(patch.path)
        return { ok: true }
      },
    })

    const { result } = await runSandboxVerification(
      { runId: 'run2', patches: [fakeApprovedPatch, fakeRejectedPatch, fakePendingPatch], commands: ['npm install'] },
      executor
    )

    expect(applied).toEqual(['src/approved.ts'])
    expect(result.status).toBe('passed')
  })

  it('records patch apply failures and marks sandbox failed', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    const executor = makeExecutor({
      applyPatch: async () => ({ ok: false, reason: 'patch conflict' }),
    })

    const { result, events } = await runSandboxVerification(
      { runId: 'run3', patches: [fakeApprovedPatch], commands: ['npm install'] },
      executor
    )

    expect(result.status).toBe('failed')
    expect(result.conclusion).toBe('patch_application_failed')
    expect(result.applyFailures).toEqual([{ path: 'src/approved.ts', reason: 'patch conflict' }])
    expect(events.some((event) => event.type === 'sandbox_patch_failed')).toBe(true)
  })

  it('records failed command execution and reports a failed sandbox', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    const executor = makeExecutor({
      runCommand: async () => ({ exitCode: 1, stdout: 'build failed', stderr: 'error', timedOut: false }),
    })

    const { result, events } = await runSandboxVerification(
      { runId: 'run4', patches: [fakeApprovedPatch], commands: ['npm install'] },
      executor
    )

    expect(result.status).toBe('failed')
    expect(result.commands[0].status).toBe('failed')
    expect(result.commands[0].exitCode).toBe(1)
    expect(events.some((event) => event.type === 'sandbox_command_failed')).toBe(true)
  })

  it('records a timeout as a failed command result', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    const executor = makeExecutor({
      runCommand: async () => ({ exitCode: null, stdout: '', stderr: 'timeout', timedOut: true }),
    })

    const { result, events } = await runSandboxVerification(
      { runId: 'run5', patches: [fakeApprovedPatch], commands: ['npm install'] },
      executor
    )

    expect(result.status).toBe('failed')
    expect(result.failureReason).toMatch(/timed out/i)
    expect(result.commands[0].timedOut).toBe(true)
    expect(events.some((event) => event.type === 'sandbox_command_failed')).toBe(true)
  })

  it('blocks npm command execution when package.json is missing in the sandbox', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    const executor = makeExecutor({
      workspaceHasPackageJson: async () => false,
    })

    const { result, events } = await runSandboxVerification(
      { runId: 'run6', patches: [fakeApprovedPatch], commands: ['npm install'] },
      executor
    )

    expect(result.status).toBe('unavailable')
    expect(result.failureReason).toContain('Sandbox unsupported: no package.json found')
    expect(events.some((event) => event.type === 'sandbox_verification_completed')).toBe(true)
  })

  it('normalizes generic npm commands to the detected package manager', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    const tmpRepo = await mkdtemp(path.join(os.tmpdir(), 'repopulse-sandbox-repo-'))
    await writeFile(
      path.join(tmpRepo, 'package.json'),
      JSON.stringify({ name: 'sandbox-test', packageManager: 'pnpm@8.0.0', scripts: { test: 'echo ok' } })
    )

    const executedCommands: string[] = []
    const executor = makeExecutor({
      createWorkspace: async () => tmpRepo,
      workspaceFiles: async () => ['package.json', 'pnpm-lock.yaml'],
      readPackageJson: async () => ({ name: 'sandbox-test', packageManager: 'pnpm@8.0.0', scripts: { test: 'echo ok' } }),
      preparePackageManager: async () => ({ ok: true, bootstrapped: true, command: 'corepack prepare pnpm@8.0.0 --activate', stdout: 'ok', stderr: '' }),
      runCommand: async (_workspace, command) => {
        executedCommands.push(command)
        return { exitCode: 0, stdout: 'ok', stderr: '', timedOut: false }
      },
    })

    const { result } = await runSandboxVerification(
      { runId: 'run-pm', patches: [fakeApprovedPatch], commands: ['npm install', 'npm run test'], repoPath: tmpRepo },
      executor
    )

    // Baseline runs install + test; patched re-runs only the verification command (test).
    expect(executedCommands).toEqual(['pnpm install', 'pnpm run test', 'pnpm run test'])
    expect(result.packageManager?.manager).toBe('pnpm')
    expect(result.packageManagerBootstrap?.bootstrapped).toBe(true)
    expect(result.packageManagerBootstrap?.command).toContain('corepack prepare pnpm@8.0.0 --activate')

    await rm(tmpRepo, { recursive: true, force: true })
  })

  it('uses bootstrapped yarn when detected and missing locally', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    const tmpRepo = await mkdtemp(path.join(os.tmpdir(), 'repopulse-sandbox-repo-'))
    await writeFile(
      path.join(tmpRepo, 'package.json'),
      JSON.stringify({ name: 'sandbox-test', packageManager: 'yarn@4.0.0', scripts: { build: 'echo build' } })
    )

    const executedCommands: string[] = []
    const executor = makeExecutor({
      createWorkspace: async () => tmpRepo,
      workspaceFiles: async () => ['package.json', 'yarn.lock'],
      readPackageJson: async () => ({ packageManager: 'yarn@4.0.0', scripts: { build: 'echo build' } }),
      preparePackageManager: async () => ({ ok: true, bootstrapped: true, command: 'corepack prepare yarn@4.0.0 --activate', stdout: 'ok', stderr: '' }),
      runCommand: async (_workspace, command) => {
        executedCommands.push(command)
        return { exitCode: 0, stdout: 'ok', stderr: '', timedOut: false }
      },
    })

    const { result } = await runSandboxVerification(
      { runId: 'run-yarn', patches: [fakeApprovedPatch], commands: ['npm install', 'npm run build'], repoPath: tmpRepo },
      executor
    )

    expect(executedCommands).toEqual(['yarn install', 'yarn run build', 'yarn run build'])
    expect(result.packageManager?.manager).toBe('yarn')
    expect(result.packageManagerBootstrap?.bootstrapped).toBe(true)

    await rm(tmpRepo, { recursive: true, force: true })
  })

  it('fails with a sandbox infrastructure error when corepack is unavailable', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    const tmpRepo = await mkdtemp(path.join(os.tmpdir(), 'repopulse-sandbox-repo-'))
    await writeFile(
      path.join(tmpRepo, 'package.json'),
      JSON.stringify({ name: 'sandbox-test', packageManager: 'pnpm@8.0.0', scripts: { test: 'echo ok' } })
    )

    const executor = makeExecutor({
      createWorkspace: async () => tmpRepo,
      workspaceFiles: async () => ['package.json', 'pnpm-lock.yaml'],
      readPackageJson: async () => ({ packageManager: 'pnpm@8.0.0', scripts: { test: 'echo ok' } }),
      preparePackageManager: async () => ({
        ok: false,
        bootstrapped: false,
        method: 'corepack',
        command: 'corepack --version',
        stderr: 'corepack: command not found',
        reason: 'Corepack is not available in the sandbox environment.',
      }),
    })

    const { result } = await runSandboxVerification(
      { runId: 'run-corepack-missing', patches: [fakeApprovedPatch], commands: ['npm install'], repoPath: tmpRepo },
      executor
    )

    expect(result.status).toBe('unavailable')
    expect(result.failureReason).toBe('Sandbox setup failed before verification commands ran.')
    expect(result.packageManagerBootstrap?.reason).toBe('Corepack is not available in the sandbox environment.')
    expect(result.packageManagerBootstrap?.method).toBe('corepack')
    expect(result.failureReason).not.toMatch(/install pnpm|manual/i)

    await rm(tmpRepo, { recursive: true, force: true })
  })

  it('uses npm-exec fallback when pnpm is detected and Corepack is unavailable', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    const tmpRepo = await mkdtemp(path.join(os.tmpdir(), 'repopulse-sandbox-repo-'))
    await writeFile(
      path.join(tmpRepo, 'package.json'),
      JSON.stringify({ name: 'sandbox-test', packageManager: 'pnpm@8.0.0', scripts: { build: 'echo build', test: 'echo test' } })
    )

    const executedCommands: string[] = []
    const bootstrapEvents: Array<unknown> = []
    const executor = makeExecutor({
      createWorkspace: async () => tmpRepo,
      workspaceFiles: async () => ['package.json', 'pnpm-lock.yaml'],
      readPackageJson: async () => ({ packageManager: 'pnpm@8.0.0', scripts: { build: 'echo build', test: 'echo test' } }),
      preparePackageManager: async () => ({
        ok: true,
        bootstrapped: true,
        method: 'npm-exec-fallback',
        command: 'npm exec --yes --package pnpm@8.0.0 -- pnpm --version',
        executionCommand: 'npm exec --yes --package pnpm@8.0.0 -- pnpm',
        packageSpec: 'pnpm@8.0.0',
      }),
      runCommand: async (_workspace, command, _timeoutMs, bootstrap) => {
        executedCommands.push(command)
        bootstrapEvents.push(bootstrap)
        return { exitCode: 0, stdout: 'ok', stderr: '', timedOut: false }
      },
    })

    const { result } = await runSandboxVerification(
      { runId: 'run-pnpm-fallback', patches: [fakeApprovedPatch], commands: ['npm install', 'npm run build', 'npm run test'], repoPath: tmpRepo },
      executor
    )

    // Baseline: install + build + test. Patched: build + test again.
    expect(executedCommands).toEqual(['pnpm install', 'pnpm run build', 'pnpm run test', 'pnpm run build', 'pnpm run test'])
    expect(bootstrapEvents.length).toBe(5)
    for (const event of bootstrapEvents) {
      expect(event).toEqual(expect.objectContaining({ method: 'npm-exec-fallback', packageSpec: 'pnpm@8.0.0' }))
    }
    expect(result.packageManagerBootstrap?.method).toBe('npm-exec-fallback')
    expect(result.packageManagerBootstrap?.executionCommand).toContain('npm exec --yes --package pnpm@8.0.0 -- pnpm')
    expect(result.status).toBe('passed')

    await rm(tmpRepo, { recursive: true, force: true })
  })

  it('reports no verification commands run when package manager bootstrap fails before commands', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    const tmpRepo = await mkdtemp(path.join(os.tmpdir(), 'repopulse-sandbox-repo-'))
    await writeFile(path.join(tmpRepo, 'package.json'), JSON.stringify({ name: 'sandbox-test', packageManager: 'pnpm@8.0.0' }))

    const executor = makeExecutor({
      createWorkspace: async () => tmpRepo,
      workspaceFiles: async () => ['package.json', 'pnpm-lock.yaml'],
      readPackageJson: async () => ({ packageManager: 'pnpm@8.0.0' }),
      preparePackageManager: async () => ({
        ok: false,
        bootstrapped: false,
        method: 'corepack',
        reason: 'Corepack unavailable',
      }),
    })

    const { result } = await runSandboxVerification(
      { runId: 'run-setup-fail', patches: [fakeApprovedPatch, fakePendingPatch], commands: ['npm install'], repoPath: tmpRepo },
      executor
    )

    expect(result.status).toBe('unavailable')
    expect(result.commands.length).toBe(0)
    expect(result.approvedApplied).toBe(0)
    expect(result.failureReason).toBe('Sandbox setup failed before verification commands ran.')

    await rm(tmpRepo, { recursive: true, force: true })
  })

  it('reports verification commands ran but failed when a command fails', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    const tmpRepo = await mkdtemp(path.join(os.tmpdir(), 'repopulse-sandbox-repo-'))
    await writeFile(
      path.join(tmpRepo, 'package.json'),
      JSON.stringify({ name: 'sandbox-test', packageManager: 'pnpm@8.0.0', scripts: { test: 'echo ok' } })
    )

    const executor = makeExecutor({
      createWorkspace: async () => tmpRepo,
      workspaceFiles: async () => ['package.json', 'pnpm-lock.yaml'],
      readPackageJson: async () => ({ packageManager: 'pnpm@8.0.0', scripts: { test: 'echo ok' } }),
      preparePackageManager: async () => ({
        ok: true,
        bootstrapped: true,
        method: 'npm-exec-fallback',
        command: 'npm exec --yes --package pnpm@8.0.0 -- pnpm --version',
        executionCommand: 'npm exec --yes --package pnpm@8.0.0 -- pnpm',
        packageSpec: 'pnpm@8.0.0',
      }),
      runCommand: async () => ({ exitCode: 1, stdout: 'fail', stderr: 'error', timedOut: false }),
    })

    const { result } = await runSandboxVerification(
      { runId: 'run-command-fail', patches: [fakeApprovedPatch], commands: ['npm install'], repoPath: tmpRepo },
      executor
    )

    // install is part of setup → its failure classifies as setup_failed, not patch.
    expect(result.status).toBe('failed')
    expect(result.conclusion).toBe('setup_failed')
    expect(result.commands.length).toBeGreaterThan(0)
    expect(result.failureReason).toContain('Setup failed')
    expect(result.packageManagerBootstrap?.method).toBe('npm-exec-fallback')

    await rm(tmpRepo, { recursive: true, force: true })
  })

  it('prefers a configured local checkout under SANDBOX_REPO_ROOT', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'repopulse-sandbox-root-'))
    const checkout = path.join(tmpRoot, 'facebook', 'react')
    await mkdir(checkout, { recursive: true })
    await mkdir(path.join(checkout, '.git'), { recursive: true })
    await writeFile(path.join(checkout, 'package.json'), JSON.stringify({ name: 'react' }))
    await writeFile(path.join(checkout, '.git', 'config'), '[remote "origin"]\n\turl = https://github.com/facebook/react.git\n')

    vi.stubEnv('SANDBOX_REPO_ROOT', tmpRoot)

    let cloned = false
    const executor = makeExecutor({
      cloneRepository: async () => {
        cloned = true
        return { path: '', cloned: false, reason: 'should not clone when local checkout exists' }
      },
      verifyRepositoryIdentity: async () => 'verified',
    })

    const { result } = await runSandboxVerification(
      { runId: 'run-local', patches: [fakeApprovedPatch], commands: ['npm install'], repo: 'facebook/react' },
      executor
    )

    expect(cloned).toBe(false)
    expect(result.sourceType).toBe('local_checkout')
  })

  it('clones GitHub repository when no local checkout exists', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    let clonedRepo = ''
    const executor = makeExecutor({
      cloneRepository: async (_repo, destination) => {
        clonedRepo = destination
        return { path: destination, cloned: true }
      },
    })

    const { result } = await runSandboxVerification(
      { runId: 'run-clone', patches: [fakeApprovedPatch], commands: ['npm install'], repo: 'facebook/react' },
      executor
    )

    expect(result.status).toBe('passed')
    expect(result.sourceType).toBe('cloned_from_github')
    expect(clonedRepo).toContain('facebook__react')
  })

  it('returns unavailable when GitHub clone fails', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    const executor = makeExecutor({
      cloneRepository: async () => ({ path: '/tmp/whatever', cloned: false, reason: 'authentication failed' }),
    })

    const { result } = await runSandboxVerification(
      { runId: 'run-clone-fail', patches: [fakeApprovedPatch], commands: ['npm install'], repo: 'facebook/react' },
      executor
    )

    expect(result.status).toBe('unavailable')
    expect(result.failureReason).toContain('GitHub clone failed')
    expect(result.failureReason).toContain('authentication failed')
  })

  it('returns unsupported when package.json is missing after repo preparation', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    const executor = makeExecutor({
      cloneRepository: async (repo, destination) => ({ path: destination, cloned: true }),
      workspaceHasPackageJson: async () => false,
      runCommand: async () => ({ exitCode: 0, stdout: 'ok', stderr: '', timedOut: false }),
    })

    const { result } = await runSandboxVerification(
      { runId: 'run-unsupported', patches: [fakeApprovedPatch], commands: ['npm install'], repo: 'facebook/react' },
      executor
    )

    expect(result.status).toBe('unavailable')
    expect(result.failureReason).toContain('Sandbox unsupported: no package.json found')
  })

  it('returns unavailable when local checkout identity does not match the expected repo', async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'repopulse-sandbox-root-'))
    const checkout = path.join(tmpRoot, 'facebook', 'react')
    await mkdir(checkout, { recursive: true })
    const packageJson = { name: 'react' }
    await writeFile(path.join(checkout, 'package.json'), JSON.stringify(packageJson))

    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    vi.stubEnv('SANDBOX_REPO_ROOT', tmpRoot)

    const executor = makeExecutor({
      verifyRepositoryIdentity: async () => 'mismatched',
    })

    const { result } = await runSandboxVerification(
      { runId: 'run9', patches: [fakeApprovedPatch], commands: ['npm install'], repo: 'facebook/react' },
      executor
    )

    expect(result.status).toBe('unavailable')
    expect(result.failureReason).toContain('repository identity does not match expected')
  })

  it('ensures approved patch application happens after workspace preparation', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    let workspaceReady = false
    const executor = makeExecutor({
      createWorkspace: async () => {
        workspaceReady = true
        return '/tmp/repopulse-sandbox-test'
      },
      applyPatch: async (_workspace, patch) => {
        expect(workspaceReady).toBe(true)
        return { ok: true }
      },
    })

    const { result } = await runSandboxVerification(
      { runId: 'run7', patches: [fakeApprovedPatch, fakeRejectedPatch, fakePendingPatch], commands: ['npm install'] },
      executor
    )

    expect(result.status).toBe('passed')
  })

  it('baseline passes and patched passes → sandbox_passed', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    const executor = makeExecutor() // runCommand always returns exit 0
    const { result } = await runSandboxVerification(
      { runId: 'run-pass', patches: [fakeApprovedPatch], commands: ['npm install', 'npm run test'] },
      executor
    )
    expect(result.conclusion).toBe('sandbox_passed')
    expect(result.status).toBe('passed')
    // Baseline ran install+test; patched re-ran test only — stored separately.
    expect(result.baselineCommands?.map((c) => c.command)).toEqual(['npm install', 'npm run test'])
    expect(result.patchedCommands?.map((c) => c.command)).toEqual(['npm run test'])
  })

  it('baseline passes but patched fails → patch_failed (patch is blamed only here)', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    // Same command passes on the clean baseline, fails after the patch is applied.
    const calls = new Map<string, number>()
    const executor = makeExecutor({
      runCommand: async (_w, command) => {
        const n = (calls.get(command) ?? 0) + 1
        calls.set(command, n)
        if (command === 'npm run test' && n >= 2) {
          return { exitCode: 1, stdout: '', stderr: 'patched test failed', timedOut: false }
        }
        return { exitCode: 0, stdout: 'ok', stderr: '', timedOut: false }
      },
    })
    const { result } = await runSandboxVerification(
      { runId: 'run-patchfail', patches: [fakeApprovedPatch], commands: ['npm install', 'npm run test'] },
      executor
    )
    expect(result.conclusion).toBe('patch_failed')
    expect(result.status).toBe('failed')
    expect(result.baselineCommands?.every((c) => c.status === 'passed')).toBe(true)
    expect(result.patchedCommands?.some((c) => c.status === 'failed')).toBe(true)
  })

  it('baseline fails → baseline_failed and the patch is not blamed or applied', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    const applied: string[] = []
    const executor = makeExecutor({
      // install passes (setup ok); the verification command fails on the clean clone.
      runCommand: async (_w, command) =>
        command === 'npm run test'
          ? { exitCode: 1, stdout: '', stderr: 'baseline already broken', timedOut: false }
          : { exitCode: 0, stdout: 'ok', stderr: '', timedOut: false },
      applyPatch: async (_w, p) => {
        applied.push(p.path)
        return { ok: true }
      },
    })
    const { result } = await runSandboxVerification(
      { runId: 'run-baselinefail', patches: [fakeApprovedPatch], commands: ['npm install', 'npm run test'] },
      executor
    )
    expect(result.conclusion).toBe('baseline_failed')
    expect(result.status).toBe('failed')
    expect(applied).toEqual([]) // patch never applied when baseline fails
    expect(result.approvedApplied).toBe(0)
    expect(result.patchedCommands).toEqual([])
  })

  it('tracks approved queued, applied, and excluded counts separately', async () => {
    vi.stubEnv('SANDBOX_EXECUTION_ENABLED', 'true')
    const executor = makeExecutor()
    const { result } = await runSandboxVerification(
      { runId: 'run-counts', patches: [fakeApprovedPatch, fakeRejectedPatch, fakePendingPatch], commands: ['npm install'] },
      executor
    )
    expect(result.approvedQueued).toBe(1)
    expect(result.approvedApplied).toBe(1)
    expect(result.excludedPatches).toBe(2) // rejected + pending
    expect(result.failedToApply).toBe(0)
  })
})

describe('sandbox executor integration', () => {
  it('copies a local repo with package.json into the workspace', async () => {
    const tmpRepo = await mkdtemp(path.join(os.tmpdir(), 'repopulse-sandbox-repo-'))
    await writeFile(path.join(tmpRepo, 'package.json'), JSON.stringify({ name: 'sandbox-test' }))
    await writeFile(path.join(tmpRepo, 'README.md'), 'sandbox repo')

    const workspace = await nodeSandboxExecutor.createWorkspace('run-integration', tmpRepo)
    const hasPackage = await nodeSandboxExecutor.workspaceHasPackageJson(workspace)

    expect(hasPackage).toBe(true)

    await nodeSandboxExecutor.cleanup(workspace)
    await rm(tmpRepo, { recursive: true, force: true })
  })

  it('skips npm run commands when the script is not defined in package.json', async () => {
    const tmpRepo = await mkdtemp(path.join(os.tmpdir(), 'repopulse-sandbox-repo-'))
    await writeFile(path.join(tmpRepo, 'package.json'), JSON.stringify({ name: 'sandbox-test', scripts: { test: 'echo testing' } }))

    const workspace = await nodeSandboxExecutor.createWorkspace('run-integration-skip', tmpRepo)
    const result = await nodeSandboxExecutor.runCommand(workspace, 'npm run lint', 30_000)

    expect(result.skipped).toBe(true)
    expect(result.exitCode).toBeNull()
    expect(result.stderr).toContain('is not defined in package.json')

    await nodeSandboxExecutor.cleanup(workspace)
    await rm(tmpRepo, { recursive: true, force: true })
  })

  it('applies an approved patch as a real full-file replacement inside the sandbox clone', async () => {
    const tmpRepo = await mkdtemp(path.join(os.tmpdir(), 'repopulse-sandbox-repo-'))
    await writeFile(path.join(tmpRepo, 'package.json'), JSON.stringify({ name: 'sandbox-test' }))
    const original = 'export const value = 1\n'
    await writeFile(path.join(tmpRepo, 'value.ts'), original)

    const workspace = await nodeSandboxExecutor.createWorkspace('run-apply', tmpRepo)
    const res = await nodeSandboxExecutor.applyPatch(workspace, {
      path: 'value.ts',
      changeSummary: 'bump',
      reasoning: 'r',
      risk: 'low',
      proposedChange: 'value 1 -> 2',
      groundedInContent: true,
      approval: 'approved',
      originalContent: original,
      originalContentHash: sha256(original),
      proposedContent: 'export const value = 2\n',
    })
    expect(res.ok).toBe(true)
    // The file inside the sandbox clone was really modified...
    const updated = await readFile(path.join(workspace, 'value.ts'), 'utf-8')
    expect(updated).toBe('export const value = 2\n')
    // ...and the ORIGINAL repo was never touched.
    expect(await readFile(path.join(tmpRepo, 'value.ts'), 'utf-8')).toBe(original)

    await nodeSandboxExecutor.cleanup(workspace)
    await rm(tmpRepo, { recursive: true, force: true })
  })

  it('blocks path traversal and absolute paths', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'repopulse-sandbox-guard-'))
    const base = {
      changeSummary: 's',
      reasoning: 'r',
      risk: 'low' as const,
      proposedChange: 'x',
      groundedInContent: true,
      approval: 'approved' as const,
      proposedContent: 'malicious',
    }
    const traversal = await nodeSandboxExecutor.applyPatch(workspace, { ...base, path: '../escape.ts' })
    expect(traversal.ok).toBe(false)
    expect(traversal.reason).toMatch(/traversal|absolute|unsafe/i)

    const absolute = await nodeSandboxExecutor.applyPatch(workspace, { ...base, path: '/etc/passwd' })
    expect(absolute.ok).toBe(false)
    expect(absolute.reason).toMatch(/traversal|absolute|unsafe/i)

    await rm(workspace, { recursive: true, force: true })
  })

  it('blocks application when the original content hash does not match', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'repopulse-sandbox-hash-'))
    await writeFile(path.join(workspace, 'drifted.ts'), 'actual content on disk\n')

    const res = await nodeSandboxExecutor.applyPatch(workspace, {
      path: 'drifted.ts',
      changeSummary: 's',
      reasoning: 'r',
      risk: 'low',
      proposedChange: 'x',
      groundedInContent: true,
      approval: 'approved',
      originalContentHash: sha256('different content the patch was built against\n'),
      proposedContent: 'new content',
    })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/hash mismatch/i)
    // File unchanged after a blocked apply.
    expect(await readFile(path.join(workspace, 'drifted.ts'), 'utf-8')).toBe('actual content on disk\n')

    await rm(workspace, { recursive: true, force: true })
  })

  it('marks a patch not safely applicable when full-file content is missing', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'repopulse-sandbox-nocontent-'))
    await writeFile(path.join(workspace, 'a.ts'), 'x')
    const res = await nodeSandboxExecutor.applyPatch(workspace, {
      path: 'a.ts',
      changeSummary: 's',
      reasoning: 'r',
      risk: 'low',
      proposedChange: 'conceptual only',
      groundedInContent: true,
      approval: 'approved',
      // no proposedContent
    })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/no full-file proposed content|not be applied safely/i)
    await rm(workspace, { recursive: true, force: true })
  })

  it('verifies local checkout identity from .git/config', async () => {
    const tmpRepo = await mkdtemp(path.join(os.tmpdir(), 'repopulse-sandbox-repo-'))
    await mkdir(path.join(tmpRepo, '.git'), { recursive: true })
    await writeFile(path.join(tmpRepo, 'package.json'), JSON.stringify({ name: 'sandbox-test' }))
    await writeFile(
      path.join(tmpRepo, '.git', 'config'),
      '[remote "origin"]\n\turl = https://github.com/facebook/react.git\n'
    )

    expect(await nodeSandboxExecutor.verifyRepositoryIdentity(tmpRepo, 'facebook/react')).toBe('verified')
    expect(await nodeSandboxExecutor.verifyRepositoryIdentity(tmpRepo, 'facebook/other')).toBe('mismatched')

    await rm(tmpRepo, { recursive: true, force: true })
  })
})

describe('sandbox result persistence', () => {
  let originalWindow: unknown
  let originalLocalStorage: unknown
  const storage = new Map<string, string>()

  beforeEach(() => {
    originalWindow = (globalThis as any).window
    originalLocalStorage = (globalThis as any).localStorage
    ;(globalThis as any).window = globalThis
    ;(globalThis as any).localStorage = {
      getItem: (key: string) => (storage.has(key) ? storage.get(key) ?? null : null),
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    }
  })

  afterEach(() => {
    ;(globalThis as any).window = originalWindow
    ;(globalThis as any).localStorage = originalLocalStorage
    storage.clear()
  })

  it('saves sandbox results to the run object', () => {
    const run = createRun({ repo: 'repo', task: 'task', intent: 'safe_code_change', provider: 'mock' })
    const sandbox = {
      status: 'passed' as const,
      workspaceId: 'sandbox-1',
      approvedApplied: 1,
      applyFailures: [],
      commands: [],
      durationMs: 1,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    }

    updateRun(run.runId, { sandbox })
    const persisted = getRun(run.runId)
    expect(persisted?.sandbox).toEqual(sandbox)
  })
})
