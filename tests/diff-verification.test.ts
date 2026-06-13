import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { analyzePatch, verifyProposalPatches } from '@/lib/agent/diff-verification'
import type { FilePatchProposal } from '@/lib/agent/types'

function patch(overrides: Partial<FilePatchProposal> = {}): FilePatchProposal {
  return {
    path: 'lib/cache.ts',
    changeSummary: 'Add in-memory caching to the repo API',
    reasoning: 'Wraps the compute call with a Map-based cache keyed by request to cut repeated GitHub calls.',
    risk: 'low',
    proposedChange: '',
    groundedInContent: true,
    approval: 'pending',
    ...overrides,
  }
}

const TASK = 'Add caching to the repo API'

describe('analyzePatch — verification rules', () => {
  it('1. flags a "return true" placeholder body', () => {
    const v = analyzePatch(
      patch({ proposedChange: '+function isAuthorized() {\n+  return true;\n+}' }),
      { task: TASK }
    )
    expect(v.status).not.toBe('passed')
    expect(v.issues.some((i) => /return true/i.test(i.detail))).toBe(true)
  })

  it('2. fails a diff with a TODO / placeholder comment', () => {
    const v = analyzePatch(
      patch({ proposedChange: '+// TODO: implement the logic here\n+export function handler() {}' }),
      { task: TASK }
    )
    expect(v.status).toBe('failed')
    expect(v.issues.some((i) => i.severity === 'fail')).toBe(true)
  })

  it('3. flags a file unrelated to the request', () => {
    const v = analyzePatch(
      patch({ path: 'src/widgets/unrelated-widget.tsx', proposedChange: '+const x = 1;\n+console.log(x);' }),
      { task: TASK, affectedPaths: ['lib/cache.ts'] }
    )
    expect(v.status).not.toBe('passed')
    expect(v.issues.some((i) => i.id === 'unrelated')).toBe(true)
  })

  it('4. flags an unused exported function', () => {
    const v = analyzePatch(
      patch({ proposedChange: '+export function unusedHelper() {\n+  return 42;\n+}' }),
      { task: TASK }
    )
    expect(v.issues.some((i) => i.id === 'unused_export')).toBe(true)
    expect(v.status).not.toBe('passed')
  })

  it('flags an unguarded throw in a normal path', () => {
    const v = analyzePatch(
      patch({ proposedChange: '+export function load() {\n+  throw new Error("nope");\n+}\n+load();' }),
      { task: TASK }
    )
    expect(v.issues.some((i) => i.id === 'risky_throw')).toBe(true)
  })

  it('5. passes a clean, grounded diff with explanation', () => {
    const clean = patch({
      proposedChange:
        '--- a/lib/cache.ts\n+++ b/lib/cache.ts\n' +
        '+const store = new Map();\n' +
        '+export function getCached(key) {\n' +
        '+  if (store.has(key)) return store.get(key);\n' +
        '+  const value = compute(key);\n' +
        '+  store.set(key, value);\n' +
        '+  return value;\n' +
        '+}\n' +
        '+handler.use(getCached);',
    })
    const v = analyzePatch(clean, { task: TASK, affectedPaths: ['lib/cache.ts'], hasTestPlan: true })
    expect(v.status).toBe('passed')
    expect(v.issues).toHaveLength(0)
    expect(v.score).toBe(100)
  })
})

describe('verifyProposalPatches — proposal summary', () => {
  it('6. blocks Approve All when any file failed verification', () => {
    const { summary } = verifyProposalPatches(
      [
        patch({ path: 'lib/cache.ts', proposedChange: '+export function getCached(k){ return store.get(k); }\n+handler.use(getCached);' }),
        patch({ path: 'lib/auth.ts', proposedChange: '+// TODO: implement\n+return true;' }),
      ],
      { task: TASK, affectedPaths: ['lib/cache.ts', 'lib/auth.ts'], hasTestPlan: true }
    )
    expect(summary.failed).toBeGreaterThanOrEqual(1)
    expect(summary.canApproveAll).toBe(false)
  })

  it('attaches a verification result to every patch', () => {
    const { patches } = verifyProposalPatches([patch(), patch({ path: 'lib/x.ts' })], { task: TASK })
    expect(patches.every((p) => p.verification)).toBe(true)
  })

  it('a non-grounded patch fails', () => {
    const v = analyzePatch(
      patch({ groundedInContent: false, proposedChange: 'Need file content before proposing exact patch.' }),
      { task: TASK }
    )
    expect(v.status).toBe('failed')
  })
})

// --- Store-backed approval + audit log (needs a localStorage shim) ---------

describe('approval workflow + audit log', () => {
  let store: Map<string, string>
  let runStore: typeof import('@/lib/agent/run-store')

  beforeAll(async () => {
    store = new Map()
    ;(globalThis as Record<string, unknown>).window = globalThis
    ;(globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    runStore = await import('@/lib/agent/run-store')
  })

  beforeEach(() => store.clear())

  function makeRunWithDiff(patches: FilePatchProposal[]) {
    const run = runStore.createRun({ repo: 'o/r', task: TASK, intent: 'safe_code_change', provider: 'mock' })
    runStore.updateRun(run.runId, {
      diff: { patches, skippedFiles: [], testsToRun: ['npm test'], provider: 'mock' },
      status: 'diff_generated',
    })
    return run.runId
  }

  it('6b. run-store canApproveAll is false when a file failed', () => {
    const id = makeRunWithDiff([
      patch({ path: 'a.ts', verification: { status: 'passed', score: 100, issues: [], passedChecks: [] } }),
      patch({ path: 'b.ts', verification: { status: 'failed', score: 20, issues: [], passedChecks: [] } }),
    ])
    const run = runStore.getRun(id)!
    expect(runStore.canApproveAll(run)).toBe(false)
    const result = runStore.approveAllPatches(id)
    expect(result.ok).toBe(false)
    // blocked attempt is audited
    expect(runStore.getRun(id)!.events?.some((e) => e.type === 'approval_blocked')).toBe(true)
  })

  it('7. rejected files are excluded from the approved set', () => {
    const id = makeRunWithDiff([
      patch({ path: 'a.ts', verification: { status: 'passed', score: 100, issues: [], passedChecks: [] } }),
      patch({ path: 'b.ts', approval: 'rejected', verification: { status: 'passed', score: 100, issues: [], passedChecks: [] } }),
    ])
    const result = runStore.approveAllPatches(id)
    expect(result.ok).toBe(true)
    const run = runStore.getRun(id)!
    expect(run.diff!.patches.find((p) => p.path === 'a.ts')!.approval).toBe('approved')
    expect(run.diff!.patches.find((p) => p.path === 'b.ts')!.approval).toBe('rejected')
    expect(run.approvals.some((a) => a.filePath === 'b.ts' && a.decision === 'approved')).toBe(false)
  })

  it('8. audit log records verification and approval actions', () => {
    const id = makeRunWithDiff([
      patch({ path: 'a.ts', verification: { status: 'passed', score: 100, issues: [], passedChecks: [] } }),
    ])
    runStore.appendEvent(id, 'verification_completed', '1 passed, 0 need review, 0 failed.')
    runStore.addApproval(id, { filePath: 'a.ts', decision: 'approved', createdAt: new Date().toISOString() })
    const types = runStore.getRun(id)!.events!.map((e) => e.type)
    expect(types).toContain('verification_completed')
    expect(types).toContain('file_approved')
  })

  it('needs-review files require explicit confirmation for Approve All', () => {
    const id = makeRunWithDiff([
      patch({ path: 'a.ts', verification: { status: 'needs_review', score: 70, issues: [], passedChecks: [] } }),
    ])
    expect(runStore.approveAllPatches(id, { confirmedNeedsReview: false }).ok).toBe(false)
    expect(runStore.approveAllPatches(id, { confirmedNeedsReview: true }).ok).toBe(true)
  })
})
