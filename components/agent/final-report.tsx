'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ReportVisualSnapshots } from '@/components/agent/report-snapshots'
import {
  buildFinalReport,
  type FinalReport,
  type ReportBlock,
  type ReportSection,
  type FileRole,
} from '@/lib/agent/final-report'
import type { AgentRun, SandboxCommandResult } from '@/lib/agent/types'
import { ChevronDown, ChevronRight, Copy, Check, Download, FileText, Printer } from 'lucide-react'

const ROLE_TONE: Record<FileRole, string> = {
  considered: 'text-muted-foreground border-border',
  approved: 'text-success border-success',
  rejected: 'text-destructive border-destructive',
  pending: 'text-warning border-warning',
  applied: 'text-success border-success',
  not_applied: 'text-muted-foreground border-border',
  failed: 'text-destructive border-destructive',
}

const ROLE_LABEL: Record<FileRole, string> = {
  considered: 'considered',
  approved: 'approved',
  rejected: 'rejected',
  pending: 'pending',
  applied: 'applied',
  not_applied: 'not applied',
  failed: 'failed',
}

function CommandLog({ phase, commands }: { phase: string; commands: SandboxCommandResult[] }) {
  const [open, setOpen] = useState<number | null>(null)
  if (commands.length === 0) {
    return (
      <div>
        <p className="text-sm font-medium text-foreground">{phase} commands</p>
        <p className="text-sm text-muted-foreground">No commands run in this phase.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{phase} commands</p>
      {commands.map((c, i) => {
        const isOpen = open === i
        const out = c.stderrPreview || c.stdoutPreview
        const preview = out ? out.split('\n').find(Boolean)?.slice(0, 140) : null
        return (
          <div key={`${c.command}-${i}`} className="border border-border rounded-md">
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              className="w-full flex flex-wrap items-center gap-2 p-2.5 text-left"
            >
              {out ? (
                isOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                )
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              <Badge
                variant="outline"
                className={
                  c.status === 'passed'
                    ? 'text-success border-success'
                    : c.status === 'skipped'
                      ? 'text-muted-foreground border-border'
                      : 'text-destructive border-destructive'
                }
              >
                {c.status}
              </Badge>
              <code className="text-xs font-mono text-foreground flex-1 min-w-32">{c.command}</code>
              <span className="text-xs text-muted-foreground">
                exit {c.exitCode ?? 'n/a'}
                {typeof c.durationMs === 'number' ? ` · ${c.durationMs}ms` : ''}
                {c.timedOut ? ' · timed out' : ''}
              </span>
            </button>
            {preview && !isOpen && (
              <p className="px-9 pb-2 text-xs text-muted-foreground truncate">{preview}</p>
            )}
            {isOpen && out && (
              <pre className="text-xs bg-muted/50 rounded-b p-2 overflow-auto max-h-48 text-muted-foreground whitespace-pre-wrap border-t border-border">
                {out}
              </pre>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Block({ block }: { block: ReportBlock }) {
  switch (block.kind) {
    case 'paragraph':
      return <p className="text-sm text-foreground leading-relaxed">{block.text}</p>
    case 'note':
      return <p className="text-xs text-muted-foreground/80 italic border-l-2 border-border pl-3">{block.text}</p>
    case 'keyvalue':
      return (
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {block.items.map((i) => (
            <div key={i.label} className="flex flex-wrap gap-x-2 text-sm">
              <dt className="text-muted-foreground">{i.label}:</dt>
              <dd className="text-foreground font-medium break-words">{i.value}</dd>
            </div>
          ))}
        </dl>
      )
    case 'list':
      return block.ordered ? (
        <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
          {block.items.map((i, idx) => (
            <li key={idx}>{i}</li>
          ))}
        </ol>
      ) : (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {block.items.map((i, idx) => (
            <li key={idx} className="flex gap-2">
              <span className="text-muted-foreground/50">•</span>
              <span>{i}</span>
            </li>
          ))}
        </ul>
      )
    case 'files':
      return (
        <ul className="space-y-1">
          {block.items.map((f) => (
            <li key={f.path} className="flex flex-wrap items-center gap-2 text-sm">
              <code className="font-mono text-foreground">{f.path}</code>
              <Badge variant="outline" className={ROLE_TONE[f.role]}>
                {ROLE_LABEL[f.role]}
              </Badge>
            </li>
          ))}
        </ul>
      )
    case 'tree':
      return (
        <div className="space-y-3">
          {block.groups.map((g) => (
            <div key={g.dir}>
              <p className="text-sm font-mono text-foreground mb-1">{g.dir}/</p>
              <ul className="space-y-1 pl-4 border-l border-border">
                {g.files.map((f) => (
                  <li key={f.path} className="flex flex-wrap items-center gap-2 text-sm">
                    <code className="font-mono text-muted-foreground">{f.path.split('/').pop()}</code>
                    <Badge variant="outline" className={ROLE_TONE[f.role]}>
                      {ROLE_LABEL[f.role]}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )
    case 'commands':
      return <CommandLog phase={block.phase} commands={block.commands} />
  }
}

function whatThisMeans(section: ReportSection, report: FinalReport): string {
  switch (section.id) {
    case 'executive-summary':
      return 'This is the technical summary of the run. The Business Summary above restates the same outcome in simpler language for stakeholders.'
    case 'repository-overview':
      return 'RepoPulse identified the repository structure and tooling so it could determine how verification should be performed.'
    case 'codebase-map':
      return 'This shows which parts of the repository were involved, including files that were considered, approved, rejected, pending, or applied in the sandbox.'
    case 'request-understanding':
      return 'This explains how RepoPulse interpreted the user request before proposing any change.'
    case 'planning-summary':
      return 'This shows the planned approach, expected risks, test plan, and rollback thinking before implementation review.'
    case 'diff-review':
      return 'This proves the workflow stayed human-in-the-loop: proposed files were reviewed, approved, rejected, or left pending before sandbox testing.'
    case 'sandbox-summary':
      if (report.facts.conclusionStatus === 'patch_failed') {
        return 'The repository worked before the approved change but failed after the change was applied. This suggests the approved change may have introduced the issue.'
      }
      if (report.facts.conclusionStatus === 'baseline_failed') {
        return 'The repository already had issues before the approved change was tested. The change should not be blamed until the repository itself is healthy.'
      }
      if (report.facts.conclusionStatus === 'sandbox_passed') {
        return 'Sandbox verification is strong evidence that the approved change is ready for engineering review because the temporary copy passed before and after the change.'
      }
      if (report.facts.conclusionStatus === 'not_run') {
        return 'Sandbox verification is the safest way to test a change because it runs in a temporary clone rather than the original repository. It has not been completed yet.'
      }
      return 'Sandbox verification protects the original repository by testing approved changes in a temporary copy.'
    case 'command-results':
      return 'These command results are supporting evidence. Stakeholders can rely on the summary cards above without reading full terminal logs.'
    case 'safety-governance':
      return 'This section confirms RepoPulse did not commit, push, merge, or modify the original repository automatically.'
    case 'audit-trail':
      return 'This records the major workflow events so reviewers can see when planning, review, sandboxing, and reporting happened.'
    case 'recommendations':
      return 'These are the next actions RepoPulse recommends based on the current review and verification state.'
    case 'confidence':
      return report.confidenceExplanation
    default:
      return 'This section provides supporting evidence for the final report.'
  }
}

function Section({ section, index, report }: { section: ReportSection; index: number; report: FinalReport }) {
  return (
    <div className="report-technical-section rounded-md border border-border p-4 space-y-3">
      <h4 className="text-sm font-semibold text-foreground">
        {index}. {section.title}
      </h4>
      {section.blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
      <div className="report-meaning-callout rounded border border-primary/40 bg-primary/5 p-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">What this means</p>
        <p className="mt-1 text-sm leading-relaxed text-foreground">{whatThisMeans(section, report)}</p>
      </div>
    </div>
  )
}

export function FinalEngineeringReport({ run, documentMode = false }: { run: AgentRun; documentMode?: boolean }) {
  // Deterministic report is always available immediately, with zero AI calls.
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiWording, setAiWording] = useState<Parameters<typeof buildFinalReport>[0]['aiWording']>(null)
  const [aiState, setAiState] = useState<'idle' | 'loading' | 'polished' | 'unavailable' | 'error'>('idle')
  const [copied, setCopied] = useState(false)

  const report: FinalReport = useMemo(
    () => buildFinalReport({ run, aiSummary, aiWording }),
    [run, aiSummary, aiWording]
  )

  const improveReportWording = async () => {
    if (aiState === 'loading') return
    setAiState('loading')
    try {
      const res = await fetch('/api/final-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run }),
      })
      const data: {
        summary?: string
        wording?: Parameters<typeof buildFinalReport>[0]['aiWording']
        aiPolished?: boolean
        error?: string
        message?: string
      } = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate summary')
      if (data.aiPolished && (data.wording || data.summary)) {
        setAiSummary(data.summary ?? data.wording?.narrative ?? null)
        setAiWording(data.wording ?? null)
        setAiState('polished')
      } else {
        // Budget-blocked / mock mode — keep the deterministic summary, do not retry.
        setAiState('unavailable')
      }
    } catch {
      setAiState('error')
    }
  }

  useEffect(() => {
    if (documentMode) return
    if (aiState !== 'idle') return
    void improveReportWording()
    // Wording is cached by run on the API side; this is intentionally a one-shot enhancement attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentMode])

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(report.markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable — the Download button is the fallback.
    }
  }

  const downloadMarkdown = () => {
    const blob = new Blob([report.markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `repopulse-report-${run.repo.replace('/', '-')}-${run.runId}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const printVisualReport = () => {
    window.print()
  }

  return (
    <Card className={`final-report-print-root report-document p-6 bg-card border-border space-y-4 ${documentMode ? 'report-document-mode' : ''}`}>
      {!documentMode && <div className="final-report-screen-header flex flex-wrap items-center gap-2">
        <FileText className="w-5 h-5 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground flex-1">{report.completeness.label}</h3>
        <Badge variant="outline" className="text-muted-foreground border-border">
          Confidence {report.confidence.score}%
        </Badge>
        <Badge variant="outline" className="text-primary border-primary">
          {report.completeness.label}
        </Badge>
      </div>}

      {report.completeness.warning && (
        <div className="report-incomplete-notice rounded border border-warning/60 bg-warning/10 p-3 text-sm text-warning">
          <p className="font-semibold">Draft report</p>
          <p className="mt-1 leading-relaxed">{report.completeness.warning}</p>
        </div>
      )}

      {!documentMode && <div className="final-report-actions flex flex-wrap items-center gap-2 print:hidden">
        <Button onClick={copyMarkdown} size="sm" variant="outline">
          {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
          {copied ? 'Copied' : 'Copy Report Markdown'}
        </Button>
        <Button onClick={downloadMarkdown} size="sm" variant="outline">
          <Download className="w-4 h-4 mr-1.5" />
          Download Report Markdown
        </Button>
        <Button onClick={printVisualReport} size="sm" variant="outline">
          <Printer className="w-4 h-4 mr-1.5" />
          Export Visual Report
        </Button>
      </div>}

      {!documentMode && aiState === 'unavailable' && (
        <p className="final-report-ai-notice text-xs text-warning print:hidden">
          Enhanced report wording limit reached today or live AI is unavailable. A technical report is still available.
        </p>
      )}
      {!documentMode && aiState === 'error' && (
        <p className="final-report-ai-notice text-xs text-destructive print:hidden">Could not reach the AI summary service. The deterministic summary is shown.</p>
      )}

      <ReportVisualSnapshots run={run} report={report} />

      {!documentMode && (
        <>
          <div className="report-technical-appendix report-section-divider rounded-md border border-border bg-muted/20 p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Appendix</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Technical Details</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              The following sections preserve the engineering audit trail behind the stakeholder summary.
            </p>
          </div>

          <div className="report-technical-appendix space-y-3">
            {report.sections.map((s, i) => (
              <Section key={s.id} section={s} index={i + 1} report={report} />
            ))}
          </div>
        </>
      )}

      <p className="final-report-internal-note text-xs text-muted-foreground/70 border-t border-border pt-3 print:hidden">
        All statuses, counts, and conclusions are derived deterministically from this run&apos;s stored data. Enhanced wording
        can improve prose only and never changes facts or results.
      </p>
    </Card>
  )
}
