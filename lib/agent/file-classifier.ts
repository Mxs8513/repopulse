// Deterministic file classification. The Codebase Map is built from real file
// paths first — AI only ever summarizes on top of this, never invents structure.

import type {
  ArchitectureSummary,
  CodebaseMap,
  FileCategory,
  IndexedFile,
} from './types'

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  py: 'Python',
  rb: 'Ruby',
  go: 'Go',
  rs: 'Rust',
  java: 'Java',
  kt: 'Kotlin',
  swift: 'Swift',
  c: 'C',
  h: 'C',
  cpp: 'C++',
  cs: 'C#',
  php: 'PHP',
  css: 'CSS',
  scss: 'CSS',
  html: 'HTML',
  md: 'Markdown',
  mdx: 'Markdown',
  json: 'JSON',
  yml: 'YAML',
  yaml: 'YAML',
  toml: 'TOML',
  sql: 'SQL',
  sh: 'Shell',
  prisma: 'Prisma',
}

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'svg', 'bmp',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp3', 'mp4', 'webm', 'mov', 'wav',
  'zip', 'gz', 'tar', 'rar', '7z',
  'pdf', 'exe', 'dll', 'so', 'dylib', 'wasm', 'bin', 'jar', 'class', 'pyc',
])

export function getExtension(path: string): string {
  const base = path.split('/').pop() || ''
  const idx = base.lastIndexOf('.')
  return idx > 0 ? base.slice(idx + 1).toLowerCase() : ''
}

export function detectLanguage(path: string): string | null {
  return LANGUAGE_BY_EXTENSION[getExtension(path)] || null
}

export function isBinaryPath(path: string): boolean {
  return BINARY_EXTENSIONS.has(getExtension(path))
}

/**
 * Classify a repository file path into a coarse architectural category.
 * Order matters: more specific signals (tests, CI, API routes) win over
 * generic ones (frontend page/component).
 */
export function classifyFile(path: string): FileCategory {
  const lower = path.toLowerCase()
  const segments = lower.split('/')
  const filename = segments[segments.length - 1]
  const ext = getExtension(lower)

  // CI/CD
  if (
    lower.startsWith('.github/workflows/') ||
    lower.startsWith('.circleci/') ||
    lower.startsWith('.gitlab/') ||
    filename === '.gitlab-ci.yml' ||
    filename === 'jenkinsfile' ||
    filename === 'dockerfile' ||
    filename.startsWith('dockerfile.') ||
    filename === 'docker-compose.yml' ||
    filename === 'docker-compose.yaml' ||
    filename === 'vercel.json' ||
    filename === 'netlify.toml'
  ) {
    return 'ci_cd'
  }

  // Tests
  if (
    segments.some((s) => s === '__tests__' || s === 'test' || s === 'tests' || s === 'spec' || s === 'e2e' || s === 'cypress') ||
    /\.(test|spec)\.[a-z]+$/.test(filename) ||
    filename.startsWith('test_') ||
    (filename.endsWith('_test.go') || filename.endsWith('_test.py'))
  ) {
    return 'test'
  }

  // Database / models
  if (
    ext === 'prisma' ||
    ext === 'sql' ||
    segments.some((s) => s === 'migrations' || s === 'prisma' || s === 'models' || s === 'schema' || s === 'entities') ||
    filename === 'schema.rb' ||
    filename === 'drizzle.config.ts'
  ) {
    return 'database_model'
  }

  // Documentation
  if (
    ext === 'md' || ext === 'mdx' || ext === 'rst' || ext === 'txt' && filename !== 'requirements.txt' ||
    segments[0] === 'docs' ||
    filename === 'license'
  ) {
    return 'documentation'
  }

  // Config (package manifests, dotfiles, build config)
  if (
    filename === 'package.json' ||
    filename === 'package-lock.json' ||
    filename === 'pnpm-lock.yaml' ||
    filename === 'yarn.lock' ||
    filename === 'tsconfig.json' ||
    filename === 'components.json' ||
    filename === 'requirements.txt' ||
    filename === 'pyproject.toml' ||
    filename === 'setup.py' ||
    filename === 'cargo.toml' ||
    filename === 'go.mod' ||
    filename === 'gemfile' ||
    filename === 'makefile' ||
    filename.startsWith('.env') ||
    filename.startsWith('.eslint') ||
    filename.startsWith('.prettier') ||
    filename.startsWith('.babelrc') ||
    filename === '.gitignore' ||
    filename === '.npmrc' ||
    /^(next|vite|vitest|jest|tailwind|postcss|webpack|rollup|babel|eslint|prettier|playwright|svelte|nuxt|astro|remix)\.config\.(js|mjs|cjs|ts|mts)$/.test(filename) ||
    (ext === 'toml' || ext === 'yaml' || ext === 'yml') && segments.length === 1
  ) {
    return 'config'
  }

  // Backend API routes
  if (
    /(^|\/)app\/api\//.test(lower) ||
    /(^|\/)pages\/api\//.test(lower) ||
    segments.some((s) => s === 'api' || s === 'routes' || s === 'controllers' || s === 'endpoints' || s === 'handlers') &&
      ['ts', 'js', 'py', 'go', 'rb', 'java', 'php', 'rs'].includes(ext)
  ) {
    return 'backend_api'
  }

  // Frontend pages (Next.js App/Pages router and friends)
  if (
    (/(^|\/)app\//.test(lower) && /(page|layout|loading|error|not-found|template)\.(tsx|jsx|ts|js)$/.test(filename)) ||
    (/(^|\/)pages\//.test(lower) && ['tsx', 'jsx', 'ts', 'js', 'vue', 'svelte'].includes(ext)) ||
    (segments.some((s) => s === 'views' || s === 'screens') && ['tsx', 'jsx', 'vue', 'svelte'].includes(ext))
  ) {
    return 'frontend_page'
  }

  // Frontend components and hooks
  if (
    segments.some((s) => s === 'components' || s === 'component' || s === 'ui' || s === 'hooks') &&
    ['tsx', 'jsx', 'ts', 'js', 'vue', 'svelte', 'css', 'scss'].includes(ext)
  ) {
    return 'frontend_component'
  }

  // Services / shared libraries
  if (
    segments.some((s) => s === 'lib' || s === 'libs' || s === 'services' || s === 'utils' || s === 'helpers' || s === 'core' || s === 'src') &&
    ['ts', 'js', 'tsx', 'jsx', 'py', 'go', 'rb', 'java', 'rs', 'php'].includes(ext)
  ) {
    return 'service_or_lib'
  }

  return 'unknown'
}

export interface RawTreeEntry {
  path: string
  type: 'blob' | 'tree'
  size?: number
}

export function indexFiles(entries: RawTreeEntry[]): IndexedFile[] {
  return entries
    .filter((e) => e.type === 'blob')
    .filter((e) => !e.path.startsWith('node_modules/') && !e.path.includes('/node_modules/'))
    .filter((e) => !isBinaryPath(e.path))
    .map((e) => ({
      path: e.path,
      type: e.type,
      size: e.size ?? 0,
      category: classifyFile(e.path),
      language: detectLanguage(e.path),
    }))
}

export function countCategories(files: IndexedFile[]): Record<FileCategory, number> {
  const counts: Record<FileCategory, number> = {
    frontend_page: 0,
    frontend_component: 0,
    backend_api: 0,
    service_or_lib: 0,
    test: 0,
    config: 0,
    documentation: 0,
    ci_cd: 0,
    database_model: 0,
    unknown: 0,
  }
  for (const f of files) counts[f.category]++
  return counts
}

interface FrameworkSignal {
  name: string
  test: (paths: Set<string>, files: IndexedFile[]) => boolean
}

const FRAMEWORK_SIGNALS: FrameworkSignal[] = [
  { name: 'Next.js (App Router)', test: (p, f) => f.some((x) => /(^|\/)app\/.*(page|layout)\.(tsx|jsx|ts|js)$/.test(x.path)) },
  { name: 'Next.js (Pages Router)', test: (p, f) => f.some((x) => /(^|\/)pages\/_app\.(tsx|jsx|ts|js)$/.test(x.path)) },
  { name: 'React', test: (p, f) => f.some((x) => x.path.endsWith('.tsx') || x.path.endsWith('.jsx')) },
  { name: 'Vue', test: (p, f) => f.some((x) => x.path.endsWith('.vue')) },
  { name: 'Svelte', test: (p, f) => f.some((x) => x.path.endsWith('.svelte')) },
  { name: 'Tailwind CSS', test: (p, f) => f.some((x) => /tailwind\.config\.(js|cjs|mjs|ts)$/.test(x.path)) || p.has('postcss.config.mjs') },
  { name: 'Prisma', test: (p, f) => f.some((x) => x.path.endsWith('.prisma')) },
  { name: 'Docker', test: (p, f) => f.some((x) => x.path.toLowerCase().endsWith('dockerfile') || x.path.toLowerCase().includes('docker-compose')) },
  { name: 'GitHub Actions', test: (p, f) => f.some((x) => x.path.startsWith('.github/workflows/')) },
  { name: 'Python', test: (p) => p.has('pyproject.toml') || p.has('requirements.txt') || p.has('setup.py') },
  { name: 'Go', test: (p) => p.has('go.mod') },
  { name: 'Rust', test: (p) => p.has('Cargo.toml') },
]

export function detectFrameworks(files: IndexedFile[]): string[] {
  const paths = new Set(files.map((f) => f.path))
  const detected = FRAMEWORK_SIGNALS.filter((s) => s.test(paths, files)).map((s) => s.name)
  // Next.js implies React; drop the redundant generic entry.
  if (detected.some((d) => d.startsWith('Next.js')) && detected.includes('React')) {
    return detected.filter((d) => d !== 'React')
  }
  return detected
}

export function detectEntrypoints(files: IndexedFile[]): string[] {
  const candidates = [
    'app/page.tsx', 'app/layout.tsx', 'pages/index.tsx', 'pages/_app.tsx',
    'src/main.ts', 'src/main.tsx', 'src/index.ts', 'src/index.tsx', 'src/app.ts',
    'main.py', 'app.py', 'manage.py', 'main.go', 'cmd/main.go', 'src/main.rs', 'index.js', 'server.js',
  ]
  const paths = new Set(files.map((f) => f.path))
  return candidates.filter((c) => paths.has(c))
}

export function buildArchitectureSummary(repo: string, files: IndexedFile[]): ArchitectureSummary {
  const frameworks = detectFrameworks(files)
  const entrypoints = detectEntrypoints(files)
  const apiRoutes = files.filter((f) => f.category === 'backend_api').map((f) => f.path)
  const testFiles = files.filter((f) => f.category === 'test').map((f) => f.path)
  const configFiles = files
    .filter((f) => f.category === 'config' && !f.path.includes('lock'))
    .map((f) => f.path)

  const keyFiles = [
    ...entrypoints,
    ...apiRoutes.slice(0, 5),
    ...configFiles.filter((c) => ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml'].includes(c)),
    ...files.filter((f) => f.path.toLowerCase() === 'readme.md').map((f) => f.path),
  ]

  const parts: string[] = []
  if (frameworks.length > 0) {
    parts.push(`This repository appears to be a ${frameworks[0]} project`)
  } else {
    parts.push('This repository structure was indexed')
  }
  if (apiRoutes.length > 0) {
    const apiDir = apiRoutes[0].includes('app/api') ? 'app/api' : apiRoutes[0].split('/').slice(0, -1).join('/')
    parts.push(`with ${apiRoutes.length} API route file${apiRoutes.length === 1 ? '' : 's'} under ${apiDir}`)
  }
  const componentCount = files.filter((f) => f.category === 'frontend_component').length
  if (componentCount > 0) parts.push(`${componentCount} reusable UI/component files`)
  const libCount = files.filter((f) => f.category === 'service_or_lib').length
  if (libCount > 0) parts.push(`and ${libCount} service/library files`)
  let text = parts.join(', ') + '.'
  if (testFiles.length === 0) {
    text += ' No test files were detected.'
  } else {
    text += ` ${testFiles.length} test file${testFiles.length === 1 ? '' : 's'} detected.`
  }

  return {
    text,
    detectedFrameworks: frameworks,
    entrypoints,
    apiRoutes: apiRoutes.slice(0, 30),
    testFiles: testFiles.slice(0, 30),
    configFiles: configFiles.slice(0, 30),
    keyFiles: [...new Set(keyFiles)].slice(0, 15),
  }
}

export function buildCodebaseMap(
  repo: string,
  defaultBranch: string,
  entries: RawTreeEntry[],
  truncated: boolean,
  partial = false
): CodebaseMap {
  const files = indexFiles(entries)
  const totalBlobs = entries.filter((e) => e.type === 'blob').length
  return {
    repo,
    defaultBranch,
    truncated,
    partial: partial || truncated,
    indexedAt: new Date().toISOString(),
    files,
    filesSkipped: totalBlobs - files.length,
    categoryCounts: countCategories(files),
    architecture: buildArchitectureSummary(repo, files),
  }
}
