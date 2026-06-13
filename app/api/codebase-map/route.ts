import { NextRequest, NextResponse } from 'next/server'
import { getOrBuildCodebaseMap, parseRepoParam } from '@/lib/agent/map-cache'

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

    const response = NextResponse.json(result.map)
    response.headers.set('Cache-Control', 'no-store, max-age=0')
    return response
  } catch (error) {
    console.error('[API codebase-map] Error:', error)
    return NextResponse.json({ error: 'Failed to build codebase map' }, { status: 500 })
  }
}
