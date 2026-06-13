// Phase 8 — Sandbox Verification orchestration.
//
// After a human approves selected proposed diffs, this trial-runs ONLY the
// approved patches in an isolated, temporary workspace and runs a fixed set of
// allowlisted verification commands. It never touches the real repository and
// never commits, pushes, merges, or opens a PR.
//
// This module is filesystem/process-agnostic: all real work happens through an
// injected SandboxExecutor, so the orchestration (flag gating, approved-only
// filtering, allowlisting, status machine, audit events, timeouts) is pure and
// unit-tested. The real executor lives in sandbox-executor.ts (server-only).

import { access, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type {
  AgentEvent,
  AgentEventType,
  FilePatchProposal,
  PackageManagerBootstrapResult,
  SandboxCommandResult,
  SandboxConclusion,
  SandboxResult,
  SandboxStatus,
} from './types'
import { detectPackageManager, PackageManagerInfo } from './package-manager'

const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn'] as const
const ALLOWED_SCRIPT_NAMES = ['build', 'test', 'lint', 'typecheck', 'type-check'] as const

/** The ONLY commands the sandbox is ever allowed to run. Never model-generated. */
export const ALLOWED_COMMANDS = [
  ...PACKAGE_MANAGERS.map((manager) => `${manager} install`),
  ...PACKAGE_MANAGERS.flatMap((manager) =>
    ALLOWED_SCRIPT_NAMES.map((script) => `${manager} run ${script}`)
  ),
] as const
export type AllowedCommand = (typeof ALLOWED_COMMANDS)[number]

/** Per-command hard timeout. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 120_000

export function isSandboxEnabled(): boolean {
  return process.env.SANDBOX_EXECUTION_ENABLED === 'true'
}

/** Only files the human explicitly approved are ever applied. */
export function selectApprovedPatches(patches: FilePatchProposal[]): FilePatchProposal[] {
  return patches.filter((p) => p.approval === 'approved')
}

/** Intersect requested commands with the allowlist, de-duplicated, in canonical order. */
export function allowlistCommands(requested: string[]): AllowedCommand[] {
  const norm = new Set(requested.map((c) => c.trim()))
  return ALLOWED_COMMANDS.filter((c) => norm.has(c))
}

export function normalizeCommandForPackageManager(command: string, manager: PackageManagerInfo['manager']): string {
  const trimmed = command.trim()
  if (trimmed === 'npm install') return `${manager} install`
  const runScript = trimmed.match(/^npm run (.+)$/)
  if (runScript) return `${manager} run ${runScript[1]}`
  return trimmed
}

export const CLONE_TIMEOUT_MS = 120_000
export const SANDBOX_CLONE_BASE = path.join(os.tmpdir(), 'repopulse-sandbox-repos')
const REPO_NAME_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/

export function isValidRepoName(repo: string): boolean {
  return REPO_NAME_RE.test(repo)
}

export function getSandboxRepoRoot(): string | null {
  const root = process.env.SANDBOX_REPO_ROOT
  return root ? path.resolve(root) : null
}

export async function resolveSandboxRepoPath(repo: string): Promise<string | null> {
  if (!isValidRepoName(repo)) return null
  const root = getSandboxRepoRoot()
  if (!root) return null

  const [owner, name] = repo.split('/')
  const candidates = [
    path.join(root, owner, name),
    path.join(root, `${owner}__${name}`),
  ]

  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      continue
    }
  }

  return null
}

export interface SandboxExecutor {
  /** Create an isolated temp workspace; returns an opaque id/path. */
  createWorkspace(runId: string, repositoryPath?: string): Promise<string>
  /** Clone a GitHub repository into an isolated path for sandbox preparation. */
  cloneRepository(repo: string, destination: string, timeoutMs: number): Promise<{ path: string; cloned: boolean; reason?: string }>
  /** Check whether the workspace contains package.json at its root. */
  workspaceHasPackageJson(workspace: string): Promise<boolean>
  /** List workspace root files for package manager detection. */
  workspaceFiles(workspace: string): Promise<string[]>
  /** Read package.json from the sandbox workspace. */
  readPackageJson(workspace: string): Promise<Record<string, unknown> | undefined>
  /** Apply a single approved patch into the workspace (never the real repo). */
  applyPatch(workspace: string, patch: FilePatchProposal): Promise<{ ok: boolean; reason?: string }>
  /** Run one allowlisted command in the workspace with a hard timeout. */
  runCommand(
    workspace: string,
    command: AllowedCommand,
    timeoutMs: number,
    bootstrap?: PackageManagerBootstrapResult
  ): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; skipped?: boolean }>
  /** Prepare or bootstrap the package manager inside the sandbox workspace. */
  preparePackageManager(
    workspace: string,
    packageManager: PackageManagerInfo,
    timeoutMs: number
  ): Promise<PackageManagerBootstrapResult>
  /** Verify a local checkout matches the expected owner/repo identity. */
  verifyRepositoryIdentity(workspace: string, expectedRepo: string): Promise<'verified' | 'unverified' | 'mismatched'>
  /** Best-effort cleanup of the workspace. */
  cleanup(workspace: string): Promise<void>
}

export interface RunSandboxInput {
  runId: string
  patches: FilePatchProposal[]
  /** Commands requested (typically the verification plan's available commands). */
  commands: string[]
  /** Local repository path to copy into the sandbox, when available. */
  repoPath?: string
  /** Expected repository name (owner/repo) for the selected target repo. */
  repo?: string
}

export interface RunSandboxOptions {
  timeoutMs?: number
  /** Injected clock for deterministic tests. */
  now?: () => number
}

function ev(type: AgentEventType, message: string, at: string): AgentEvent {
  return { type, message, at }
}

function safeName(p: string): string {
  return p.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)
}

const PREVIEW_LIMIT = 2000
function preview(s: string): string {
  return s.length > PREVIEW_LIMIT ? s.slice(0, PREVIEW_LIMIT) + '\n…(truncated)' : s
}

/**
 * Trial-run approved patches + allowlisted commands in the sandbox.
 * Returns the result and the audit events to persist on the run. Never throws
 * for command failures — those are captured as failed results.
 */
export async function runSandboxVerification(
  input: RunSandboxInput,
  executor: SandboxExecutor,
  options: RunSandboxOptions = {}
): Promise<{ result: SandboxResult; events: AgentEvent[] }> {
  const now = options.now ?? (() => Date.now())
  const timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS
  const startMs = now()
  const startedAt = new Date(startMs).toISOString()
  const events: AgentEvent[] = []
  const stamp = () => new Date(now()).toISOString()

  // Hard gate: disabled environments never execute anything.
  if (!isSandboxEnabled()) {
    const completedAt = startedAt
    return {
      result: {
        status: 'disabled',
        workspaceId: '',
        approvedApplied: 0,
        applyFailures: [],
        commands: [],
        durationMs: 0,
        failureReason: 'Sandbox execution is disabled in this environment.',
        startedAt,
        completedAt,
      },
      events: [ev('sandbox_verification_completed', 'Sandbox verification is disabled in this environment.', completedAt)],
    }
  }

  const approved = selectApprovedPatches(input.patches)
  const requestedCommands = input.commands.map(String).map((c) => c.trim()).filter((c) => c.length > 0)

  let workspace = ''
  let sourceRepoPath: string | undefined
  let sourceType: SandboxResult['sourceType']
  let repoIdentityVerified: boolean | undefined
  let repositoryPath = input.repoPath
  let clonedRepoPath: string | undefined

  if (!repositoryPath && input.repo) {
    if (!isValidRepoName(input.repo)) {
      const completedAt = stamp()
      return {
        result: {
          status: 'unavailable',
          workspaceId: '',
          approvedApplied: 0,
          applyFailures: [],
          commands: [],
          durationMs: now() - startMs,
          failureReason: `Sandbox unavailable: invalid repository name ${input.repo}.`,
          sourceType: 'unavailable',
          startedAt,
          completedAt,
        },
        events: [
          ...events,
          ev('sandbox_verification_completed', 'Sandbox unavailable: invalid repository name.', completedAt),
        ],
      }
    }

    const resolvedRepoPath = await resolveSandboxRepoPath(input.repo)
    if (resolvedRepoPath) {
      repositoryPath = resolvedRepoPath
      sourceType = 'local_checkout'
    } else {
      const clonePath = path.join(SANDBOX_CLONE_BASE, input.repo.replace('/', '__'), safeName(input.runId))
      const cloneResult = await executor.cloneRepository(input.repo, clonePath, CLONE_TIMEOUT_MS)
      if (!cloneResult.cloned) {
        const completedAt = stamp()
        return {
          result: {
            status: 'unavailable',
            workspaceId: '',
            approvedApplied: 0,
            applyFailures: [],
            commands: [],
            durationMs: now() - startMs,
            failureReason: `Sandbox unavailable: GitHub clone failed: ${cloneResult.reason ?? 'unknown error'}`,
            sourceType: 'unavailable',
            startedAt,
            completedAt,
          },
          events: [
            ...events,
            ev('sandbox_verification_completed', `Sandbox unavailable: GitHub clone failed: ${cloneResult.reason ?? 'unknown error'}`, completedAt),
          ],
        }
      }

      repositoryPath = cloneResult.path
      clonedRepoPath = cloneResult.path
      sourceType = 'cloned_from_github'
    }
  }

  sourceRepoPath = repositoryPath

  if (repositoryPath && input.repo) {
    const identity = await executor.verifyRepositoryIdentity(repositoryPath, input.repo)
    repoIdentityVerified = identity === 'verified'
    if (identity === 'mismatched') {
      const completedAt = stamp()
      if (clonedRepoPath) await rm(clonedRepoPath, { recursive: true, force: true }).catch(() => undefined)
      return {
        result: {
          status: 'unavailable',
          workspaceId: '',
          approvedApplied: 0,
          applyFailures: [],
          commands: [],
          durationMs: now() - startMs,
          failureReason: `Sandbox unavailable: repository identity does not match expected ${input.repo}.`,
          sourceRepoPath,
          sourceType,
          repoIdentityVerified: false,
          startedAt,
          completedAt,
        },
        events: [
          ...events,
          ev(
            'sandbox_verification_completed',
            `Sandbox unavailable: repository identity does not match expected ${input.repo}.`,
            completedAt
          ),
        ],
      }
    }
  }

  try {
    workspace = await executor.createWorkspace(input.runId, repositoryPath)
  } catch (e) {
    const completedAt = stamp()
    if (clonedRepoPath) await rm(clonedRepoPath, { recursive: true, force: true }).catch(() => undefined)
    return {
      result: {
        status: 'unavailable',
        workspaceId: '',
        approvedApplied: 0,
        applyFailures: [],
        commands: [],
        durationMs: now() - startMs,
        failureReason: `Could not create sandbox workspace: ${e instanceof Error ? e.message : String(e)}`,
        sourceRepoPath,
        sourceType,
        repoIdentityVerified,
        startedAt,
        completedAt,
      },
      events: [...events, ev('sandbox_verification_completed', 'Sandbox unavailable: workspace creation failed.', completedAt)],
    }
  }

  if (clonedRepoPath) {
    await rm(clonedRepoPath, { recursive: true, force: true }).catch(() => undefined)
  }

  const hasPackageJson = await executor.workspaceHasPackageJson(workspace)
  if (!hasPackageJson) {
    const completedAt = stamp()
    await executor.cleanup(workspace).catch(() => undefined)
    return {
      result: {
        status: 'unavailable',
        workspaceId: workspace,
        approvedApplied: 0,
        applyFailures: [],
        commands: [],
        durationMs: now() - startMs,
        failureReason:
          'Sandbox unsupported: no package.json found for this repository. RepoPulse currently supports Node/npm verification commands for sandbox execution.',
        sourceRepoPath,
        sourceType: sourceType ?? 'unsupported',
        repoIdentityVerified,
        startedAt,
        completedAt,
      },
      events: [
        ...events,
        ev(
          'sandbox_verification_completed',
          'Sandbox unavailable: workspace is missing package.json.',
          completedAt
        ),
      ],
    }
  }

  let workspaceFiles: string[] = []
  let workspacePackageJson: Record<string, unknown> | undefined
  try {
    workspaceFiles = await executor.workspaceFiles(workspace)
  } catch {
    workspaceFiles = []
  }
  try {
    workspacePackageJson = await executor.readPackageJson(workspace)
  } catch {
    workspacePackageJson = undefined
  }

  const packageManager = detectPackageManager(workspaceFiles, workspacePackageJson)
  let packageManagerBootstrap: PackageManagerBootstrapResult
  try {
    packageManagerBootstrap = await executor.preparePackageManager(workspace, packageManager, timeoutMs)
  } catch (e) {
    const completedAt = stamp()
    await executor.cleanup(workspace).catch(() => undefined)
    return {
      result: {
        status: 'unavailable',
        workspaceId: workspace,
        approvedApplied: 0,
        applyFailures: [],
        commands: [],
        durationMs: now() - startMs,
        failureReason: `Sandbox environment could not bootstrap ${packageManager.manager} for this repository.`,
        sourceRepoPath,
        sourceType,
        repoIdentityVerified,
        packageManager,
        packageManagerBootstrap: {
          ok: false,
          bootstrapped: false,
          stderr: e instanceof Error ? e.message : String(e),
          reason: 'Package manager bootstrap failed with executor error.',
        },
        startedAt,
        completedAt,
      },
      events: [
        ...events,
        ev(
          'sandbox_verification_completed',
          `Sandbox unavailable: could not bootstrap ${packageManager.manager}.`,
          completedAt
        ),
      ],
    }
  }

  if (!packageManagerBootstrap.ok) {
    const completedAt = stamp()
    await executor.cleanup(workspace).catch(() => undefined)
    return {
      result: {
        status: 'unavailable',
        workspaceId: workspace,
        approvedApplied: 0,
        applyFailures: [],
        commands: [],
        durationMs: now() - startMs,
        failureReason: 'Sandbox setup failed before verification commands ran.',
        sourceRepoPath,
        sourceType,
        repoIdentityVerified,
        packageManager,
        packageManagerBootstrap,
        startedAt,
        completedAt,
      },
      events: [
        ...events,
        ev(
          'sandbox_verification_completed',
          `Sandbox unavailable: could not bootstrap ${packageManager.manager}.`,
          completedAt
        ),
      ],
    }
  }

  const commands = allowlistCommands(
    requestedCommands.map((command) => normalizeCommandForPackageManager(command, packageManager.manager))
  )

  if (packageManagerBootstrap.bootstrapped) {
    events.push(
      ev(
        'sandbox_package_manager_bootstrapped',
        `Package manager bootstrapped inside sandbox: ${packageManager.manager}`,
        stamp()
      )
    )
  }

  const approvedQueued = approved.length
  const excludedPatches = input.patches.length - approvedQueued

  events.push(
    ev(
      'sandbox_verification_started',
      `Sandbox verification started: ${approvedQueued} approved patch(es), ${commands.length} allowlisted command(s).`,
      startedAt
    )
  )

  const isInstall = (c: string) => / install$/.test(c)
  // Verification commands re-run after patching are everything except install
  // (dependencies don't change from a source-file patch).
  const verifyCommands = commands.filter((c) => !isInstall(c))

  // Run a list of commands, emitting per-command audit events.
  const runPhase = async (cmds: AllowedCommand[]) => {
    const results: SandboxCommandResult[] = []
    let firstFailure: SandboxCommandResult | null = null
    let timedOut = false
    for (const command of cmds) {
      events.push(ev('sandbox_command_started', `Running: ${command}`, stamp()))
      const cmdStart = now()
      try {
        const out = await executor.runCommand(workspace, command, timeoutMs, packageManagerBootstrap)
        const durationMs = now() - cmdStart
        const status: SandboxCommandResult['status'] = out.skipped
          ? 'skipped'
          : !out.timedOut && out.exitCode === 0
            ? 'passed'
            : 'failed'
        const res: SandboxCommandResult = {
          command,
          status,
          exitCode: out.exitCode,
          durationMs,
          stdoutPreview: preview(out.stdout || ''),
          stderrPreview: preview(out.stderr || ''),
          timedOut: out.timedOut || undefined,
        }
        results.push(res)
        if (status === 'skipped') events.push(ev('sandbox_command_skipped', `Skipped: ${command}`, stamp()))
        else if (status === 'passed') events.push(ev('sandbox_command_passed', `Passed: ${command} (${durationMs}ms)`, stamp()))
        else {
          if (!firstFailure) firstFailure = res
          if (out.timedOut) timedOut = true
          events.push(ev('sandbox_command_failed', `Failed: ${command}${out.timedOut ? ' (timed out)' : ` (exit ${out.exitCode})`}`, stamp()))
        }
      } catch (e) {
        const res: SandboxCommandResult = {
          command,
          status: 'failed',
          exitCode: null,
          durationMs: now() - cmdStart,
          stdoutPreview: '',
          stderrPreview: e instanceof Error ? e.message : String(e),
        }
        results.push(res)
        if (!firstFailure) firstFailure = res
        events.push(ev('sandbox_command_failed', `Failed: ${command} (executor error)`, stamp()))
      }
    }
    return { results, firstFailure, timedOut }
  }

  // Build a result with all shared metadata, then finish (cleanup + completed event).
  const finish = (
    extra: Partial<SandboxResult> & { status: SandboxStatus; conclusion: SandboxConclusion; conclusionMessage: string }
  ): { result: SandboxResult; events: AgentEvent[] } => {
    const completedAt = stamp()
    const result: SandboxResult = {
      workspaceId: workspace,
      approvedQueued,
      approvedApplied: 0,
      failedToApply: 0,
      excludedPatches,
      applyFailures: [],
      commands: [],
      baselineCommands: [],
      patchedCommands: [],
      durationMs: now() - startMs,
      sourceRepoPath,
      sourceType,
      repoIdentityVerified,
      packageManager,
      packageManagerBootstrap,
      startedAt,
      completedAt,
      ...extra,
    }
    events.push(ev('sandbox_verification_completed', `${extra.conclusion}: ${extra.conclusionMessage}`, completedAt))
    return { result, events }
  }

  // --- Phase 1: baseline verification on the clean clone (no patches) ---
  const baseline = await runPhase(commands)
  if (baseline.firstFailure) {
    await executor.cleanup(workspace).catch(() => undefined)
    const failedCmd = baseline.firstFailure
    const setup = isInstall(failedCmd.command)
    const timedOutReason = baseline.timedOut
      ? `Sandbox command "${failedCmd.command}" timed out after ${timeoutMs}ms.`
      : undefined
    if (setup) {
      return finish({
        status: 'failed',
        conclusion: 'setup_failed',
        conclusionMessage: 'Setup failed: sandbox could not prepare the repository/tooling.',
        failureReason: timedOutReason ?? `Setup failed: "${failedCmd.command}" failed on the clean clone.`,
        commands: baseline.results,
        baselineCommands: baseline.results,
      })
    }
    return finish({
      status: 'failed',
      conclusion: 'baseline_failed',
      conclusionMessage:
        'Baseline failed: repository failed before approved patches were applied. Patch was not independently verified.',
      failureReason: timedOutReason ?? `Repository baseline failed: "${failedCmd.command}" failed before any patch was applied.`,
      commands: baseline.results,
      baselineCommands: baseline.results,
    })
  }

  // --- Phase 2: apply ONLY approved patches to the sandbox clone ---
  const applyFailures: SandboxResult['applyFailures'] = []
  let approvedApplied = 0
  for (const patch of approved) {
    try {
      const res = await executor.applyPatch(workspace, patch)
      if (res.ok) {
        approvedApplied++
        events.push(ev('sandbox_patch_applied', `Applied ${patch.path}`, stamp()))
      } else {
        applyFailures.push({ path: patch.path, reason: res.reason || 'Approved patch could not be applied safely to sandbox workspace.' })
        events.push(ev('sandbox_patch_failed', `Failed to apply ${patch.path}: ${res.reason || 'unknown'}`, stamp()))
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      applyFailures.push({ path: patch.path, reason })
      events.push(ev('sandbox_patch_failed', `Failed to apply ${patch.path}: ${reason}`, stamp()))
    }
  }

  // No approved patch could be applied → cannot verify the change.
  if (approvedQueued > 0 && approvedApplied === 0) {
    await executor.cleanup(workspace).catch(() => undefined)
    return finish({
      status: 'failed',
      conclusion: 'patch_application_failed',
      conclusionMessage: 'Patch application failed: approved patch could not be safely applied to sandbox files.',
      failureReason: 'Approved patch could not be applied safely to sandbox workspace.',
      approvedApplied,
      failedToApply: applyFailures.length,
      applyFailures,
      commands: baseline.results,
      baselineCommands: baseline.results,
    })
  }

  // --- Phase 3: re-run verification commands with the patch applied ---
  const patched = await runPhase(verifyCommands)
  await executor.cleanup(workspace).catch(() => undefined)

  if (patched.firstFailure) {
    const timedOutReason = patched.timedOut
      ? `Sandbox command "${patched.firstFailure.command}" timed out after ${timeoutMs}ms.`
      : undefined
    return finish({
      status: 'failed',
      conclusion: 'patch_failed',
      conclusionMessage: 'Patch failed: baseline passed, but patched verification failed.',
      failureReason: timedOutReason ?? `Patched verification failed: "${patched.firstFailure.command}" failed after applying approved patches.`,
      approvedApplied,
      failedToApply: applyFailures.length,
      applyFailures,
      commands: baseline.results,
      baselineCommands: baseline.results,
      patchedCommands: patched.results,
    })
  }

  // Baseline passed, patched passed. If there were no applicable patches, say so.
  if (approvedQueued === 0) {
    return finish({
      status: 'passed',
      conclusion: 'inconclusive',
      conclusionMessage: 'Baseline passed; there were no approved patches to verify.',
      commands: baseline.results,
      baselineCommands: baseline.results,
      patchedCommands: patched.results,
    })
  }

  return finish({
    status: 'passed',
    conclusion: 'sandbox_passed',
    conclusionMessage:
      applyFailures.length > 0
        ? `Sandbox passed: baseline and patched verification passed (${applyFailures.length} approved patch(es) could not be applied).`
        : 'Sandbox passed: baseline and patched verification passed.',
    approvedApplied,
    failedToApply: applyFailures.length,
    applyFailures,
    commands: baseline.results,
    baselineCommands: baseline.results,
    patchedCommands: patched.results,
  })
}
