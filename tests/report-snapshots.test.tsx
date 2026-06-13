import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FinalEngineeringReport } from '@/components/agent/final-report'
import {
  AuditTimelineSnapshot,
  BusinessSummarySnapshot,
  CandidateFilesSnapshot,
  CauseImpactSnapshot,
  CodebaseMapSnapshot,
  DiffReviewSnapshot,
  FinalConclusionSnapshot,
  KeyFindingsSnapshot,
  PlanningSummarySnapshot,
  ReportVisualSnapshots,
  SandboxPipelineSnapshot,
  StakeholderSummaryCards,
  VerificationComparisonSnapshot,
} from '@/components/agent/report-snapshots'
import { buildFinalReport, classifyReportCompleteness } from '@/lib/agent/final-report'
import type {
  AgentRun,
  DiffProposal,
  FilePatchProposal,
  SandboxCommandResult,
  SandboxResult,
} from '@/lib/agent/types'

function command(overrides: Partial<SandboxCommandResult> = {}): SandboxCommandResult {
  return {
    command: 'npm run test',
    status: 'passed',
    exitCode: 0,
    durationMs: 900,
    stdoutPreview: 'tests passed',
    stderrPreview: '',
    ...overrides,
  }
}

function patch(overrides: Partial<FilePatchProposal> = {}): FilePatchProposal {
  return {
    path: 'app/page.tsx',
    changeSummary: 'Update dashboard page',
    reasoning: 'This file owns the visible workflow.',
    risk: 'low',
    proposedChange: 'diff --git a/app/page.tsx b/app/page.tsx',
    groundedInContent: true,
    approval: 'approved',
    verification: { status: 'passed', score: 94, issues: [], passedChecks: ['syntax'] },
    ...overrides,
  }
}

function diff(): DiffProposal {
  return {
    provider: 'openai',
    patches: [
      patch({ path: 'app/page.tsx', approval: 'approved', risk: 'low' }),
      patch({
        path: 'components/agent/old-panel.tsx',
        approval: 'rejected',
        risk: 'medium',
        verification: {
          status: 'failed',
          score: 41,
          issues: [{ id: 'path-mismatch', label: 'Path mismatch', severity: 'fail', detail: 'Patch path mismatch' }],
          passedChecks: [],
        },
        reasoning: 'Reviewer rejected this unrelated panel change.',
      }),
      patch({
        path: 'tests/pending.test.ts',
        approval: 'pending',
        risk: 'low',
        verification: undefined,
        reasoning: 'Still waiting for review.',
      }),
    ],
    skippedFiles: [],
    testsToRun: ['npm run test'],
  }
}

function sandbox(overrides: Partial<SandboxResult> = {}): SandboxResult {
  return {
    status: 'passed',
    conclusion: 'sandbox_passed',
    conclusionMessage: 'Baseline and patched verification both passed.',
    workspaceId: 'repopulse-sandbox-run_2',
    approvedQueued: 1,
    approvedApplied: 1,
    failedToApply: 0,
    excludedPatches: 2,
    applyFailures: [],
    baselineCommands: [
      command({ command: 'npm install', stdoutPreview: 'installed' }),
      command({ command: 'npm run build', stdoutPreview: 'built' }),
      command({ command: 'npm run test', stdoutPreview: 'baseline tests passed' }),
      command({ command: 'npm run lint', stdoutPreview: 'lint passed' }),
      command({ command: 'npx tsc --noEmit', stdoutPreview: 'types passed' }),
    ],
    patchedCommands: [
      command({ command: 'npm run build', stdoutPreview: 'patched build passed' }),
      command({ command: 'npm run test', stdoutPreview: 'patched tests passed' }),
      command({ command: 'npm run lint', stdoutPreview: 'patched lint passed' }),
      command({ command: 'npx tsc --noEmit', stdoutPreview: 'patched types passed' }),
    ],
    commands: [command({ command: 'npm install', stdoutPreview: 'installed' })],
    durationMs: 3000,
    sourceRepoPath: '/tmp/repopulse/source',
    sourceType: 'local_checkout',
    repoIdentityVerified: true,
    packageManager: {
      manager: 'npm',
      detectionMethod: 'npm-lock',
      workspaceTool: 'none',
      availableScripts: { build: 'next build', test: 'vitest run', lint: 'eslint .' },
    },
    packageManagerBootstrap: { ok: true, bootstrapped: false, command: 'npm --version' },
    startedAt: '2026-06-13T10:00:00.000Z',
    completedAt: '2026-06-13T10:03:00.000Z',
    ...overrides,
  }
}

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  const now = '2026-06-13T10:00:00.000Z'
  return {
    runId: 'run_2',
    repo: 'acme/repopulse-demo',
    task: 'Add visual evidence snapshots',
    status: 'approved',
    intent: 'safe_code_change',
    retrievedFiles: [
      { path: 'app/page.tsx', category: 'frontend_page', score: 0.99, reason: 'Primary affected page' },
      { path: 'lib/agent/final-report.ts', category: 'service_or_lib', score: 0.9, reason: 'Report builder context' },
    ],
    plan: {
      taskSummary: 'Add report snapshots.',
      steps: ['Build visual cards', 'Add print mode'],
      affectedFiles: [],
      assumptions: [],
      risks: [],
      riskLevel: 'low',
      scope: 'frontend',
      testPlan: ['npm run test'],
      rollbackPlan: ['Remove snapshot components.'],
      confidence: 'high',
      provider: 'openai',
      constraints: [],
    },
    diff: diff(),
    verification: null,
    sandbox: sandbox(),
    approvals: [
      { filePath: 'app/page.tsx', decision: 'approved', createdAt: now },
      { filePath: 'components/agent/old-panel.tsx', decision: 'rejected', createdAt: now },
    ],
    provider: 'openai',
    errors: [],
    events: [
      { type: 'plan_generated', message: 'Plan generated', at: '2026-06-13T10:00:00.000Z' },
      { type: 'diff_generated', message: 'Diff generated', at: '2026-06-13T10:01:00.000Z' },
      { type: 'file_approved', message: 'Approved app/page.tsx', at: '2026-06-13T10:02:00.000Z' },
      { type: 'file_rejected', message: 'Rejected components/agent/old-panel.tsx', at: '2026-06-13T10:02:30.000Z' },
      { type: 'sandbox_verification_started', message: 'Sandbox started', at: '2026-06-13T10:03:00.000Z' },
      { type: 'sandbox_patch_applied', message: 'Applied app/page.tsx', at: '2026-06-13T10:04:00.000Z' },
      { type: 'sandbox_verification_completed', message: 'Sandbox passed', at: '2026-06-13T10:05:00.000Z' },
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function html(node: React.ReactElement) {
  return renderToStaticMarkup(node)
}

function countOccurrences(text: string, pattern: string) {
  return text.split(pattern).length - 1
}

describe('report visual snapshots', () => {
  it('planning_only run shows Draft planning report and no stakeholder-ready badge', () => {
    const planningRun = run({ diff: null, sandbox: null, approvals: [] })
    const report = buildFinalReport({ run: planningRun, generatedAt: '2026-06-13T11:00:00.000Z' })
    const markup = html(<FinalEngineeringReport run={planningRun} documentMode />)

    expect(classifyReportCompleteness(planningRun).state).toBe('planning_only')
    expect(report.completeness.label).toBe('Draft planning report')
    expect(markup).toContain('Draft planning report')
    expect(markup).not.toContain('Stakeholder-ready report')
    expect(markup).not.toContain('File Decision Summary')
    expect(markup).not.toContain('Human review outcome: No proposed files')
  })

  it('planning_only report tells the user to generate a proposed diff', () => {
    const planningRun = run({ diff: null, sandbox: null, approvals: [] })
    const markup = html(<FinalEngineeringReport run={planningRun} documentMode />)
    expect(markup).toContain('No proposed file changes exist for this run yet')
    expect(markup).toContain('Generate Proposed Diff')
    expect(markup).toContain('Planning Summary')
    expect(markup).toContain('Candidate Files')
    expect(markup).not.toContain('Sandbox Verification Workflow')
  })

  it('review_completed sandbox-not-run shows Pre-verification report and hides sandbox pipeline', () => {
    const reviewedRun = run({ sandbox: null })
    const markup = html(<FinalEngineeringReport run={reviewedRun} documentMode />)
    expect(buildFinalReport({ run: reviewedRun }).completeness.label).toBe('Pre-verification report')
    expect(markup).toContain('Pre-verification report')
    expect(markup).toContain('Verification Status')
    expect(markup).not.toContain('Sandbox Verification Workflow')
    expect(markup).not.toContain('Baseline vs Patched Results')
  })

  it('sandbox_completed and sandbox_passed use truthful final labels', () => {
    const failedRun = run({
      sandbox: sandbox({
        status: 'failed',
        conclusion: 'patch_failed',
        patchedCommands: [command({ status: 'failed', exitCode: 1 })],
      }),
    })
    const passedRun = run()

    expect(buildFinalReport({ run: failedRun }).completeness.label).toBe('Final verification report')
    expect(buildFinalReport({ run: passedRun }).completeness.label).toBe('Stakeholder-ready report')
    expect(html(<FinalEngineeringReport run={passedRun} documentMode />)).toContain('Stakeholder-ready report')
  })

  it('Business Summary and stakeholder cards explain the report in plain English', () => {
    const report = buildFinalReport({ run: run(), generatedAt: '2026-06-13T11:00:00.000Z' })
    const summary = html(<BusinessSummarySnapshot report={report} />)
    const cards = html(<StakeholderSummaryCards report={report} />)
    expect(summary).toContain('RepoPulse')
    expect(summary).toContain('Engineering Verification Report')
    expect(summary).toContain('This report summarizes how RepoPulse evaluated the requested change')
    expect(cards).toContain('Business Summary')
    expect(cards).toContain('The user requested')
    expect(cards).toContain('Repository')
    expect(cards).toContain('Request')
    expect(cards).toContain('Final Conclusion')
    expect(cards).toContain('Confidence')
    expect(cards).toContain('Sandbox')
    expect(cards).toContain('Recommended Next Action')
  })

  it('Key Findings Snapshot includes confidence explanation and recommendation', () => {
    const report = buildFinalReport({ run: run({ sandbox: null }), generatedAt: '2026-06-13T11:00:00.000Z' })
    const markup = html(<KeyFindingsSnapshot report={report} />)
    expect(markup).toContain('Key Findings')
    expect(markup).toContain('Confidence:')
    expect(markup).toContain('sandbox verification has not yet been completed')
    expect(markup).toContain('Human review outcome')
  })

  it('Codebase Map Snapshot renders considered, approved, rejected, and pending files', () => {
    const markup = html(<CodebaseMapSnapshot run={run()} />)
    expect(markup).toContain('Codebase Map / Architecture Snapshot')
    expect(markup).toContain('lib/agent/final-report.ts')
    expect(markup).toContain('applied')
    expect(markup).toContain('rejected')
    expect(markup).toContain('pending')
  })

  it('Diff Review Snapshot renders decisions and verification status', () => {
    const markup = html(<DiffReviewSnapshot run={run()} />)
    expect(markup).toContain('File Decision Summary')
    expect(markup).toContain('app/page.tsx')
    expect(markup).toContain('passed')
    expect(markup).toContain('failed')
    expect(markup).toContain('Approved because this file matched the requested target and passed deterministic verification.')
    expect(markup).toContain('Rejected because this proposal failed deterministic patch verification or did not match the declared patch path.')
    expect(markup).toContain('report-diff-print-summary')
    expect(markup).toContain('report-diff-print-table')
    expect(markup).toContain('report-path')
    expect(markup).not.toContain('report-diff-print-card')
  })

  it('print PDF File Decision Summary uses compact rows without repeated file labels', () => {
    const longPath = 'packages/ai/src/ui-message-stream/get-response-ui-message-id.test.ts'
    const markup = html(
      <DiffReviewSnapshot
        run={run({
          diff: {
            ...diff(),
            patches: [
              patch({
                path: 'packages/provider/src/errors/get-error-message.test.ts',
                approval: 'approved',
                verification: { status: 'passed', score: 96, issues: [], passedChecks: ['grounded'] },
              }),
              patch({
                path: longPath,
                approval: 'rejected',
                verification: {
                  status: 'failed',
                  score: 20,
                  issues: [{ id: 'path-mismatch', label: 'Path mismatch', severity: 'fail', detail: 'Patch path mismatch' }],
                  passedChecks: [],
                },
              }),
            ],
          },
        })}
      />
    )
    expect(countOccurrences(markup.toUpperCase(), 'FILE PATH')).toBe(0)
    expect(markup).toContain('report-diff-print-table')
    expect(markup).toContain('report-diff-file-path')
    expect(markup).toContain(longPath)
    expect(markup).toContain('Approved because this file matched the requested test target and passed deterministic verification.')
    expect(markup).toContain('Rejected because this proposal failed deterministic patch verification or did not match the declared patch path.')
    expect(markup).toContain('Only approved files are eligible for sandbox')
  })

  it('Sandbox Pipeline Snapshot renders correct step statuses', () => {
    const markup = html(
      <SandboxPipelineSnapshot
        run={run({
          sandbox: sandbox({
            status: 'failed',
            conclusion: 'patch_failed',
            patchedCommands: [command({ command: 'npm run test', status: 'failed', exitCode: 1, stderrPreview: 'regression' })],
          }),
        })}
      />
    )
    expect(markup).toContain('Sandbox Verification Workflow')
    expect(markup).toContain('Repo cloned')
    expect(markup).toContain('Patch application')
    expect(markup).toContain('Patched verification')
    expect(markup).toContain('failed')
  })

  it('Verification Comparison Snapshot separates baseline and patched commands', () => {
    const markup = html(<VerificationComparisonSnapshot run={run()} />)
    expect(markup).toContain('Baseline vs Patched Results')
    expect(markup).toContain('Baseline')
    expect(markup).toContain('Patched')
    expect(markup).toContain('baseline tests passed')
    expect(markup).toContain('patched tests passed')
  })

  it('Final Conclusion Snapshot renders confidence and conclusion', () => {
    const report = buildFinalReport({ run: run(), generatedAt: '2026-06-13T11:00:00.000Z' })
    const markup = html(<FinalConclusionSnapshot report={report} />)
    expect(markup).toContain('Final Conclusion')
    expect(markup).toContain('Baseline and patched verification both passed.')
    expect(markup).toContain(`${report.confidence.score}%`)
    expect(markup).toContain('Recommended next step')
    expect(markup).toContain('What this score means')
  })

  it('Cause / Impact Analysis explains patch and baseline failures truthfully', () => {
    const patchFailedRun = run({
      sandbox: sandbox({
        status: 'failed',
        conclusion: 'patch_failed',
        patchedCommands: [command({ command: 'npm run test', status: 'failed', exitCode: 1 })],
      }),
    })
    const baselineFailedRun = run({
      sandbox: sandbox({
        status: 'failed',
        conclusion: 'baseline_failed',
        approvedApplied: 0,
        patchedCommands: [],
        baselineCommands: [command({ command: 'npm run test', status: 'failed', exitCode: 1 })],
      }),
    })
    const patchMarkup = html(
      <CauseImpactSnapshot run={patchFailedRun} report={buildFinalReport({ run: patchFailedRun })} />
    )
    const baselineMarkup = html(
      <CauseImpactSnapshot run={baselineFailedRun} report={buildFinalReport({ run: baselineFailedRun })} />
    )
    expect(patchMarkup).toContain('the approved patch introduced')
    expect(baselineMarkup).toContain('the approved patch cannot be blamed')
  })

  it('Audit Timeline Snapshot renders key events and report generation', () => {
    const markup = html(<AuditTimelineSnapshot run={run()} generatedAt="2026-06-13T11:00:00.000Z" />)
    expect(markup).toContain('Audit Summary')
    expect(markup).toContain('Plan generated')
    expect(markup).toContain('Diff generated')
    expect(markup).toContain('Approved app/page.tsx')
    expect(markup).toContain('Sandbox passed')
    expect(markup).toContain('Final engineering report generated')
  })

  it('snapshots are included in the Final Report', () => {
    const markup = html(<FinalEngineeringReport run={run()} />)
    expect(markup).toContain('Business Summary')
    expect(markup).toContain('Executive One-Page Summary')
    expect(markup).toContain('Key Findings')
    expect(markup).toContain('Workflow Evidence')
    expect(markup).toContain('What this means')
    expect(markup).toContain('Codebase Map / Architecture Snapshot')
    expect(markup).toContain('File Decision Summary')
    expect(markup).toContain('Sandbox Verification Workflow')
    expect(markup).toContain('Baseline vs Patched Results')
    expect(markup).toContain('Recommended Next Action')
    expect(markup).toContain('Cause / Impact Analysis')
    expect(markup).toContain('Audit Summary')
    expect(markup).not.toContain('Enhanced report wording limit reached')
    expect(markup).not.toContain('Improve Report Wording')
  })

  it('stakeholder-friendly not-run sandbox wording appears without blank sections', () => {
    const markup = html(<FinalEngineeringReport run={run({ sandbox: null })} documentMode />)
    expect(markup).toContain('Sandbox verification has not been run')
    expect(markup).toContain('Run sandbox verification before PR creation')
    expect(markup).toContain('Verification Status')
    expect(markup).not.toContain('Sandbox Verification Workflow')
    expect(markup).not.toContain('Baseline vs Patched Results')
    expect(markup).not.toContain('No commands run in this phase.')
    expect(markup).not.toContain('undefined')
  })

  it('print/export render path builds without browser screenshot tooling', () => {
    const report = buildFinalReport({ run: run(), generatedAt: '2026-06-13T11:00:00.000Z' })
    expect(() => html(<ReportVisualSnapshots run={run()} report={report} />)).not.toThrow()
  })

  it('planning snapshots render candidate files without final review sections', () => {
    const planningRun = run({ diff: null, sandbox: null, approvals: [] })
    expect(html(<PlanningSummarySnapshot run={planningRun} />)).toContain('Planning Summary')
    expect(html(<CandidateFilesSnapshot run={planningRun} />)).toContain('Primary affected page')
  })
})
