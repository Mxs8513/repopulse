import { NextRequest, NextResponse } from 'next/server'
import { withFallback } from '@/lib/ai/provider'
import { getBudgetStatus, getReportBudgetStatus, recordReportCall } from '@/lib/ai/cost-controls'
import { buildDeterministicNarrative, buildFinalReport, computeConfidence } from '@/lib/agent/final-report'
import { summarizeRun } from '@/lib/agent/run-summary'
import { SANDBOX_CONCLUSION_PLAIN } from '@/lib/agent/final-report'
import type { AgentRun } from '@/lib/agent/types'

export const dynamic = 'force-dynamic'

/**
 * Optional single AI call to polish ONLY the executive-summary narrative of a
 * final engineering report. The report itself is built client-side from
 * deterministic run data; this endpoint never recomputes statuses or counts.
 *
 * - At most one AI call per request.
 * - When the provider is mock, budget-blocked, or the call degrades, the
 *   deterministic narrative is returned with aiPolished:false. Generation is
 *   never blocked and the call is never retried here.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const run = body?.run as AgentRun | undefined
    if (!run || typeof run.repo !== 'string' || typeof run.task !== 'string') {
      return NextResponse.json({ error: 'A valid run is required' }, { status: 400 })
    }

    const deterministicNarrative = buildDeterministicNarrative(run)
    const deterministicReport = buildFinalReport({ run, deterministicReportOnly: true })
    const reportBudget = getReportBudgetStatus()
    if (reportBudget.blocked) {
      return NextResponse.json({
        summary: deterministicNarrative,
        deterministicNarrative,
        aiPolished: false,
        provider: 'mock',
        degraded: true,
        cached: false,
        reportBudget,
        message: reportBudget.message,
      })
    }
    const confidence = computeConfidence(run)
    const summary = summarizeRun(run)
    const sb = run.sandbox
    const baselinePassed = sb?.baselineCommands?.length
      ? sb.baselineCommands.every((c) => c.status !== 'failed')
      : sb?.commands?.length
        ? sb.commands.every((c) => c.status !== 'failed')
        : null
    const patchedPassed = sb?.patchedCommands?.length
      ? sb.patchedCommands.every((c) => c.status !== 'failed')
      : null

    const { result: wordingResult, provider, degraded, cached, budget } = await withFallback(
      (p) =>
        (p.generateEngineeringReportWording ?? (async (ctx) => ({
          narrative: await p.generateEngineeringSummary(ctx),
          businessSummary: deterministicReport.businessSummary,
          keyFindings: deterministicReport.keyFindings,
          confidenceExplanation: deterministicReport.confidenceExplanation,
          recommendations: deterministicReport.recommendations,
        })))({
          repo: run.repo,
          task: run.task,
          conclusion: sb?.conclusion ? SANDBOX_CONCLUSION_PLAIN[sb.conclusion] : 'Sandbox verification has not been run.',
          approvalStatus: `${summary.approved} approved, ${summary.rejected} rejected`,
          approved: summary.approved,
          rejected: summary.rejected,
          baselinePassed,
          patchedPassed,
          patchTestedInSandbox: Boolean(sb && (sb.approvedApplied ?? 0) > 0 && (sb.patchedCommands?.length ?? 0) > 0),
          confidence: confidence.score,
          deterministicNarrative,
          deterministicBusinessSummary: deterministicReport.businessSummary,
          deterministicKeyFindings: deterministicReport.keyFindings,
          deterministicConfidenceExplanation: deterministicReport.confidenceExplanation,
          deterministicRecommendations: deterministicReport.recommendations,
        }),
      // Stable cache key so re-opening the same report never spends a 2nd call.
      { cacheKey: JSON.stringify({ kind: 'final-report', runId: run.runId, conclusion: sb?.conclusion ?? 'not_run' }) }
    )

    // AI is "used" only when a live provider actually answered (not mock/degraded).
    const aiPolished = provider !== 'mock' && !degraded
    const updatedReportBudget = aiPolished && !cached ? recordReportCall() : getReportBudgetStatus()
    const wording = aiPolished ? wordingResult : null
    return NextResponse.json({
      summary: aiPolished ? wordingResult.narrative : deterministicNarrative,
      wording,
      deterministicNarrative,
      aiPolished,
      provider,
      degraded,
      cached,
      budget,
      reportBudget: updatedReportBudget,
    })
  } catch (error) {
    console.error('[API final-report] Error:', error)
    // Never break report generation — return the budget so the UI can explain.
    return NextResponse.json({ error: 'Failed to generate report summary', budget: getBudgetStatus(), reportBudget: getReportBudgetStatus() }, { status: 500 })
  }
}
