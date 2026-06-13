/**
 * Package Manager and Workspace Detection.
 *
 * Infers package manager (npm/pnpm/yarn), workspace tool (turbo/nx),
 * and available scripts from package.json and lock files.
 */

export type PackageManager = 'npm' | 'pnpm' | 'yarn'
export type WorkspaceTool = 'pnpm_workspaces' | 'yarn_workspaces' | 'turbo' | 'nx' | 'lerna' | 'none'

export interface PackageManagerInfo {
  /** Detected or inferred package manager. */
  manager: PackageManager
  /** How it was detected (lockfile, config, or default). */
  detectionMethod: 'pnpm-lock' | 'yarn-lock' | 'npm-lock' | 'pnpm-config' | 'package-manager-field' | 'default'
  /** Workspace tool if detected. */
  workspaceTool: WorkspaceTool
  /** Available scripts in package.json (if provided). */
  availableScripts?: Record<string, string>
  /** Parsed packageManager field from package.json, if present. */
  packageManagerField?: string
  /** Exact version from packageManager field when available. */
  packageManagerVersion?: string
  /** Path to package.json if inferred from file paths. */
  packagePath?: string
}

/**
 * Detect package manager from lock files in the repository.
 * Order of preference: pnpm > yarn > npm.
 */
export function detectPackageManagerFromFiles(files: string[]): PackageManager {
  const fileLower = files.map((f) => f.toLowerCase())

  if (fileLower.some((f) => f.includes('pnpm-lock.yaml') || f.includes('pnpm-workspace.yaml'))) {
    return 'pnpm'
  }
  if (fileLower.some((f) => f.includes('yarn.lock'))) {
    return 'yarn'
  }
  if (fileLower.some((f) => f.includes('package-lock.json'))) {
    return 'npm'
  }

  // No lock file found; default to npm.
  return 'npm'
}

/**
 * Detect workspace tool from files.
 */
export function detectWorkspaceTool(
  files: string[],
  packageJson?: { workspaces?: string[] | { packages?: string[] }; pnpm?: { workspaces?: string[] } }
): WorkspaceTool {
  const fileLower = files.map((f) => f.toLowerCase())

  // Check for turbo.json or turbo.yml.
  if (fileLower.some((f) => f === 'turbo.json' || f === 'turbo.yml' || f === 'turbo.yaml')) {
    return 'turbo'
  }

  // Check for nx.json.
  if (fileLower.some((f) => f === 'nx.json')) {
    return 'nx'
  }

  // Check for lerna.json.
  if (fileLower.some((f) => f === 'lerna.json')) {
    return 'lerna'
  }

  // Check package.json workspaces field or pnpm.workspaces.
  if (packageJson) {
    if (packageJson.workspaces || packageJson.pnpm?.workspaces) {
      // Prefer more specific tool detection if available; fall back to workspaces.
      if (fileLower.some((f) => f.includes('pnpm-workspace.yaml'))) {
        return 'pnpm_workspaces'
      }
      return 'yarn_workspaces' // package.json workspaces is typical for yarn.
    }
  }

  return 'none'
}

/**
 * Extract available scripts from package.json.
 */
export function extractScripts(packageJson: unknown): Record<string, string> {
  if (!packageJson || typeof packageJson !== 'object') return {}
  const json = packageJson as Record<string, unknown>
  const scripts = json.scripts
  if (!scripts || typeof scripts !== 'object') return {}
  const result: Record<string, string> = {}
  for (const [name, cmd] of Object.entries(scripts)) {
    if (typeof cmd === 'string') result[name] = cmd
  }
  return result
}

/**
 * Infer which package in a monorepo a file belongs to from its path.
 * Example: path="packages/ui/src/Button.tsx" returns "packages/ui"
 */
export function inferPackagePath(filePath: string, workspaceTool: WorkspaceTool): string | undefined {
  if (workspaceTool === 'none') return undefined

  const parts = filePath.split('/')

  // Common patterns: packages/NAME, apps/NAME, modules/NAME, etc.
  const commonPrefixes = ['packages', 'apps', 'modules', 'libs']

  for (let i = 0; i < parts.length - 1; i++) {
    if (commonPrefixes.includes(parts[i]) && i + 1 < parts.length) {
      return parts.slice(0, i + 2).join('/')
    }
  }

  return undefined
}

/**
 * Detect the package manager from package.json "packageManager" field.
 */
export interface PackageManagerFieldInfo {
  manager: PackageManager
  version?: string
  raw: string
}

export function detectFromPackageManagerField(packageJson: unknown): PackageManagerFieldInfo | undefined {
  if (!packageJson || typeof packageJson !== 'object') return undefined
  const json = packageJson as Record<string, unknown>
  const field = json.packageManager
  if (typeof field !== 'string') return undefined
  const normalized = field.trim()
  const match = normalized.match(/^(pnpm|yarn|npm)(?:@([0-9]+(?:\.[0-9]+){0,2}))?$/)
  if (!match) return undefined
  return { manager: match[1] as PackageManager, version: match[2], raw: normalized }
}

/**
 * Full detection: infer package manager info from files and optional package.json.
 */
export function detectPackageManager(
  files: string[],
  packageJson?: Record<string, unknown>
): PackageManagerInfo {
  // Try explicit package.json field first.
  const explicit = packageJson ? detectFromPackageManagerField(packageJson) : undefined
  if (explicit) {
    return {
      manager: explicit.manager,
      detectionMethod: 'package-manager-field',
      workspaceTool: detectWorkspaceTool(files, packageJson as any),
      availableScripts: packageJson ? extractScripts(packageJson) : undefined,
      packageManagerField: explicit.raw,
      packageManagerVersion: explicit.version,
    }
  }

  // Detect from lock files.
  const manager = detectPackageManagerFromFiles(files)
  const detectionMethod: 'pnpm-lock' | 'yarn-lock' | 'npm-lock' | 'default' = files.some((f) =>
    f.toLowerCase().includes('pnpm-lock.yaml')
  )
    ? 'pnpm-lock'
    : files.some((f) => f.toLowerCase().includes('yarn.lock'))
      ? 'yarn-lock'
      : files.some((f) => f.toLowerCase().includes('package-lock.json'))
        ? 'npm-lock'
        : 'default'

  return {
    manager,
    detectionMethod,
    workspaceTool: detectWorkspaceTool(files, packageJson as any),
    availableScripts: packageJson ? extractScripts(packageJson) : undefined,
  }
}

/**
 * Get the install command for a package manager.
 */
export function getInstallCommand(manager: PackageManager): string {
  switch (manager) {
    case 'pnpm':
      return 'pnpm install'
    case 'yarn':
      return 'yarn install'
    case 'npm':
      return 'npm install'
  }
}

/**
 * Get the run script command for a package manager.
 */
export function getRunCommand(manager: PackageManager, script: string): string {
  switch (manager) {
    case 'pnpm':
      return `pnpm run ${script}`
    case 'yarn':
      return `yarn run ${script}`
    case 'npm':
      return `npm run ${script}`
  }
}

/**
 * Check if a script exists in the available scripts.
 */
export function hasScript(scripts: Record<string, string>, scriptName: string): boolean {
  return scriptName in scripts
}
