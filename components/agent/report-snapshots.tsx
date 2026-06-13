import type { ReactNode } from 'react'
import type { FinalReport, ReportFileEntry, FileRole } from '@/lib/agent/final-report'
import { SANDBOX_CONCLUSION_PLAIN, classifyFiles } from '@/lib/agent/final-report'
import { buildTimeline, EVENT_LABELS } from '@/lib/agent/run-summary'
import type { AgentEvent, AgentRun, FilePatchProposal, SandboxCommandResult } from '@/lib/agent/types'

type StepStatus = 'passed' | 'failed' | 'skipped' | 'not run' | 'inconclusive'

const FILE_ROLE_LABEL: Record<FileRole, string> = {
  considered: 'considered',
  approved: 'approved',
  rejected: 'rejected',
  pending: 'pending',
  applied: 'applied',
  not_applied: 'not applied',
  failed: 'failed verification',
}

const TONE: Record<string, string> = {
  passed: 'border-success/60 bg-success/10 text-success',
  approved: 'border-success/60 bg-success/10 text-success',
  applied: 'border-success/60 bg-success/10 text-success',
  safe: 'border-success/60 bg-success/10 text-success',
  completed: 'border-success/60 bg-success/10 text-success',
  ready: 'border-success/60 bg-success/10 text-success',
  failed: 'border-destructive/60 bg-destructive/10 text-destructive',
  rejected: 'border-destructive/60 bg-destructive/10 text-destructive',
  unsafe: 'border-destructive/60 bg-destructive/10 text-destructive',
  blocked: 'border-destructive/60 bg-destructive/10 text-destructive',
  'failed verification': 'border-destructive/60 bg-destructive/10 text-destructive',
  skipped: 'border-warning/60 bg-warning/10 text-warning',
  pending: 'border-warning/60 bg-warning/10 text-warning',
  needs_review: 'border-warning/60 bg-warning/10 text-warning',
  'not run': 'border-warning/60 bg-warning/10 text-warning',
  'not run yet': 'border-warning/60 bg-warning/10 text-warning',
  inconclusive: 'border-warning/60 bg-warning/10 text-warning',
  considered: 'border-primary/50 bg-primary/10 text-primary',
  informational: 'border-primary/50 bg-primary/10 text-primary',
  recommendations: 'border-primary/50 bg-primary/10 text-primary',
  recommendation: 'border-primary/50 bg-primary/10 text-primary',
  context: 'border-primary/50 bg-primary/10 text-primary',
  low: 'border-success/60 bg-success/10 text-success',
  medium: 'border-warning/60 bg-warning/10 text-warning',
  high: 'border-destructive/60 bg-destructive/10 text-destructive',
}

function ReportSection({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="report-section space-y-3 border-b border-border/70 pb-5">
      <div>
        <h4 className="text-base font-semibold text-foreground">{title}</h4>
        {intro && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{intro}</p>}
      </div>
      {children}
    </section>
  )
}

function SnapshotBadge({ label, tone }: { label: string; tone?: string }) {
  const normalized = (tone ?? label).toLowerCase()
  return (
    <span
      data-tone={normalized}
      className={`report-status-badge inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium uppercase ${TONE[normalized] ?? TONE['not run']}`}
    >
      {label}
    </span>
  )
}

function topLevel(path: string): string {
  const parts = path.split('/')
  return parts.length > 1 ? parts[0] : '(root)'
}

function groupedFiles(entries: ReportFileEntry[]) {
  const groups = new Map<string, ReportFileEntry[]>()
  for (const entry of entries) {
    const group = topLevel(entry.path)
    groups.set(group, [...(groups.get(group) ?? []), entry])
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([folder, files]) => ({ folder, files: files.sort((a, b) => a.path.localeCompare(b.path)) }))
}

function shortOutput(command: SandboxCommandResult): string {
  const output = command.stderrPreview || command.stdoutPreview
  if (!output) return command.status === 'passed' ? 'completed' : command.status
  return output.split('\n').find(Boolean)?.slice(0, 96) ?? command.status
}

function commandStatus(commands: SandboxCommandResult[], pattern: RegExp): SandboxCommandResult | null {
  return commands.find((command) => pattern.test(command.command)) ?? null
}

function displayBoolean(value: boolean | null): string {
  if (value === null) return 'not run'
  return value ? 'yes' : 'no'
}

function sandboxLabel(report: FinalReport): string {
  if (report.facts.sandboxStatus === 'not_run') return 'Not run yet'
  if (report.facts.conclusionStatus === 'sandbox_passed') return 'Passed'
  if (report.facts.conclusionStatus === 'inconclusive') return 'Inconclusive'
  return 'Failed'
}

function confidenceTone(score: number): string {
  if (score >= 80) return 'safe'
  if (score >= 60) return 'pending'
  return 'blocked'
}

function completenessTone(state: FinalReport['completeness']['state']): string {
  if (state === 'stakeholder_ready') return 'ready'
  if (state === 'sandbox_completed') return 'completed'
  if (state === 'review_completed') return 'pending'
  return 'not run'
}

function pipelineStatus(run: AgentRun): Record<'repo' | 'manager' | 'bootstrap' | 'baseline' | 'apply' | 'patched' | 'conclusion', StepStatus> {
  const sb = run.sandbox
  if (!sb || sb.status === 'not_run') {
    return {
      repo: 'not run' as StepStatus,
      manager: 'not run' as StepStatus,
      bootstrap: 'not run' as StepStatus,
      baseline: 'not run' as StepStatus,
      apply: 'not run' as StepStatus,
      patched: 'not run' as StepStatus,
      conclusion: 'not run' as StepStatus,
    }
  }

  const baselineFailed = sb.conclusion === 'baseline_failed'
  const setupFailed = sb.conclusion === 'setup_failed'
  const applicationFailed = sb.conclusion === 'patch_application_failed'
  const patchFailed = sb.conclusion === 'patch_failed'

  return {
    repo: sb.sourceType === 'unsupported' || sb.sourceType === 'unavailable' || setupFailed ? 'failed' : 'passed',
    manager: sb.packageManager?.manager ? 'passed' : setupFailed ? 'failed' : 'not run',
    bootstrap: !sb.packageManagerBootstrap
      ? ('not run' as StepStatus)
      : !sb.packageManagerBootstrap.ok
        ? ('failed' as StepStatus)
        : sb.packageManagerBootstrap.bootstrapped
          ? ('passed' as StepStatus)
          : ('skipped' as StepStatus),
    baseline: baselineFailed || setupFailed ? 'failed' : (sb.baselineCommands?.length ?? sb.commands?.length ?? 0) > 0 ? 'passed' : 'not run',
    apply: baselineFailed || setupFailed ? 'skipped' : applicationFailed ? 'failed' : (sb.approvedApplied ?? 0) > 0 ? 'passed' : 'not run',
    patched: patchFailed ? 'failed' : sb.conclusion === 'sandbox_passed' ? 'passed' : baselineFailed || applicationFailed || setupFailed ? 'skipped' : 'not run',
    conclusion: sb.conclusion === 'sandbox_passed' ? 'passed' : sb.conclusion === 'inconclusive' ? 'inconclusive' : 'failed',
  }
}

function eventText(event: AgentEvent): string {
  return `${new Date(event.at).toLocaleString()} - ${EVENT_LABELS[event.type] ?? event.type}: ${event.message}`
}

function fileDecisionReason(run: AgentRun, patch: FilePatchProposal): string {
  if (patch.approval === 'approved') {
    return patch.verification?.status === 'passed'
      ? `Approved because this file matched the requested ${/(\.|\/)(test|spec)[./]|\b__tests__\b/i.test(patch.path) ? 'test target' : 'target'} and passed deterministic verification.`
      : 'Approved by human review because this file was considered relevant to the requested change.'
  }
  if (patch.approval === 'rejected') {
    if (run.plan?.constraints.includes('test_only') && !/(\.|\/)(test|spec)[./]|\b__tests__\b/i.test(patch.path)) {
      return 'Rejected because this source-file proposal was outside a test-only request.'
    }
    if (patch.verification?.status === 'failed') {
      return 'Rejected because this proposal failed deterministic patch verification or did not match the declared patch path.'
    }
    return 'Rejected because human review determined this file was outside the accepted scope for this request.'
  }
  return 'Pending review. This file was not eligible for sandbox verification until a human decision is recorded.'
}

export function CodebaseMapSnapshot({ run }: { run: AgentRun }) {
  const groups = groupedFiles(classifyFiles(run))
  return (
    <ReportSection
      title="Codebase Map / Architecture Snapshot"
      intro="This snapshot shows the parts of the codebase RepoPulse considered. Approved files were allowed to move forward; rejected files were intentionally blocked from sandbox verification."
    >
      {groups.length === 0 ? (
        <p className="report-empty-state text-sm text-muted-foreground">No files were considered for this run.</p>
      ) : (
        <div className="report-map-grid grid gap-4 md:grid-cols-2">
          {groups.map((group) => (
            <div key={group.folder} className="report-map-group border-l-2 border-primary/60 pl-3">
              <p className="mb-2 font-mono text-sm font-semibold text-foreground">{group.folder}/</p>
              <ul className="space-y-2">
                {group.files.map((file) => (
                  <li key={file.path} className="flex flex-wrap items-center gap-2 text-sm">
                    <code className="min-w-0 flex-1 truncate text-xs text-foreground">{file.path}</code>
                    <SnapshotBadge label={FILE_ROLE_LABEL[file.role]} tone={file.role === 'failed' ? 'failed verification' : file.role} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </ReportSection>
  )
}

export function StakeholderSummaryCards({ report }: { report: FinalReport }) {
  const sandboxTone = report.facts.conclusionStatus === 'sandbox_passed' ? 'passed' : report.facts.conclusionStatus === 'not_run' ? 'not run' : 'failed'

  return (
    <ReportSection title="Executive One-Page Summary">
      <div className="report-exec-grid grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase text-muted-foreground">Repository</dt>
              <dd className="mt-1 break-words text-sm font-semibold text-foreground">{report.facts.repo}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-muted-foreground">Request</dt>
              <dd className="mt-1 break-words text-sm font-semibold text-foreground">{report.facts.request}</dd>
            </div>
          </dl>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Business Summary</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">{report.businessSummary}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Final Conclusion</p>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-foreground">{report.facts.conclusion}</p>
          </div>
          <div className="report-callout border-l-4 border-primary pl-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Recommended Next Action</p>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-foreground">{report.recommendations[0]}</p>
          </div>
        </div>
        <div className="report-status-summary space-y-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Status Summary</p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
              <span className="text-muted-foreground">Human review</span>
              <SnapshotBadge label={report.facts.approvalStatus} tone="context" />
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
              <span className="text-muted-foreground">Sandbox</span>
              <SnapshotBadge label={sandboxLabel(report)} tone={sandboxTone} />
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
              <span className="text-muted-foreground">Patch tested</span>
              <SnapshotBadge label={report.facts.patchTestedInSandbox ? 'yes' : 'no'} tone={report.facts.patchTestedInSandbox ? 'passed' : 'not run'} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Confidence</span>
              <SnapshotBadge label={`${report.confidence.score}%`} tone={confidenceTone(report.confidence.score)} />
            </div>
          </div>
        </div>
      </div>
    </ReportSection>
  )
}

export function BusinessSummarySnapshot({ report }: { report: FinalReport }) {
  return (
    <section className="report-cover-page space-y-8 border-b-4 border-primary pb-8">
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">RepoPulse</p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-foreground">Engineering Verification Report</h1>
          <p className="text-sm text-muted-foreground">Prepared by: RepoPulse Agent</p>
        </div>
        <SnapshotBadge label={report.completeness.label} tone={completenessTone(report.completeness.state)} />
      </div>
      <dl className="report-cover-facts grid gap-x-8 gap-y-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Repository</p>
          <p className="mt-1 break-words text-sm font-semibold text-foreground">{report.facts.repo}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Request</p>
          <p className="mt-1 break-words text-sm font-semibold text-foreground">{report.facts.request}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Generated</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{new Date(report.generatedAt).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Final conclusion</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{report.facts.conclusion}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Confidence score</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{report.confidence.score}%</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Recommended next action</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{report.recommendations[0]}</p>
        </div>
      </dl>
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        This report summarizes how RepoPulse evaluated the requested change, which files were reviewed, what human
        decisions were made, and what verification still needs to happen before PR creation.
      </p>
    </section>
  )
}

export function CauseImpactSnapshot({ run, report }: { run: AgentRun; report: FinalReport }) {
  const conclusion = report.facts.conclusionStatus
  const analysis =
    conclusion === 'baseline_failed'
      ? {
          cause: 'Likely cause: repository setup, dependency, or existing test/build failure.',
          impact: 'Impact: the approved patch cannot be blamed until the baseline repository is healthy.',
          tone: 'pending',
        }
      : conclusion === 'patch_failed'
        ? {
            cause: 'Likely cause: the approved patch introduced a behavior, type, lint, or test failure.',
            impact: 'Impact: the patch should be revised before PR creation.',
            tone: 'failed',
          }
        : conclusion === 'sandbox_passed'
          ? {
              cause: 'Likely cause: no blocking verification issue detected.',
              impact: 'Impact: the change appears ready for guarded PR review.',
              tone: 'ready',
            }
          : conclusion === 'patch_application_failed'
            ? {
                cause: 'Likely cause: the approved patch could not be safely matched to sandbox files.',
                impact: 'Impact: regenerate the patch before relying on automated verification.',
                tone: 'blocked',
              }
            : conclusion === 'not_run'
              ? {
                  cause: 'Likely cause: sandbox verification has not been started for this run.',
                  impact: 'Impact: the change has not yet been proven by automated sandbox verification.',
                  tone: 'not run',
                }
              : conclusion === 'inconclusive'
                ? {
                    cause: 'Likely cause: the sandbox could not isolate whether the approved change caused the result.',
                    impact: 'Impact: rerun verification with a cleaner baseline or narrower commands.',
                    tone: 'inconclusive',
                  }
                : {
                    cause: 'Likely cause: sandbox could not prepare tooling, dependencies, secrets, services, or package manager requirements.',
                    impact: 'Impact: automated verification could not complete.',
                    tone: 'blocked',
                  }

  return (
    <ReportSection title="Cause / Impact Analysis">
      <div className="flex flex-wrap items-center gap-2">
        <SnapshotBadge label={analysis.tone === 'ready' ? 'READY FOR PR REVIEW' : analysis.tone.toUpperCase()} tone={analysis.tone} />
        <span className="text-xs text-muted-foreground">{run.repo}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded border border-border bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Likely cause</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{analysis.cause}</p>
        </div>
        <div className="rounded border border-border bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Impact</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{analysis.impact}</p>
        </div>
      </div>
    </ReportSection>
  )
}

export function KeyFindingsSnapshot({ report }: { report: FinalReport }) {
  const findings = report.keyFindings.slice(0, 5)
  return (
    <ReportSection title="Key Findings">
      <ul className="report-findings-grid grid gap-3 md:grid-cols-2">
        {findings.map((finding) => (
          <li key={finding} className="report-finding border-l-4 border-primary bg-muted/10 py-2 pl-3 text-sm text-foreground">
            <SnapshotBadge label={finding.toLowerCase().includes('rejected') ? 'reviewed' : finding.toLowerCase().includes('sandbox') ? sandboxLabel(report) : 'context'} tone={finding.toLowerCase().includes('sandbox') ? (report.facts.conclusionStatus === 'not_run' ? 'not run' : report.facts.conclusionStatus === 'sandbox_passed' ? 'passed' : 'failed') : 'context'} />
            <p className="mt-2 leading-relaxed">{finding}</p>
          </li>
        ))}
      </ul>
    </ReportSection>
  )
}

export function DiffReviewSnapshot({ run }: { run: AgentRun }) {
  const patches = run.diff?.patches ?? []
  return (
    <ReportSection
      title="File Decision Summary"
      intro="RepoPulse proposed changes across several files. A human reviewer approved only files that matched the requested target and rejected unrelated or unsafe proposals before sandbox verification."
    >
      {patches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No proposed files were generated.</p>
      ) : (
        <>
        <div className="report-diff-table overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">File</th>
                <th className="py-2 pr-3 font-medium">Proposed Area</th>
                <th className="py-2 pr-3 font-medium">Verification</th>
                <th className="py-2 pr-3 font-medium">Decision</th>
                <th className="py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {patches.map((patch) => (
                <tr key={patch.path} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3 font-mono text-xs text-foreground">{patch.path}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{patch.changeSummary}</td>
                  <td className="py-2 pr-3">
                    <SnapshotBadge label={patch.verification?.status ?? 'not run'} tone={patch.verification?.status === 'failed' ? 'failed' : patch.verification?.status ?? 'not run'} />
                  </td>
                  <td className="py-2 pr-3">
                    <SnapshotBadge label={patch.approval} tone={patch.approval} />
                  </td>
                  <td className="py-2 text-muted-foreground">{fileDecisionReason(run, patch)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="report-diff-print-summary">
          <table className="report-diff-print-table w-full text-left text-sm">
            <thead>
              <tr>
                <th>File</th>
                <th>Decision</th>
                <th>Verification</th>
                <th>Explanation</th>
              </tr>
            </thead>
            <tbody>
              {patches.map((patch) => (
                <tr key={patch.path}>
                  <td>
                    <code className="report-path report-diff-file-path">{patch.path}</code>
                  </td>
                  <td>
                    <SnapshotBadge label={patch.approval} tone={patch.approval} />
                  </td>
                  <td>
                    <SnapshotBadge label={patch.verification?.status ?? 'not run'} tone={patch.verification?.status === 'failed' ? 'failed' : patch.verification?.status ?? 'not run'} />
                  </td>
                  <td>{fileDecisionReason(run, patch)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="report-meaning-inline mt-3 text-sm leading-relaxed text-muted-foreground">
            What this means: this section shows the human approval gate. Only approved files are eligible for sandbox
            verification; rejected files are excluded from automated patch testing.
          </p>
        </div>
        </>
      )}
    </ReportSection>
  )
}

export function SandboxPipelineSnapshot({ run }: { run: AgentRun }) {
  const sb = run.sandbox
  const status = pipelineStatus(run)
  const steps: Array<{ label: string; status: StepStatus; detail: string }> = [
    { label: 'Repo cloned', status: status.repo, detail: sb?.sourceType ?? 'not run' },
    { label: 'Package manager detected', status: status.manager, detail: sb?.packageManager?.manager ?? 'not detected' },
    {
      label: 'Package manager bootstrapped',
      status: status.bootstrap,
      detail: sb?.packageManagerBootstrap?.bootstrapped ? sb.packageManagerBootstrap.method ?? 'bootstrapped' : 'already available or not run',
    },
    { label: 'Baseline verification', status: status.baseline, detail: `${sb?.baselineCommands?.length ?? sb?.commands?.length ?? 0} command(s)` },
    { label: 'Patch application', status: status.apply, detail: `${sb?.approvedApplied ?? 0} applied / ${sb?.failedToApply ?? 0} failed` },
    { label: 'Patched verification', status: status.patched, detail: `${sb?.patchedCommands?.length ?? 0} command(s)` },
    { label: 'Final conclusion', status: status.conclusion, detail: sb?.conclusion ? SANDBOX_CONCLUSION_PLAIN[sb.conclusion] : 'Sandbox not run' },
  ]

  return (
    <ReportSection title="Sandbox Verification Workflow">
      <ol className="grid gap-2 md:grid-cols-7">
        {steps.map((step) => (
          <li key={step.label} className="rounded border border-border bg-muted/20 p-3">
            <div className="mb-2">
              <SnapshotBadge label={step.status} />
            </div>
            <p className="text-sm font-medium text-foreground">{step.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>
          </li>
        ))}
      </ol>
    </ReportSection>
  )
}

export function VerificationComparisonSnapshot({ run }: { run: AgentRun }) {
  const baseline = run.sandbox?.baselineCommands ?? run.sandbox?.commands ?? []
  const patched = run.sandbox?.patchedCommands ?? []
  const rows: Array<{ label: string; pattern: RegExp }> = [
    { label: 'install', pattern: /\b(install|ci)\b/i },
    { label: 'build', pattern: /\bbuild\b/i },
    { label: 'test', pattern: /\btest\b/i },
    { label: 'lint', pattern: /\blint\b/i },
    { label: 'type-check', pattern: /\b(type-?check|tsc)\b/i },
  ]

  const cell = (command: SandboxCommandResult | null) =>
    command ? (
      <div className="space-y-1">
        <SnapshotBadge label={command.status} tone={command.status === 'failed' ? 'failed' : command.status} />
        <p className="text-xs text-muted-foreground">exit {command.exitCode ?? 'n/a'} - {shortOutput(command)}</p>
      </div>
    ) : (
      <SnapshotBadge label="not run" />
    )

  return (
    <ReportSection
      title="Baseline vs Patched Results"
      intro="Baseline checks run before approved changes. Patched checks run after approved changes. Comparing both helps identify whether a failure was already present or introduced by the change."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-3 font-medium">Command</th>
              <th className="py-2 pr-3 font-medium">Baseline</th>
              <th className="py-2 font-medium">Patched</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-border/60 align-top">
                <td className="py-2 pr-3 font-mono text-xs text-foreground">{row.label}</td>
                <td className="py-2 pr-3">{cell(commandStatus(baseline, row.pattern))}</td>
                <td className="py-2">{cell(commandStatus(patched, row.pattern))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportSection>
  )
}

export function FinalConclusionSnapshot({ report }: { report: FinalReport }) {
  const nextStep = report.recommendations[0] ?? 'Review the report and decide the next engineering action.'
  return (
    <ReportSection title="Final Conclusion">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded border border-border bg-muted/20 p-3 md:col-span-2">
          <p className="text-xs uppercase text-muted-foreground">Final sandbox conclusion</p>
          <p className="mt-1 text-base font-semibold text-foreground">{report.facts.conclusion}</p>
        </div>
        <div className="rounded border border-border bg-muted/20 p-3">
          <p className="text-xs uppercase text-muted-foreground">Confidence</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{report.confidence.score}%</p>
        </div>
        <div className="rounded border border-border bg-muted/20 p-3">
          <p className="text-xs uppercase text-muted-foreground">Patch tested</p>
          <p className="mt-1 text-sm font-medium text-foreground">{report.facts.patchTestedInSandbox ? 'yes' : 'no'}</p>
        </div>
        <div className="rounded border border-border bg-muted/20 p-3">
          <p className="text-xs uppercase text-muted-foreground">Baseline passed</p>
          <p className="mt-1 text-sm font-medium text-foreground">{displayBoolean(report.facts.baselinePassed)}</p>
        </div>
        <div className="rounded border border-border bg-muted/20 p-3">
          <p className="text-xs uppercase text-muted-foreground">Patched verification passed</p>
          <p className="mt-1 text-sm font-medium text-foreground">{displayBoolean(report.facts.patchedPassed)}</p>
        </div>
      </div>
      <div className="rounded border border-primary/40 bg-primary/5 p-3">
        <p className="text-xs uppercase text-muted-foreground">Recommended next step</p>
        <p className="mt-1 text-sm font-medium text-foreground">{nextStep}</p>
      </div>
      <div className="rounded border border-border bg-muted/20 p-3">
        <p className="text-xs uppercase text-muted-foreground">What this score means</p>
        <p className="mt-1 text-sm leading-relaxed text-foreground">{report.confidenceExplanation}</p>
      </div>
    </ReportSection>
  )
}

export function RecommendedNextActionsSnapshot({ report }: { report: FinalReport }) {
  return (
    <ReportSection title="Recommended Next Action">
      <ul className="space-y-2">
        {report.recommendations.map((recommendation) => (
          <li key={recommendation} className="rounded border border-primary/40 bg-primary/5 p-3 text-sm text-foreground">
            {recommendation}
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-muted-foreground">
        These recommendations are generated from the current sandbox conclusion and human review state.
      </p>
    </ReportSection>
  )
}

export function AuditTimelineSnapshot({ run, generatedAt }: { run: AgentRun; generatedAt: string }) {
  const { events } = buildTimeline(run)
  const reportEvent: AgentEvent = {
    type: 'verification_completed',
    message: 'Final engineering report generated',
    at: generatedAt,
  }
  const timeline = [...events, reportEvent].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  return (
    <ReportSection title="Audit Summary">
      <ol className="space-y-2">
        {timeline.map((event, index) => (
          <li key={`${event.type}-${event.at}-${index}`} className="flex gap-3 rounded border border-border bg-muted/20 p-3">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
            <p className="text-sm text-muted-foreground">{eventText(event)}</p>
          </li>
        ))}
      </ol>
    </ReportSection>
  )
}

export function WorkflowEvidenceSnapshot({ run }: { run: AgentRun }) {
  const { events } = buildTimeline(run)
  const byType = new Map(events.map((event) => [event.type, event]))
  const sandbox = run.sandbox
  const steps: Array<{ label: string; status: string; tone: string; event?: AgentEvent; detail: string }> = [
    { label: 'Plan', status: run.plan ? 'Completed' : 'Not run yet', tone: run.plan ? 'completed' : 'not run', event: byType.get('plan_generated'), detail: 'RepoPulse interpreted the request and planned the change.' },
    { label: 'Diff', status: run.diff ? 'Completed' : 'Not run yet', tone: run.diff ? 'completed' : 'not run', event: byType.get('diff_generated'), detail: 'Proposed file-level changes were generated for review.' },
    { label: 'Verification', status: run.diff?.patches.some((patch) => patch.verification) ? 'Completed' : 'Not run yet', tone: run.diff?.patches.some((patch) => patch.verification) ? 'completed' : 'not run', event: byType.get('verification_completed'), detail: 'Deterministic patch-quality checks were evaluated.' },
    { label: 'Human Approval', status: run.approvals.length > 0 ? 'Completed' : 'Pending', tone: run.approvals.length > 0 ? 'completed' : 'pending', event: run.approvals[0] ? { type: run.approvals[0].decision === 'approved' ? 'file_approved' : 'file_rejected', message: `${run.approvals.length} decision(s) recorded`, at: run.approvals[0].createdAt } : undefined, detail: 'Files were approved, rejected, or left pending by human review.' },
    { label: 'Sandbox', status: sandbox?.status && sandbox.status !== 'not_run' ? sandbox.status : 'Not run yet', tone: sandbox?.conclusion === 'sandbox_passed' ? 'passed' : sandbox?.status && sandbox.status !== 'not_run' ? 'failed' : 'not run', event: byType.get('sandbox_verification_started'), detail: sandbox?.status && sandbox.status !== 'not_run' ? 'Approved changes were tested in an isolated clone.' : 'Sandbox verification has not started yet.' },
    { label: 'Final Report', status: 'Completed', tone: 'completed', detail: 'This stakeholder report was generated from stored run data.' },
  ]

  return (
    <ReportSection title="Workflow Evidence">
      <ol className="report-workflow space-y-3">
        {steps.map((step) => (
          <li key={step.label} className="report-workflow-step grid gap-2 border-l-4 border-primary/70 pl-4 md:grid-cols-[10rem_1fr]">
            <div>
              <p className="text-sm font-semibold text-foreground">{step.label}</p>
              <p className="text-xs text-muted-foreground">{step.event ? new Date(step.event.at).toLocaleString() : 'No timestamp recorded'}</p>
            </div>
            <div>
              <SnapshotBadge label={step.status} tone={step.tone} />
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </ReportSection>
  )
}

export function VerificationPendingSnapshot({ report }: { report: FinalReport }) {
  return (
    <ReportSection title="Verification Status">
      <div className="report-callout border-l-4 border-warning pl-4">
        <SnapshotBadge label="Verification pending" tone="not run" />
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          Sandbox verification has not run yet. The approved patch has not been tested in an isolated clone. Run sandbox
          verification before PR creation.
        </p>
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Patch tested</dt><dd className="font-semibold text-foreground">No</dd></div>
        <div><dt className="text-muted-foreground">Baseline verification</dt><dd className="font-semibold text-foreground">Not run</dd></div>
        <div><dt className="text-muted-foreground">Patched verification</dt><dd className="font-semibold text-foreground">Not run</dd></div>
        <div><dt className="text-muted-foreground">Recommended action</dt><dd className="font-semibold text-foreground">{report.recommendations[0]}</dd></div>
      </dl>
    </ReportSection>
  )
}

export function PlanningSummarySnapshot({ run }: { run: AgentRun }) {
  const plan = run.plan
  return (
    <ReportSection title="Planning Summary">
      {plan ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-foreground">{plan.taskSummary}</p>
          {plan.steps.length > 0 && (
            <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
              {plan.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Scope</dt><dd className="font-semibold text-foreground">{plan.scope}</dd></div>
            <div><dt className="text-muted-foreground">Risk level</dt><dd className="font-semibold text-foreground">{plan.riskLevel}</dd></div>
            <div><dt className="text-muted-foreground">Plan confidence</dt><dd className="font-semibold text-foreground">{plan.confidence}</dd></div>
          </dl>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No planning details were recorded for this run.</p>
      )}
    </ReportSection>
  )
}

export function CandidateFilesSnapshot({ run }: { run: AgentRun }) {
  const files = run.retrievedFiles ?? []
  return (
    <ReportSection title="Candidate Files" intro="These files were considered during planning. They are not approved changes.">
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">No candidate files were recorded for this run.</p>
      ) : (
        <table className="report-candidate-table w-full table-fixed text-left text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-3 font-medium">File</th>
              <th className="py-2 pr-3 font-medium">Category</th>
              <th className="py-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.path} className="border-b border-border/60 align-top">
                <td className="py-2 pr-3"><code className="report-path text-xs text-foreground">{file.path}</code></td>
                <td className="py-2 pr-3 text-foreground">{file.category}</td>
                <td className="py-2 text-foreground">{file.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ReportSection>
  )
}

export function ProposedFilesPendingReviewSnapshot({ run, report }: { run: AgentRun; report: FinalReport }) {
  const patches = run.diff?.patches ?? []
  return (
    <ReportSection
      title="Proposed Files Pending Review"
      intro="These proposed files exist, but human approval has not been completed. They are not eligible for sandbox verification yet."
    >
      <ul className="space-y-2">
        {patches.map((patch) => (
          <li key={patch.path} className="border-l-4 border-warning pl-3 text-sm">
            <code className="report-path text-xs text-foreground">{patch.path}</code>
            <p className="mt-1 text-foreground">{patch.changeSummary}</p>
          </li>
        ))}
      </ul>
      <p className="report-meaning-inline mt-3 text-sm leading-relaxed text-muted-foreground">
        Next required step: {report.completeness.nextRequiredStep}.
      </p>
    </ReportSection>
  )
}

export function NextRequiredStepSnapshot({ report }: { report: FinalReport }) {
  return (
    <ReportSection title="Next Required Step">
      <div className="report-callout border-l-4 border-warning pl-4">
        <SnapshotBadge label={report.completeness.label} tone={completenessTone(report.completeness.state)} />
        <p className="mt-2 text-base font-semibold text-foreground">{report.completeness.nextRequiredStep}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Not ready for sandbox: this run needs proposed file changes and human approval before sandbox verification can provide meaningful evidence.
        </p>
      </div>
    </ReportSection>
  )
}

export function ReportVisualSnapshots({ run, report }: { run: AgentRun; report: FinalReport }) {
  const sandboxHasRun = Boolean(run.sandbox && run.sandbox.status !== 'not_run')
  const hasCommandData = Boolean((run.sandbox?.baselineCommands?.length ?? run.sandbox?.commands?.length ?? 0) > 0 || (run.sandbox?.patchedCommands?.length ?? 0) > 0)
  if (report.completeness.state === 'planning_only') {
    return (
      <div className="report-snapshots space-y-4">
        <BusinessSummarySnapshot report={report} />
        <PlanningSummarySnapshot run={run} />
        <CandidateFilesSnapshot run={run} />
        <NextRequiredStepSnapshot report={report} />
      </div>
    )
  }
  if (report.completeness.state === 'diff_generated') {
    return (
      <div className="report-snapshots space-y-4">
        <BusinessSummarySnapshot report={report} />
        <PlanningSummarySnapshot run={run} />
        <ProposedFilesPendingReviewSnapshot run={run} report={report} />
        <NextRequiredStepSnapshot report={report} />
      </div>
    )
  }
  return (
    <div className="report-snapshots space-y-4">
      <BusinessSummarySnapshot report={report} />
      <StakeholderSummaryCards report={report} />
      <KeyFindingsSnapshot report={report} />
      <WorkflowEvidenceSnapshot run={run} />
      <DiffReviewSnapshot run={run} />
      {sandboxHasRun ? (
        <>
          <SandboxPipelineSnapshot run={run} />
          {hasCommandData && <VerificationComparisonSnapshot run={run} />}
        </>
      ) : (
        <VerificationPendingSnapshot report={report} />
      )}
      <CauseImpactSnapshot run={run} report={report} />
      <RecommendedNextActionsSnapshot report={report} />
      <div className="report-section-divider py-2">
        <h3 className="text-base font-semibold text-foreground">Technical Appendix</h3>
        <p className="mt-1 text-sm text-muted-foreground">Detailed supporting evidence follows for engineering review.</p>
      </div>
      <CodebaseMapSnapshot run={run} />
      <AuditTimelineSnapshot run={run} generatedAt={report.generatedAt} />
    </div>
  )
}
