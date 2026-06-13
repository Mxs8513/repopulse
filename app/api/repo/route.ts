import { NextRequest, NextResponse } from 'next/server'
import { GitHubService } from '@/lib/github-service'
import { generateRepoAnalytics, analyzeTrends } from '@/lib/ai-service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const repoPath = searchParams.get('repo')

    if (!repoPath) {
      return NextResponse.json({ error: 'Repository path required' }, { status: 400 })
    }

    const [owner, repo] = repoPath.split('/')
    if (!owner || !repo) {
      return NextResponse.json({ error: 'Invalid repository format. Use: owner/repo' }, { status: 400 })
    }

    const [repoData, commits, basicStats] = await Promise.all([
      GitHubService.getRepository(owner, repo),
      GitHubService.getCommits(owner, repo, 20),
      GitHubService.getRepoStats(owner, repo),
    ])

    // If repository fetch failed, return error
    if (!repoData) {
      return NextResponse.json(
        { error: 'Failed to fetch repository data from GitHub' },
        { status: 500 }
      )
    }

    // Fetch contributors with error handling
    let contributors: Awaited<ReturnType<typeof GitHubService.getContributors>> = []
    try {
      contributors = await GitHubService.getContributors(owner, repo, 5)
    } catch (error) {
      console.error('[API] Error fetching contributors (continuing without them):', error)
      contributors = []
    }

    const [branches, openPRs, reviewTime] = await Promise.all([
      GitHubService.getBranches(owner, repo),
      GitHubService.getOpenPRs(owner, repo),
      GitHubService.getPRReviewTimes(owner, repo),
    ])

    const avgCommitSize = GitHubService.calculateAvgCommitSize(commits)

    const stats = {
      ...basicStats,
      branches,
      openPRs,
      avgCommitSize,
      reviewTime,
    }

    const enableAI = searchParams.get('enableAI') === 'true'

    let aiResults
    if (enableAI) {
      // Same provider chain, budget guard, and cache as Ask Repo / Planner.
      // generateRepoAnalytics degrades to the mock provider internally, so
      // this never throws for provider problems — meta explains the outcome.
      aiResults = await generateRepoAnalytics(repoData.fullName, commits)
    } else {
      aiResults = {
        summary: 'AI analysis available on the Analysis page',
        insights: [],
        trends: analyzeTrends(commits),
        meta: null,
      }
    }

    const response = NextResponse.json({
      repository: repoData,
      commits,
      contributors,
      stats,
      ai: aiResults,
    })
    
    // Disable caching for large GitHub API responses to prevent cache errors
    response.headers.set('Cache-Control', 'no-store, max-age=0')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    
    return response
  } catch (error) {
    console.error('[API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch repository data' },
      { status: 500 }
    )
  }
}

