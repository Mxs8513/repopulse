import { NextRequest, NextResponse } from 'next/server'
import { getOrBuildCodebaseMap, parseRepoParam } from '@/lib/agent/map-cache'
import { classifyRequestSafety } from '@/lib/agent/safety'
import { selectAffectedFiles } from '@/lib/agent/retrieval'
import { buildVerificationPlan } from '@/lib/agent/verification'
import { withFallback } from '@/lib/ai/provider'
import { GitHubService } from '@/lib/github-service'
import type { ChangePlan, ChangeScope, RiskLevel } from '@/lib/agent/types'

export const dynamic = 'force-dynamic'

function deriveScope(plan: Pick<ChangePlan, 'affectedFiles'>): ChangeScope {
  const cats = new Set(plan.affectedFiles.map((f) => f.category))
  const frontend = cats.has('frontend_page') || cats.has('frontend_component')
  const backend = cats.has('backend_api') || cats.has('service_or_lib') || cats.has('database_model')
  if (frontend && backend) return 'full-stack'
  if (frontend) return 'frontend'
  if (backend) return 'backend'
  if (cats.has('config') || cats.has('ci_cd')) return 'config'
  return 'docs'
}

function deriveRiskLevel(task: string, affectedCount: number, hasTests: boolean): RiskLevel {
  const lower = task.toLowerCase()
  const riskySignals = ['auth', 'security', 'migration', 'database', 'payment', 'delete', 'remove', 'rewrite']
  if (riskySignals.some((s) => lower.includes(s)) || affectedCount > 5) return 'high'
  if (affectedCount >= 3 || !hasTests) return 'medium'
  return 'low'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = parseRepoParam(body.repo ?? null)
    const task = typeof body.task === 'string' ? body.task.trim() : ''

    if (!parsed) {
      return NextResponse.json({ error: 'Invalid repository format. Use: owner/repo' }, { status: 400 })
    }
    if (!task) {
      return NextResponse.json({ error: 'Task description is required' }, { status: 400 })
    }

    // Safety gate runs BEFORE retrieval or any AI call.
    const safety = classifyRequestSafety(task)
    if (!safety.safe) {
      return NextResponse.json({ refused: true, safety }, { status: 200 })
    }

    const result = await getOrBuildCodebaseMap(parsed.owner, parsed.repo)
    if (!result.ok) {
      return NextResponse.json({ error: result.message, kind: result.kind }, { status: result.status })
    }
    const map = result.map

    const affectedFiles = selectAffectedFiles(task, map.files, 6)
    const hasTests = map.architecture.testFiles.length > 0

    // Build the verification plan from the repo's real package.json when available.
    let packageJson = null
    if (map.files.some((f) => f.path === 'package.json')) {
      const pkg = await GitHubService.getFileContent(parsed.owner, parsed.repo, 'package.json')
      if (pkg.content) {
        try {
          packageJson = JSON.parse(pkg.content)
        } catch {
          packageJson = null
        }
      }
    }
    const verification = buildVerificationPlan({
      packageJson,
      topLevelFiles: map.files.filter((f) => !f.path.includes('/')).map((f) => f.path),
    })
    const availableCommands = verification.commands.filter((c) => c.exists).map((c) => c.command)

    const { result: generated, provider, degraded, cached, budget } = await withFallback(
      (p) =>
        p.generateChangePlan({
          repo: map.repo,
          task,
          affectedFiles,
          architectureText: map.architecture.text,
          hasTests,
          verificationCommands: availableCommands,
        }),
      { cacheKey: JSON.stringify({ kind: 'plan', repo: map.repo, task, files: affectedFiles.map((f) => f.path) }) }
    )

    const plan: ChangePlan = {
      taskSummary: generated.taskSummary,
      steps: generated.steps,
      affectedFiles,
      assumptions: generated.assumptions,
      risks: generated.risks,
      riskLevel: deriveRiskLevel(task, affectedFiles.length, hasTests),
      scope: deriveScope({ affectedFiles }),
      testPlan: availableCommands.length > 0
        ? availableCommands.map((c) => `Run ${c}`)
        : ['No automated checks detected — verify manually and consider adding tests.'],
      rollbackPlan: [
        'Changes are only proposals until explicitly approved — nothing is applied automatically.',
        'If applied later via a branch/PR, roll back by closing the PR or reverting the branch.',
      ],
      constraints: [],
      confidence: affectedFiles.length >= 2 ? 'medium' : 'low',
      provider,
    }

    return NextResponse.json({ refused: false, safety, plan, verification, degraded, cached, budget })
  } catch (error) {
    console.error('[API plan] Error:', error)
    return NextResponse.json({ error: 'Failed to generate change plan' }, { status: 500 })
  }
}
