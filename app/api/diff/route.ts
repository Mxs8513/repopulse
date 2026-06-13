import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { parseRepoParam } from '@/lib/agent/map-cache'
import { withFallback } from '@/lib/ai/provider'
import { estimateCostUSD, getBudgetStatus, getCostConfig } from '@/lib/ai/cost-controls'
import { GitHubService } from '@/lib/github-service'
import { verifyProposalPatches } from '@/lib/agent/diff-verification'
import type { BudgetStatus } from '@/lib/ai/cost-controls'
import type { DiffProposal, FilePatchProposal, RiskLevel } from '@/lib/agent/types'

export const dynamic = 'force-dynamic'

const MAX_DIFF_FILES = 5

function patchRisk(path: string): RiskLevel {
  const lower = path.toLowerCase()
  if (lower.includes('auth') || lower.includes('token') || lower.includes('migration') || lower.includes('schema')) return 'high'
  if (lower.includes('api/') || lower.includes('service')) return 'medium'
  return 'low'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = parseRepoParam(body.repo ?? null)
    const task = typeof body.task === 'string' ? body.task.trim() : ''
    const planSteps: string[] = Array.isArray(body.planSteps) ? body.planSteps.map(String) : []
    const files: string[] = Array.isArray(body.files) ? body.files.map(String) : []
    const testsToRun: string[] = Array.isArray(body.testsToRun) ? body.testsToRun.map(String) : []

    if (!parsed) {
      return NextResponse.json({ error: 'Invalid repository format. Use: owner/repo' }, { status: 400 })
    }
    if (!task || files.length === 0) {
      return NextResponse.json({ error: 'Task and at least one affected file are required' }, { status: 400 })
    }

    const bounded = files.slice(0, MAX_DIFF_FILES)
    const skippedFiles: DiffProposal['skippedFiles'] = files
      .slice(MAX_DIFF_FILES)
      .map((path) => ({ path, reason: `Diff generation limited to ${MAX_DIFF_FILES} files per run` }))

    const contents = await GitHubService.getFileContents(parsed.owner, parsed.repo, bounded, MAX_DIFF_FILES)
    const { maxContextChars, maxOutputTokens } = getCostConfig()
    // Per-file content cap so a 5-file run stays within the context budget.
    const perFileChars = Math.floor(maxContextChars / Math.max(bounded.length, 1))

    // Cost preview mode: report the estimate without making any AI call.
    if (body.estimateOnly === true) {
      const estimatedUSD = contents
        .filter((f) => f.content)
        .reduce((sum, f) => sum + estimateCostUSD(Math.min(f.content!.length, perFileChars), maxOutputTokens), 0)
      return NextResponse.json({
        estimateOnly: true,
        files: contents.filter((f) => f.content).length,
        estimatedUSD: Math.round(estimatedUSD * 10000) / 10000,
        budget: getBudgetStatus(),
      })
    }

    const patches: FilePatchProposal[] = []
    let providerUsed: DiffProposal['provider'] = 'mock'
    let anyDegraded = false
    let lastBudget: BudgetStatus | null = null

    for (const file of contents) {
      if (!file.content) {
        skippedFiles.push({ path: file.path, reason: file.skippedReason || 'Content unavailable' })
        patches.push({
          path: file.path,
          changeSummary: 'Patch not generated',
          reasoning: file.skippedReason || 'File content unavailable',
          risk: patchRisk(file.path),
          proposedChange: 'Need file content before proposing exact patch.',
          groundedInContent: false,
          contentUnavailableReason: file.skippedReason,
          approval: 'pending',
        })
        continue
      }

      // `content` is what the model sees (capped for the prompt). The full file
      // (<=100 KB, since larger files are skipped at fetch) is what the sandbox
      // clone actually contains, so hashing/replacement must use the full file.
      const content = file.content.slice(0, perFileChars)
      const truncatedForPrompt = file.content.length > content.length
      const { result, provider, degraded, budget } = await withFallback(
        (p) =>
          p.generateDiffProposal({
            repo: `${parsed.owner}/${parsed.repo}`,
            task,
            planSteps,
            file: { path: file.path, content },
          }),
        { cacheKey: JSON.stringify({ kind: 'diff', repo: body.repo, task, path: file.path, content }) }
      )
      providerUsed = provider
      anyDegraded = anyDegraded || degraded
      lastBudget = budget

      patches.push({
        path: file.path,
        changeSummary: result.changeSummary,
        reasoning: result.reasoning,
        risk: patchRisk(file.path),
        proposedChange: result.proposedChange,
        groundedInContent: true,
        approval: 'pending',
        // Structured patch data so the sandbox can do real full-file replacement.
        // Hash over the FULL file (matches the sandbox clone); only treat the
        // full-file replacement as applicable when the model saw the whole file.
        originalContent: file.content,
        originalContentHash: createHash('sha256').update(file.content, 'utf-8').digest('hex'),
        proposedContent: truncatedForPrompt ? undefined : result.proposedContent,
      })
    }

    // Quality gate: verify every patch before it reaches the human reviewer,
    // so placeholder/low-quality output is flagged instead of looking valid.
    const { patches: verifiedPatches, summary: verificationSummary } = verifyProposalPatches(patches, {
      task,
      affectedPaths: bounded,
      hasTestPlan: testsToRun.length > 0,
    })

    const proposal: DiffProposal = {
      patches: verifiedPatches,
      skippedFiles,
      testsToRun,
      provider: providerUsed,
    }

    return NextResponse.json({
      ...proposal,
      verificationSummary,
      degraded: anyDegraded,
      budget: lastBudget ?? getBudgetStatus(),
    })
  } catch (error) {
    console.error('[API diff] Error:', error)
    return NextResponse.json({ error: 'Failed to generate diff proposal' }, { status: 500 })
  }
}
