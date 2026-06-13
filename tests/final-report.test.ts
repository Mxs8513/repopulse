import { describe, expect, it } from 'vitest'
import { buildFinalReport, classifyFiles } from '@/lib/agent/final-report'
import type {
  AgentRun,
  DiffProposal,
  FilePatchProposal,
  SandboxCommandResult,
  SandboxConclusion,
  SandboxResult,
} from '@/lib/agent/types'

function command(overrides: Partial<SandboxCommandResult> = {}): SandboxCommandResult {
  return {
    command: 'npm run test',
    status: 'passed',
    exitCode: 0,
    durationMs: 1200,
    stdoutPreview: 'ok',
    stderrPreview: '',
    ...overrides,
  }
}

function patch(overrides: Partial<FilePatchProposal> = {}): FilePatchProposal {
  return {
    path: 'src/feature.ts',
    changeSummary: 'Update feature behavior',
    reasoning: 'The request targets this feature module.',
    risk: 'low',
    proposedChange: 'diff --git a/src/feature.ts b/src/feature.ts',
    groundedInContent: true,
    approval: 'approved',
    verification: { status: 'passed', score: 96, issues: [], passedChecks: ['grounded'] },
    originalContent: 'old',
    originalContentHash: 'abc',
    proposedContent: 'new',
    ...overrides,
  }
}

function diff(overrides: Partial<DiffProposal> = {}): DiffProposal {
  return {
    provider: 'openai',
    patches: [
      patch({ path: 'src/feature.ts', approval: 'approved' }),
      patch({
        path: 'src/unrelated.ts',
        approval: 'rejected',
        changeSummary: 'Unrelated cleanup',
        reasoning: 'Rejected during review.',
      }),
    ],
    skippedFiles: [],
    testsToRun: ['npm run test'],
    ...overrides,
  }
}

function sandbox(conclusion: SandboxConclusion, overrides: Partial<SandboxResult> = {}): SandboxResult {
  const failed = conclusion !== 'sandbox_passed'
  return {
    status: failed ? 'failed' : 'passed',
    conclusion,
    conclusionMessage: `Sandbox conclusion: ${conclusion}`,
    workspaceId: 'repopulse-sandbox-run_1',
    approvedQueued: 1,
    approvedApplied: conclusion === 'baseline_failed' || conclusion === 'patch_application_failed' ? 0 : 1,
    failedToApply: conclusion === 'patch_application_failed' ? 1 : 0,
    excludedPatches: 1,
    applyFailures:
      conclusion === 'patch_application_failed'
        ? [{ path: 'src/feature.ts', reason: 'hash mismatch' }]
        : [],
    baselineCommands:
      conclusion === 'baseline_failed'
        ? [command({ status: 'failed', exitCode: 1, stderrPreview: 'baseline failed' })]
        : [command({ command: 'npm run lint' })],
    patchedCommands:
      conclusion === 'patch_failed'
        ? [command({ status: 'failed', exitCode: 1, stderrPreview: 'patched failed' })]
        : conclusion === 'sandbox_passed'
          ? [command({ command: 'npm run test' })]
          : [],
    commands:
      conclusion === 'baseline_failed'
        ? [command({ status: 'failed', exitCode: 1, stderrPreview: 'baseline failed' })]
        : [command({ command: 'npm run lint' })],
    durationMs: 2500,
    sourceRepoPath: '/tmp/repopulse/source',
    sourceType: 'local_checkout',
    repoIdentityVerified: true,
    packageManager: {
      manager: 'npm',
      detectionMethod: 'npm-lock',
      workspaceTool: 'none',
      availableScripts: { test: 'vitest run', lint: 'eslint .' },
    },
    packageManagerBootstrap: { ok: true, bootstrapped: false, command: 'npm --version' },
    startedAt: '2026-06-13T10:00:00.000Z',
    completedAt: '2026-06-13T10:01:00.000Z',
    ...overrides,
  }
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  const now = '2026-06-13T10:00:00.000Z'
  return {
    runId: 'run_1',
    repo: 'acme/repopulse-demo',
    task: 'Add deterministic final report',
    status: 'approved',
    intent: 'safe_code_change',
    retrievedFiles: [
      {
        path: 'src/feature.ts',
        category: 'service_or_lib',
        score: 0.95,
        reason: 'Primary implementation file',
      },
      {
        path: 'README.md',
        category: 'documentation',
        score: 0.4,
        reason: 'Context for usage',
      },
    ],
    plan: {
      taskSummary: 'Create a final engineering report.',
      steps: ['Inspect run data', 'Build report', 'Export markdown'],
      affectedFiles: [],
      assumptions: ['Run data is the source of truth.'],
      risks: ['Report could overstate sandbox results.'],
      riskLevel: 'low',
      scope: 'frontend',
      testPlan: ['npm run test'],
      rollbackPlan: ['Remove report component.'],
      confidence: 'high',
      provider: 'openai',
      constraints: ['no_breaking_changes'],
    },
    diff: diff(),
    verification: {
      repoType: 'next',
      commands: [{ command: 'npm run test', purpose: 'unit tests', exists: true, source: 'package.json' }],
      manualInstructions: [],
      notes: [],
    },
    approvals: [
      { filePath: 'src/feature.ts', decision: 'approved', createdAt: now },
      { filePath: 'src/unrelated.ts', decision: 'rejected', createdAt: now },
    ],
    provider: 'openai',
    errors: [],
    events: [{ type: 'plan_generated', message: 'Plan generated', at: now }],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function reportFor(conclusion: SandboxConclusion) {
  return buildFinalReport({
    run: run({ sandbox: sandbox(conclusion) }),
    generatedAt: '2026-06-13T11:00:00.000Z',
  })
}

describe('buildFinalReport', () => {
  it('generates a sandbox_passed report with deterministic facts and markdown export', () => {
    const report = reportFor('sandbox_passed')
    expect(report.summaryMode).toBe('deterministic')
    expect(report.aiPolished).toBe(false)
    expect(report.facts.patchTestedInSandbox).toBe(true)
    expect(report.facts.baselinePassed).toBe(true)
    expect(report.facts.patchedPassed).toBe(true)
    expect(report.markdown).toContain('# Engineering Report')
    expect(report.markdown).toContain('## 1. Executive Summary')
    expect(report.markdown).toContain('## 7. Sandbox Verification Summary')
    expect(report.markdown).toContain('## Business Summary')
    expect(report.markdown).toContain('## Key Findings')
    expect(report.markdown).toContain('## 11. Recommended Next Actions')
  })

  it('generates a baseline_failed report without blaming the patch', () => {
    const report = reportFor('baseline_failed')
    expect(report.facts.baselinePassed).toBe(false)
    expect(report.facts.patchedPassed).toBeNull()
    expect(report.narrative).toContain('repository baseline failed before the patch could be independently judged')
    expect(report.recommendations).toContain('Recommended next step: fix repository baseline setup or existing failures before evaluating patch impact.')
  })

  it('generates a patch_failed report with separated patched command failure', () => {
    const report = reportFor('patch_failed')
    const commandSection = report.sections.find((s) => s.id === 'command-results')
    expect(commandSection?.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'commands', phase: 'Baseline' }),
        expect.objectContaining({ kind: 'commands', phase: 'Patched' }),
      ])
    )
    expect(report.facts.baselinePassed).toBe(true)
    expect(report.facts.patchedPassed).toBe(false)
    expect(report.markdown).toContain('patched failed')
  })

  it('generates a patch_application_failed report and marks failed files', () => {
    const r = run({ sandbox: sandbox('patch_application_failed') })
    const report = buildFinalReport({ run: r, generatedAt: '2026-06-13T11:00:00.000Z' })
    expect(report.facts.patchTestedInSandbox).toBe(false)
    expect(report.markdown).toContain('Could not apply src/feature.ts: hash mismatch')
    expect(classifyFiles(r)).toContainEqual(
      expect.objectContaining({ path: 'src/feature.ts', role: 'failed' })
    )
  })

  it('works when sandbox verification has not run', () => {
    const report = buildFinalReport({ run: run({ sandbox: null }), generatedAt: '2026-06-13T11:00:00.000Z' })
    expect(report.facts.conclusionStatus).toBe('not_run')
    expect(report.facts.baselinePassed).toBeNull()
    expect(report.markdown).toContain('Sandbox verification has not been run')
    expect(report.confidenceExplanation).toContain('sandbox verification has not yet been completed')
    expect(report.recommendations[0]).toContain('run sandbox verification')
  })

  it('generates stakeholder-readable business summary and key findings', () => {
    const report = reportFor('sandbox_passed')
    expect(report.businessSummary).toContain('The user requested')
    expect(report.businessSummary).toContain('required human approval')
    expect(report.keyFindings.some((finding) => finding.includes('Human review outcome'))).toBe(true)
    expect(report.keyFindings.some((finding) => finding.includes('Recommended next action'))).toBe(true)
  })

  it('includes rejected and considered files in the architecture snapshot', () => {
    const entries = classifyFiles(run({ sandbox: sandbox('sandbox_passed') }))
    expect(entries).toContainEqual(expect.objectContaining({ path: 'src/unrelated.ts', role: 'rejected' }))
    expect(entries).toContainEqual(expect.objectContaining({ path: 'README.md', role: 'considered' }))
  })

  it('includes safety and governance guardrails', () => {
    const report = reportFor('sandbox_passed')
    const safety = report.sections.find((s) => s.id === 'safety-governance')
    const text = JSON.stringify(safety)
    expect(text).toContain('No commit was created')
    expect(text).toContain('No push occurred')
    expect(text).toContain('No merge occurred')
    expect(text).toContain('The original repository was never modified')
    expect(text).toContain('Absolute paths were blocked')
  })

  it('keeps deterministic mode when AI is unavailable or explicitly blocked', () => {
    const r = run({ sandbox: sandbox('sandbox_passed') })
    const unavailable = buildFinalReport({ run: r, aiSummary: null })
    const blocked = buildFinalReport({ run: r, aiSummary: 'Polished text', deterministicReportOnly: true })
    expect(unavailable.summaryMode).toBe('deterministic')
    expect(blocked.summaryMode).toBe('deterministic')
    expect(blocked.narrative).not.toBe('Polished text')
  })

  it('uses AI summary only as optional narrative polish', () => {
    const report = buildFinalReport({ run: run({ sandbox: sandbox('sandbox_passed') }), aiSummary: 'Polished text' })
    expect(report.summaryMode).toBe('ai_polished')
    expect(report.narrative).toBe('Polished text')
    expect(report.facts.conclusionStatus).toBe('sandbox_passed')
  })

  it('changes confidence based on sandbox outcome', () => {
    const passed = reportFor('sandbox_passed').confidence.score
    const patchFailed = reportFor('patch_failed').confidence.score
    const baselineFailed = reportFor('baseline_failed').confidence.score
    expect(passed).toBeGreaterThan(patchFailed)
    expect(patchFailed).toBeGreaterThan(baselineFailed)
  })
})
