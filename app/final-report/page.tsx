'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FinalEngineeringReport } from '@/components/agent/final-report'
import { useAgentRuns } from '@/hooks/use-agent-runs'
import { buildFinalReport } from '@/lib/agent/final-report'
import { FileText } from 'lucide-react'

function FinalReportContent() {
  const runs = useAgentRuns()
  const searchParams = useSearchParams()
  const selectedId = searchParams.get('run')
  const selected = selectedId ? runs.find((run) => run.runId === selectedId) : undefined
  const reportableRuns = runs.filter((run) => run.diff || run.plan || run.sandbox)

  if (selectedId) {
    return (
      <div className="relative min-h-screen p-4 lg:p-6 space-y-6 z-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Final Engineering Report</h1>
            <p className="text-muted-foreground mt-1">
              Truthful verification report for sharing, PDF export, and engineering review.
            </p>
          </div>
          <FileText className="w-8 h-8 text-muted-foreground" />
        </div>

        {selected ? (
          <>
            <Card className="p-4 bg-card border-border">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Export the report as a clean PDF document.
                </p>
                <Button asChild size="sm">
                  <Link href={`/final-report/print?run=${selected.runId}`} target="_blank">
                    Export PDF
                  </Link>
                </Button>
              </div>
            </Card>
            <FinalEngineeringReport run={selected} />
          </>
        ) : (
          <Card className="p-6 bg-card border-border space-y-3">
            <p className="text-muted-foreground">
              This run was not found. It may have been deleted, or it may live in another browser&apos;s local storage.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/final-report">Choose another run</Link>
            </Button>
          </Card>
        )}
      </div>
    )
  }

  return (
    <div className="relative min-h-screen p-4 lg:p-6 space-y-6 z-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Final Engineering Report</h1>
          <p className="text-muted-foreground mt-1">
            Open a completed agent run as a professional stakeholder-facing report.
          </p>
        </div>
        <FileText className="w-8 h-8 text-muted-foreground" />
      </div>

      {reportableRuns.length === 0 ? (
        <Card className="p-6 bg-card border-border">
          <p className="text-muted-foreground">
            No reportable agent runs yet. Create a plan or diff first, then return here to export a Final Engineering
            Report.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {reportableRuns.map((run) => {
            const report = buildFinalReport({ run })
            return (
              <Card key={run.runId} className="p-5 bg-card border-border hover:border-primary/40 transition-colors">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-56">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{run.task}</p>
                      <Badge variant="outline" className="border-border text-muted-foreground">
                        {report.completeness.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {run.repo} · {new Date(run.createdAt).toLocaleString()} · {run.runId}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">{report.businessSummary}</p>
                  </div>
                  <Button asChild size="sm">
                    <Link href={`/final-report?run=${run.runId}`}>Open Final Engineering Report</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/agent-runs?run=${run.runId}`}>View run detail</Link>
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function FinalReportPage() {
  return (
    <Suspense fallback={null}>
      <FinalReportContent />
    </Suspense>
  )
}
