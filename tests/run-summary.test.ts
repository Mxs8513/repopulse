import { describe, expect, it } from 'vitest'
import { buildTimeline, summarizeRun, summaryLine } from '@/lib/agent/run-summary'
import type { AgentRun, DiffVerification, FilePatchProposal } from '@/lib/agent/types'

function ver(status: DiffVerification['status']): DiffVerification {
  return { status, score: status === 'passed' ? 100 : status === 'needs_review' ? 70 : 20, issues: [], passedChecks: [] }
}

function patch(p: Partial<FilePatchProposal>): FilePatchProposal {
  return {
    path: 'lib/x.ts',
    changeSummary: 's',
    reasoning: 'r',
    risk: 'low',
    proposedChange: '+x',
    groundedInContent: true,
    approval: 'pending',
    ...p,
  }
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  const now = '2026-06-13T10:00:00.000Z'
  return {
    runId: 'run_1',
    repo: 'facebook/react',
    task: 'Add caching to the repo API',
    status: 'diff_generated',
    intent: 'safe_code_change',
    retrievedFiles: [],
    plan: null,
    diff: null,
    verification: null,
    approvals: [],
    provider: 'openai',
    errors: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const fullDiff = {
  patches: [
    patch({ path: 'a.ts', approval: 'approved', verification: ver('passed') }),
    patch({ path: 'b.ts', approval: 'rejected', verification: ver('failed') }),
    patch({ path: 'c.ts', approval: 'pending', verification: ver('needs_review') }),
  ],
  skippedFiles: [],
  testsToRun: ['npm run test'],
  provider: 'openai' as const,
}

describe('summarizeRun', () => {
  it('derives approved / rejected / pending counts correctly', () => {
    const s = summarizeRun(run({ diff: fullDiff }))
    expect(s.proposed).toBe(3)
    expect(s.approved).toBe(1)
    expect(s.rejected).toBe(1)
    expect(s.pending).toBe(1)
  })

  it('derives verification counts and overall status (worst wins)', () => {
    const s = summarizeRun(run({ diff: fullDiff }))
    expect(s.verPassed).toBe(1)
    expect(s.verNeedsReview).toBe(1)
    expect(s.verFailed).toBe(1)
    expect(s.verificationStatus).toBe('failed')
  })

  it('reports null verification status when nothing was verified (old run)', () => {
    const s = summarizeRun(run({ diff: { ...fullDiff, patches: [patch({ verification: undefined })] } }))
    expect(s.verificationStatus).toBeNull()
  })

  it('rejected files are not counted as approved', () => {
    const s = summarizeRun(run({ diff: fullDiff }))
    // exactly one approved file, and it is not the rejected one
    expect(s.approved).toBe(1)
    expect(s.approved + s.rejected + s.pending).toBe(s.proposed)
  })

  it('handles a run with no diff', () => {
    const s = summarizeRun(run({ diff: null }))
    expect(s.proposed).toBe(0)
    expect(summaryLine(run({ diff: null }))).toBeNull()
  })

  it('builds a readable summary line', () => {
    expect(summaryLine(run({ diff: fullDiff }))).toBe(
      '3 proposed files · 1 approved · 1 rejected · 1 passed / 1 needs review / 1 failed'
    )
  })
})

describe('buildTimeline', () => {
  it('uses recorded events when present (full audit data)', () => {
    const r = run({
      events: [
        { type: 'plan_generated', message: 'Plan generated for facebook/react', at: '2026-06-13T10:00:00.000Z' },
        { type: 'diff_generated', message: 'Diff generated with 3 proposed file changes', at: '2026-06-13T10:01:00.000Z' },
        { type: 'file_approved', message: 'Approved a.ts', at: '2026-06-13T10:02:00.000Z' },
      ],
    })
    const { events, synthesized } = buildTimeline(r)
    expect(synthesized).toBe(false)
    expect(events).toHaveLength(3)
    expect(events[0].type).toBe('plan_generated')
  })

  it('synthesizes a timeline for an old run with no events', () => {
    const r = run({
      events: undefined,
      plan: { steps: ['do it'] } as AgentRun['plan'],
      diff: fullDiff,
      approvals: [{ filePath: 'a.ts', decision: 'approved', createdAt: '2026-06-13T10:05:00.000Z' }],
    })
    const { events, synthesized } = buildTimeline(r)
    expect(synthesized).toBe(true)
    expect(events.some((e) => e.type === 'plan_generated')).toBe(true)
    expect(events.some((e) => e.type === 'diff_generated')).toBe(true)
    expect(events.some((e) => e.type === 'file_approved')).toBe(true)
  })

  it('synthesizes a run_failed event for failed old runs', () => {
    const r = run({ events: [], status: 'failed', errors: ['GitHub rate limit exceeded'] })
    const { events } = buildTimeline(r)
    expect(events.some((e) => e.type === 'run_failed')).toBe(true)
  })

  it('returns an empty timeline (not a crash) for a bare run', () => {
    const { events, synthesized } = buildTimeline(run({ events: undefined }))
    expect(synthesized).toBe(true)
    expect(events).toEqual([])
  })
})
