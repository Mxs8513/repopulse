'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ProviderBadge, StatusBadge, VerificationBadge } from '@/components/agent/badges'
import { RunDetail } from '@/components/agent/run-detail'
import { useAgentRuns } from '@/hooks/use-agent-runs'
import { deleteRun } from '@/lib/agent/run-store'
import { summarizeRun, summaryLine } from '@/lib/agent/run-summary'
import type { AgentRunStatus } from '@/lib/agent/types'
import { History, Trash2 } from 'lucide-react'

const FILTERS: Array<{ label: string; statuses: AgentRunStatus[] | null }> = [
  { label: 'All', statuses: null },
  { label: 'Planned', statuses: ['planned', 'awaiting_diff'] },
  { label: 'Diff generated', statuses: ['diff_generated', 'verification_pending'] },
  { label: 'Approved', statuses: ['approved', 'verification_passed', 'pr_created'] },
  { label: 'Rejected / failed', statuses: ['rejected', 'failed', 'verification_failed'] },
]

function AgentRunsContent() {
  const runs = useAgentRuns()
  const searchParams = useSearchParams()
  const [filter, setFilter] = useState(0)

  const selectedId = searchParams.get('run')
  const selected = selectedId ? runs.find((r) => r.runId === selectedId) : undefined

  // Detail view
  if (selectedId) {
    return (
      <div className="relative min-h-screen p-4 lg:p-6 space-y-6 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Run Detail</h1>
            <p className="text-muted-foreground mt-1">
              Full audit trail: plan → diff → verification → approval decisions
            </p>
          </div>
          <History className="w-8 h-8 text-muted-foreground" />
        </div>
        {selected ? (
          <RunDetail run={selected} />
        ) : (
          <Card className="p-6 bg-card border-border space-y-3">
            <p className="text-muted-foreground">
              This run was not found — it may have been deleted, or it lives in a different browser&apos;s local
              storage (runs are stored per-browser).
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/agent-runs">← Back to all runs</Link>
            </Button>
          </Card>
        )}
      </div>
    )
  }

  // List view
  const active = FILTERS[filter]
  const visible = active.statuses ? runs.filter((r) => active.statuses!.includes(r.status)) : runs

  return (
    <div className="relative min-h-screen p-4 lg:p-6 space-y-6 z-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Agent Runs</h1>
          <p className="text-muted-foreground mt-1">
            Audit log of every AI workflow — plans, diffs, refusals, and approval decisions are all recorded
          </p>
        </div>
        <History className="w-8 h-8 text-muted-foreground" />
      </div>

      <Card className="p-4 bg-card border-border">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f, i) => (
            <button
              key={f.label}
              onClick={() => setFilter(i)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                i === filter ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Card>

      {visible.length === 0 && (
        <Card className="p-6 bg-card border-border">
          <p className="text-muted-foreground">
            No agent runs {active.statuses ? 'with this status' : 'yet'}. Start one in the{' '}
            <Link href="/planner" className="text-primary hover:underline">
              Change Planner
            </Link>
            .
          </p>
        </Card>
      )}

      {visible.map((run) => {
        const meta = summaryLine(run)
        const sum = summarizeRun(run)
        return (
          <Card key={run.runId} className="p-5 bg-card border-border hover:border-primary/40 transition-colors">
            <div className="flex flex-wrap items-center gap-2">
              {/* Whole row opens the detail view */}
              <Link href={`/agent-runs?run=${run.runId}`} className="flex-1 min-w-48 group">
                <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                  {run.task}
                </p>
                <p className="text-xs text-muted-foreground">
                  {run.repo} · {new Date(run.createdAt).toLocaleString()} · {run.runId}
                </p>
                {meta && <p className="text-xs text-muted-foreground/80 mt-1">{meta}</p>}
              </Link>
              <StatusBadge status={run.status} />
              {/* Verification status only shown once a diff has been proposed */}
              {sum.proposed > 0 &&
                (sum.verificationStatus ? (
                  <VerificationBadge status={sum.verificationStatus} />
                ) : (
                  <Badge variant="outline" className="text-muted-foreground border-border uppercase">
                    Not Verified
                  </Badge>
                ))}
              <ProviderBadge provider={run.provider} />
              <Button asChild variant="outline" size="sm">
                <Link href={`/agent-runs?run=${run.runId}`}>View details →</Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteRun(run.runId)}
                className="text-muted-foreground hover:text-destructive"
                title="Delete run from audit log"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

export default function AgentRunsPage() {
  return (
    <Suspense fallback={null}>
      <AgentRunsContent />
    </Suspense>
  )
}
