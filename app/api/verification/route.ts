import { NextRequest, NextResponse } from 'next/server'
import { getOrBuildCodebaseMap, parseRepoParam } from '@/lib/agent/map-cache'
import { buildVerificationPlan } from '@/lib/agent/verification'
import { GitHubService } from '@/lib/github-service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const parsed = parseRepoParam(request.nextUrl.searchParams.get('repo'))
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid repository format. Use: owner/repo' }, { status: 400 })
    }

    const result = await getOrBuildCodebaseMap(parsed.owner, parsed.repo)
    if (!result.ok) {
      return NextResponse.json({ error: result.message, kind: result.kind }, { status: result.status })
    }
    const map = result.map

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

    const plan = buildVerificationPlan({
      packageJson,
      topLevelFiles: map.files.filter((f) => !f.path.includes('/')).map((f) => f.path),
    })

    return NextResponse.json(plan)
  } catch (error) {
    console.error('[API verification] Error:', error)
    return NextResponse.json({ error: 'Failed to build verification plan' }, { status: 500 })
  }
}
