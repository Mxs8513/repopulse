'use client'

import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RepoBanner } from '@/components/agent/repo-banner'
import { useRepository } from '@/lib/repository-context'
import { useAgentRuns } from '@/hooks/use-agent-runs'
import type { VerificationPlan } from '@/lib/agent/types'
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react'

const fetcher = (url: string) =>
  fetch(url).then(async (res) => {
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Request failed')
    return data
  })

export default function VerificationPage() {
  const { selectedRepo } = useRepository()
  const runs = useAgentRuns()
  const { data, error, isLoading } = useSWR<VerificationPlan>(
    selectedRepo ? `/api/verification?repo=${encodeURIComponent(selectedRepo)}` : null,
    fetcher
  )

  const pendingRuns = runs.filter((r) => ['diff_generated', 'approved'].includes(r.status))

  return (
    <div className="relative min-h-screen p-4 lg:p-6 space-y-6 z-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Verification</h1>
          <p className="text-muted-foreground mt-1">
            Recommended checks derived from the repository's real tooling — commands are never executed automatically
          </p>
        </div>
        <ShieldCheck className="w-8 h-8 text-muted-foreground" />
      </div>

      <RepoBanner />

      {!selectedRepo && (
        <Card className="p-6 bg-card border-border">
          <p className="text-muted-foreground">
            Select a repository above to see its recommended build, test, and lint commands.
          </p>
        </Card>
      )}

      {isLoading && (
        <Card className="p-6 bg-card border-border">
          <p className="text-center text-muted-foreground">Inspecting repository tooling…</p>
        </Card>
      )}

      {error && (
        <Card className="p-6 bg-card border-destructive/50">
          <p className="text-destructive">{String(error.message || error)}</p>
        </Card>
      )}

      {data && (
        <>
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-foreground">Detected toolchain</h3>
              <Badge variant="outline" className="text-primary border-primary">
                {data.repoType}
              </Badge>
            </div>
            {data.notes.map((n, i) => (
              <p key={i} className="text-sm text-warning mt-2">
                {n}
              </p>
            ))}
          </Card>

          <Card className="p-6 bg-card border-border space-y-3">
            <h3 className="text-lg font-semibold text-foreground">Recommended commands</h3>
            {data.commands.map((cmd) => (
              <div key={cmd.command} className="border border-border rounded-md p-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {cmd.exists ? (
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <code className="text-sm font-mono text-foreground flex-1 min-w-40">{cmd.command}</code>
                  <Badge
                    variant="outline"
                    className={cmd.exists ? 'text-success border-success' : 'text-muted-foreground border-border'}
                  >
                    {cmd.exists ? 'available' : 'not found'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{cmd.purpose}</p>
                <p className="text-xs text-muted-foreground/70">Source: {cmd.source}</p>
              </div>
            ))}
          </Card>

          <Card className="p-6 bg-card border-border">
            <h3 className="text-lg font-semibold text-foreground mb-2">How to verify</h3>
            <ol className="space-y-1.5 text-sm text-muted-foreground list-decimal pl-5">
              {data.manualInstructions.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground mt-4">
              Manual verification commands remain available. When enabled, sandbox verification can also run allowlisted
              commands in an isolated temporary workspace from the run detail page.
            </p>
          </Card>

          {pendingRuns.length > 0 && (
            <Card className="p-6 bg-card border-border">
              <h3 className="text-lg font-semibold text-foreground mb-3">Runs awaiting verification</h3>
              <ul className="space-y-2">
                {pendingRuns.map((r) => (
                  <li key={r.runId} className="text-sm text-muted-foreground">
                    <span className="text-foreground">{r.task}</span> — {r.status.replace(/_/g, ' ')} ·{' '}
                    {r.diff?.testsToRun.join(', ') || 'use commands above'}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
