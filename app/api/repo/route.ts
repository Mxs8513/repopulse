import { NextRequest, NextResponse } from 'next/server'
import { GitHubService } from '@/lib/github-service'
import { AIService } from '@/lib/ai-service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Debug: Log token length in API route
    const token = process.env.GITHUB_TOKEN
    console.log('[API Route] GitHub token length:', token?.length)
    console.log('[API Route] Token preview:', token?.substring(0, 20))
    
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
    let contributors = []
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

    // Debug: Log all fetched data to verify mapping
    console.log('[API] Repository Data:', {
      name: repoData.name,
      fullName: repoData.fullName,
      stars: repoData.stars,
      forks: repoData.forks,
      openIssues: repoData.openIssues,
    })
    console.log('[API] Stats Data:', {
      commits: commits.length,
      branches,
      openPRs,
      avgCommitSize,
      reviewTime,
      contributors: contributors.length,
    })

    const enableAI = searchParams.get('enableAI') === 'true'
    
    let aiResults
    if (enableAI) {
      try {
        const [summary, insights, trends] = await Promise.all([
          AIService.generateRepoSummary(commits, repoData.fullName),
          AIService.generateInsights(commits, repoData.fullName),
          AIService.analyzeTrends(commits, repoData.fullName),
        ])
        aiResults = { summary, insights, trends }
      } catch (aiError) {
        console.error('[API] AI analysis failed:', aiError)
        aiResults = {
          summary: 'AI analysis temporarily unavailable',
          insights: ['AI analysis unavailable', 'Development activity detected', 'Multiple contributors working', 'Regular commit frequency'],
          trends: 'Development trends analysis unavailable'
        }
      }
    } else {
      aiResults = {
        summary: 'AI analysis available on the Analysis page',
        insights: [],
        trends: 'AI trend analysis available on the Analysis page'
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

