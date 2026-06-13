// Server-only real executor for sandbox verification. Creates an isolated temp
// workspace under the OS temp dir, writes approved patches into it as artifacts
// (never touching the real repo), and runs allowlisted commands with `spawn`
// WITHOUT a shell (no command injection) and a hard timeout.
//
// Note: proposed diffs are Stage-A conceptual patches, so this applies them as
// workspace artifacts rather than mutating a real checkout. Commands run for
// real against the workspace and capture real exit codes/output — until Phase 9
// produces directly-applicable patches, an empty workspace may legitimately
// fail at `npm install`, which is reported honestly rather than faked.

import { spawn } from 'node:child_process'
import { access, cp, mkdtemp, mkdir, readdir, rm, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import type { AllowedCommand, SandboxExecutor } from './sandbox'
import { ALLOWED_COMMANDS } from './sandbox'
import type { FilePatchProposal } from './types'

export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex')
}

/**
 * Resolve a patch target path INSIDE the sandbox root only. Blocks absolute
 * paths and any traversal that would escape the workspace. Returns null if the
 * resolved path is not strictly contained within the workspace.
 */
export function resolveInsideSandbox(workspace: string, relPath: string): string | null {
  if (!relPath || path.isAbsolute(relPath)) return null
  if (relPath.split(/[\\/]/).some((seg) => seg === '..')) return null
  const root = path.resolve(workspace)
  const resolved = path.resolve(root, relPath)
  // Must stay strictly inside the workspace root.
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null
  return resolved
}

/**
 * Apply an approved patch as a FULL-FILE REPLACEMENT inside the sandbox clone.
 * Never writes outside the sandbox root; never touches the original repo.
 */
async function applyFullFileReplacement(
  workspace: string,
  patch: FilePatchProposal
): Promise<{ ok: boolean; reason?: string }> {
  if (!patch.groundedInContent) {
    return { ok: false, reason: 'Patch is not grounded in real file content.' }
  }
  if (typeof patch.proposedContent !== 'string' || patch.proposedContent.length === 0) {
    return {
      ok: false,
      reason: 'Approved patch could not be applied safely to sandbox workspace: no full-file proposed content available.',
    }
  }

  const dest = resolveInsideSandbox(workspace, patch.path)
  if (!dest) {
    return { ok: false, reason: `Unsafe patch path rejected (absolute or path traversal): ${patch.path}` }
  }

  // The target file must already exist in the clone (we replace, never create).
  let current: string
  try {
    current = await readFile(dest, 'utf-8')
  } catch {
    return { ok: false, reason: `Target file does not exist in sandbox clone: ${patch.path}` }
  }

  // If a hash was recorded at generation time, the file must still match it
  // (guards against the clone having drifted from what the patch was built on).
  if (patch.originalContentHash) {
    const actual = sha256(current)
    if (actual !== patch.originalContentHash) {
      return {
        ok: false,
        reason: 'Original file hash mismatch — the sandbox file differs from the content the patch was generated against.',
      }
    }
  }

  try {
    await writeFile(dest, patch.proposedContent, 'utf-8')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

/** Map an allowlisted command string to argv (no shell interpolation). */
const COMMAND_ARGV: Record<AllowedCommand, string[]> = {
  'npm install': ['install', '--no-audit', '--no-fund'],
  'pnpm install': ['install'],
  'yarn install': ['install'],
  'npm run build': ['run', 'build'],
  'pnpm run build': ['run', 'build'],
  'yarn run build': ['run', 'build'],
  'npm run test': ['run', 'test'],
  'pnpm run test': ['run', 'test'],
  'yarn run test': ['run', 'test'],
  'npm run lint': ['run', 'lint'],
  'pnpm run lint': ['run', 'lint'],
  'yarn run lint': ['run', 'lint'],
  'npm run typecheck': ['run', 'typecheck'],
  'pnpm run typecheck': ['run', 'typecheck'],
  'yarn run typecheck': ['run', 'typecheck'],
  'npm run type-check': ['run', 'type-check'],
  'pnpm run type-check': ['run', 'type-check'],
  'yarn run type-check': ['run', 'type-check'],
}

const COREPACK_DEFAULT_VERSIONS: Record<'pnpm' | 'yarn', string> = {
  pnpm: 'latest',
  yarn: 'stable',
}

const DEFAULT_NPM_EXEC_PNPM_VERSION = '8.10.0'
const DEFAULT_NPM_EXEC_YARN_1_VERSION = '1.22.19'

function safeName(p: string): string {
  return p.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)
}

function buildNpmExecArgs(packageSpec: string, manager: string, managerArgs: string[]): string[] {
  return ['exec', '--yes', '--package', packageSpec, '--', manager, ...managerArgs]
}

function getFallbackPackageSpec(manager: string, version?: string): string | undefined {
  if (manager === 'pnpm') {
    return `pnpm@${version ?? DEFAULT_NPM_EXEC_PNPM_VERSION}`
  }

  if (manager === 'yarn') {
    if (!version) return undefined
    const major = version.split('.')[0]
    return major === '1' ? `yarn@${version}` : undefined
  }

  return undefined
}

function isYarn1Version(version?: string): boolean {
  if (!version) return false
  const major = version.split('.')[0]
  return major === '1'
}

function buildSandboxEnv(workspace: string): NodeJS.ProcessEnv {
  const cacheRoot = path.join(workspace, '.cache')
  return {
    ...process.env,
    CI: 'true',
    COREPACK_HOME: path.join(workspace, '.corepack'),
    XDG_CACHE_HOME: cacheRoot,
    npm_config_cache: path.join(cacheRoot, 'npm-cache'),
    PNPM_HOME: path.join(cacheRoot, 'pnpm-home'),
    PNPM_STORE_PATH: path.join(cacheRoot, 'pnpm-store'),
    YARN_CACHE_FOLDER: path.join(cacheRoot, 'yarn-cache'),
  }
}

async function runBinary(
  cwd: string,
  binary: string,
  args: string[],
  timeoutMs: number,
  env: NodeJS.ProcessEnv
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const child = spawn(binary, args, {
      cwd,
      shell: false,
      env,
    })
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      resolve({ code: null, stdout, stderr: stderr + '\nProcess timed out.' })
    }, timeoutMs)

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: null, stdout, stderr: stderr + `\n${err.message}` })
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

function getBootstrapTarget(packageManager: string, version?: string): string | undefined {
  if (version) {
    return `${packageManager}@${version}`
  }
  return COREPACK_DEFAULT_VERSIONS[packageManager as 'pnpm' | 'yarn']
}

export const nodeSandboxExecutor: SandboxExecutor = {
  async createWorkspace(runId: string, repositoryPath?: string): Promise<string> {
    const base = await mkdtemp(path.join(os.tmpdir(), `repopulse-sandbox-${safeName(runId)}-`))
    if (repositoryPath) {
      await cp(repositoryPath, base, {
        recursive: true,
        force: true,
        errorOnExist: false,
        filter: (src) => {
          const rel = path.relative(repositoryPath, src)
          if (!rel || rel === '') return true
          const parts = rel.split(path.sep)
          const skip = ['.git', 'node_modules', '.next', 'out', 'dist', '.env.local', '.env.test', '.env.development']
          return !skip.includes(parts[0])
        },
      })
    }
    await mkdir(path.join(base, 'proposed'), { recursive: true })
    return base
  },

  applyPatch: applyFullFileReplacement,

  async cloneRepository(
    repo: string,
    destination: string,
    timeoutMs: number
  ): Promise<{ path: string; cloned: boolean; reason?: string }> {
    const [owner, name] = repo.split('/')
    if (!owner || !name) {
      return { path: destination, cloned: false, reason: 'Invalid GitHub repository name.' }
    }

    await mkdir(path.dirname(destination), { recursive: true })

    const remoteUrl = `https://x-access-token@github.com/${owner}/${name}.git`
    const token = process.env.MY_GITHUB_PAT || process.env.GITHUB_TOKEN
    const scriptPath = path.join(os.tmpdir(), `repopulse-git-askpass-${safeName(repo)}-${Date.now()}.sh`)
    let askPassCreated = false
    const authEnv: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' }

    if (token) {
      const tokenEscaped = String(token)
      const scriptContent = `#!/bin/sh\ncat <<'REPOPULSE_TOKEN'\n${tokenEscaped}\nREPOPULSE_TOKEN\n`
      await writeFile(scriptPath, scriptContent, { mode: 0o700 })
      askPassCreated = true
      authEnv.GIT_ASKPASS = scriptPath
    }

    const args = ['clone', '--depth', '1', '--single-branch', remoteUrl, destination]
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
      let stdout = ''
      let stderr = ''
      let settled = false
      const child = spawn('git', args, {
        cwd: path.dirname(destination),
        shell: false,
        env: authEnv,
      })
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        child.kill('SIGKILL')
        resolve({ code: null, stdout, stderr: stderr + '\nClone timed out.' })
      }, timeoutMs)

      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      child.on('error', (err) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ code: null, stdout, stderr: stderr + `\n${err.message}` })
      })

      child.on('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ code, stdout, stderr })
      })
    })

    if (askPassCreated) {
      await rm(scriptPath, { force: true }).catch(() => undefined)
    }

    if (result.code !== 0) {
      const normalized = result.stderr.trim().replace(/\s+/g, ' ')
      const message = normalized || 'Git clone failed.'
      return { path: destination, cloned: false, reason: message }
    }

    return { path: destination, cloned: true }
  },

  async preparePackageManager(
    workspace: string,
    packageManager: { manager: string; packageManagerVersion?: string },
    timeoutMs: number
  ): Promise<{ ok: boolean; bootstrapped: boolean; method?: 'native' | 'corepack' | 'npm-exec-fallback'; command?: string; executionCommand?: string; packageSpec?: string; stdout?: string; stderr?: string; reason?: string }> {
    const env = buildSandboxEnv(workspace)
    const manager = packageManager.manager

    if (manager === 'npm') {
      const versionCheck = await runBinary(workspace, 'npm', ['--version'], timeoutMs, env)
      return {
        ok: versionCheck.code === 0,
        bootstrapped: false,
        method: 'native',
        command: 'npm --version',
        executionCommand: 'npm',
        stdout: versionCheck.stdout,
        stderr: versionCheck.stderr,
        reason: versionCheck.code === 0 ? undefined : 'npm binary not available in sandbox.',
      }
    }

    const versionCheck = await runBinary(workspace, manager, ['--version'], timeoutMs, env)
    if (versionCheck.code === 0) {
      return {
        ok: true,
        bootstrapped: false,
        method: 'native',
        command: `${manager} --version`,
        executionCommand: manager,
        stdout: versionCheck.stdout,
        stderr: versionCheck.stderr,
      }
    }

    const bootstrapTarget = getBootstrapTarget(manager, packageManager.packageManagerVersion)
    if (!bootstrapTarget) {
      return {
        ok: false,
        bootstrapped: false,
        method: 'corepack',
        reason: `Could not determine bootstrap target for ${manager}.`,
        stderr: versionCheck.stderr,
      }
    }

    const corepackCheck = await runBinary(workspace, 'corepack', ['--version'], timeoutMs, env)
    const corepackAvailable = corepackCheck.code === 0
    if (corepackAvailable) {
      const enableResult = await runBinary(workspace, 'corepack', ['enable'], timeoutMs, env)
      if (enableResult.code === 0) {
        const prepareResult = await runBinary(workspace, 'corepack', ['prepare', bootstrapTarget, '--activate'], timeoutMs, env)
        if (prepareResult.code === 0) {
          const managerVersionCheck = await runBinary(workspace, manager, ['--version'], timeoutMs, env)
          return {
            ok: managerVersionCheck.code === 0,
            bootstrapped: true,
            method: 'corepack',
            command: `corepack prepare ${bootstrapTarget} --activate`,
            executionCommand: manager,
            stdout: `${enableResult.stdout}\n${prepareResult.stdout}\n${managerVersionCheck.stdout}`,
            stderr: `${enableResult.stderr}${prepareResult.stderr}${managerVersionCheck.stderr}`,
            reason: managerVersionCheck.code === 0 ? undefined : `Bootstrapped ${manager} but ${manager} still failed to execute.`,
          }
        }
      }
    }

    const packageSpec = getFallbackPackageSpec(manager, packageManager.packageManagerVersion)
    if (!packageSpec) {
      const reason = manager === 'yarn' && packageManager.packageManagerVersion
        ? `Sandbox environment could not bootstrap yarn@${packageManager.packageManagerVersion}; modern Yarn requires Corepack or a prepared sandbox image.`
        : `Corepack was unavailable and npm-exec fallback is not supported for ${manager}.`
      return {
        ok: false,
        bootstrapped: false,
        method: corepackAvailable ? 'corepack' : 'npm-exec-fallback',
        command: corepackAvailable ? `corepack prepare ${bootstrapTarget} --activate` : 'corepack --version',
        executionCommand: undefined,
        packageSpec: undefined,
        stdout: corepackCheck.stdout,
        stderr: corepackCheck.stderr,
        reason,
      }
    }

    const fallbackCheck = await runBinary(workspace, 'npm', buildNpmExecArgs(packageSpec, manager, ['--version']), timeoutMs, env)
    if (fallbackCheck.code !== 0) {
      return {
        ok: false,
        bootstrapped: false,
        method: 'npm-exec-fallback',
        command: `npm exec --yes --package ${packageSpec} -- ${manager} --version`,
        executionCommand: `npm exec --yes --package ${packageSpec} -- ${manager}`,
        packageSpec,
        stdout: fallbackCheck.stdout,
        stderr: fallbackCheck.stderr,
        reason: 'Corepack was unavailable and npm-exec fallback failed.',
      }
    }

    return {
      ok: true,
      bootstrapped: true,
      method: 'npm-exec-fallback',
      command: `npm exec --yes --package ${packageSpec} -- ${manager} --version`,
      executionCommand: `npm exec --yes --package ${packageSpec} -- ${manager}`,
      packageSpec,
      stdout: fallbackCheck.stdout,
      stderr: fallbackCheck.stderr,
    }
  },

  async runCommand(
    workspace: string,
    command: AllowedCommand,
    timeoutMs: number,
    bootstrap?: { method?: 'native' | 'corepack' | 'npm-exec-fallback'; executionCommand?: string; packageSpec?: string }
  ): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; skipped?: boolean }> {
    // Defense in depth: refuse anything not on the allowlist.
    if (!ALLOWED_COMMANDS.includes(command)) {
      return { exitCode: null, stdout: '', stderr: `Command not allowlisted: ${command}`, timedOut: false }
    }

    const runScriptMatch = command.match(/^(npm|pnpm|yarn) run (.+)$/)
    if (runScriptMatch) {
      const script = runScriptMatch[2]
      try {
        const packageJson = JSON.parse(await readFile(path.join(workspace, 'package.json'), 'utf-8'))
        if (!packageJson?.scripts || typeof packageJson.scripts[script] !== 'string') {
          return {
            exitCode: null,
            stdout: '',
            stderr: `Script "${script}" is not defined in package.json.
`,
            timedOut: false,
            skipped: true,
          }
        }
      } catch {
        return {
          exitCode: null,
          stdout: '',
          stderr: `package.json not readable in sandbox workspace.
`,
          timedOut: false,
          skipped: true,
        }
      }
    }

    const argv = COMMAND_ARGV[command]
    let binary = command.split(' ')[0]
    let effectiveArgs = argv
    const env = buildSandboxEnv(workspace)

    if (bootstrap?.method === 'npm-exec-fallback' && bootstrap.executionCommand && bootstrap.packageSpec) {
      const manager = command.split(' ')[0]
      if (manager === 'pnpm' || manager === 'yarn') {
        effectiveArgs = buildNpmExecArgs(bootstrap.packageSpec, manager, argv)
        binary = 'npm'
      }
    }
    return new Promise((resolve) => {
      let stdout = ''
      let stderr = ''
      let settled = false
      const child = spawn(binary, argv, {
        cwd: workspace,
        shell: false,
        env: { ...env, NPM_CONFIG_FUND: 'false', NPM_CONFIG_AUDIT: 'false' },
      })
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        child.kill('SIGKILL')
        resolve({ exitCode: null, stdout, stderr, timedOut: true })
      }, timeoutMs)

      child.stdout?.on('data', (d) => {
        stdout += d.toString()
      })
      child.stderr?.on('data', (d) => {
        stderr += d.toString()
      })
      child.on('error', (err) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ exitCode: null, stdout, stderr: stderr + `\n${err.message}`, timedOut: false })
      })
      child.on('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ exitCode: code, stdout, stderr, timedOut: false })
      })
    })
  },

  async verifyRepositoryIdentity(workspace: string, expectedRepo: string): Promise<'verified' | 'unverified' | 'mismatched'> {
    try {
      const configPath = path.join(workspace, '.git', 'config')
      const content = await readFile(configPath, 'utf-8')
      const match = content.match(/\[remote "origin"\][^\[]*url\s*=\s*(.+)/i)
      if (!match) {
        return 'unverified'
      }
      const remoteUrl = match[1].trim().toLowerCase()
      const normalizedRepo = expectedRepo.toLowerCase()
      if (remoteUrl.includes(`/${normalizedRepo}.git`) || remoteUrl.includes(`/${normalizedRepo}`)) {
        return 'verified'
      }
      return 'mismatched'
    } catch {
      return 'unverified'
    }
  },

  async workspaceHasPackageJson(workspace: string): Promise<boolean> {
    try {
      await access(path.join(workspace, 'package.json'))
      return true
    } catch {
      return false
    }
  },

  async workspaceFiles(workspace: string): Promise<string[]> {
    try {
      return await readdir(workspace)
    } catch {
      return []
    }
  },

  async readPackageJson(workspace: string): Promise<Record<string, unknown> | undefined> {
    try {
      const content = await readFile(path.join(workspace, 'package.json'), 'utf-8')
      return JSON.parse(content)
    } catch {
      return undefined
    }
  },

  async cleanup(workspace: string): Promise<void> {
    if (!workspace) return
    await rm(workspace, { recursive: true, force: true })
  },
}
