import { Octokit } from '@octokit/rest'
import { getGithubToken } from './getGithubToken'

export interface RepoData {
  name: string
  fullName: string
  description: string
  stars: number
  forks: number
  openIssues: number
  language: string
  updatedAt: string
}

export interface CommitData {
  sha: string
  message: string
  author: {
    name: string
    email: string
    avatar: string
  }
  date: string
  stats: {
    additions: number
    deletions: number
    total: number
  }
  files: Array<{
    filename: string
    additions: number
    deletions: number
    status: string
  }>
  aiExplanation?: string
}

export interface ContributorData {
  login: string
  name: string
  avatar: string
  contributions: number
}

export interface RepoStats {
  totalCommits: number
  languages: Array<{ language: string; percentage: string }>
  branches?: number
  openPRs?: number
  avgCommitSize?: number
  reviewTime?: number
}

export class GitHubService {
  static createClient() {
    try {
      const token = getGithubToken()
      return new Octokit({ auth: token })
    } catch (error) {
      console.error('[GitHub Service] Failed to get token:', error)
      return new Octokit() // Unauthenticated
    }
  }

  static async getRepository(owner: string, repo: string): Promise<RepoData | null> {
    try {
      console.log('[GitHub] Fetching repository:', `${owner}/${repo}`)
      
      const client = this.createClient()
      
      const { data } = await client.repos.get({ owner, repo })
      
      console.log('[GitHub] Repository API Response:', { 
        name: data.name, 
        fullName: data.full_name,
        stars: data.stargazers_count,
        forks: data.forks_count,
        openIssues: data.open_issues_count,
        language: data.language,
        updatedAt: data.updated_at
      })
      
      return {
        name: data.name,
        fullName: data.full_name,
        description: data.description || '',
        stars: data.stargazers_count,
        forks: data.forks_count,
        openIssues: data.open_issues_count,
        language: data.language || 'Unknown',
        updatedAt: data.updated_at,
      }
    } catch (error: any) {
      console.error('[GitHub] Error fetching repository:', error?.message || error)
      if (error?.status === 401) {
        console.error('[GitHub] Bad credentials - check your GITHUB_TOKEN')
      } else if (error?.status === 404) {
        console.error('[GitHub] Repository not found')
      } else {
        console.error('[GitHub] Full error:', JSON.stringify(error, null, 2))
      }
      // Return null on error instead of fake data
      return null
    }
  }

  static async getCommits(owner: string, repo: string, limit = 30): Promise<CommitData[]> {
    try {
      const client = this.createClient()
      const { data } = await client.repos.listCommits({
        owner,
        repo,
        per_page: limit,
      })
      
      // Return commits without detailed stats to avoid rate limits
      return data.map((commit) => ({
        sha: commit.sha.substring(0, 7),
        message: commit.commit.message.split('\n')[0], // Only first line
        author: {
          name: commit.commit.author?.name || 'Unknown',
          email: commit.commit.author?.email || '',
          avatar: commit.author?.avatar_url || '',
        },
        date: commit.commit.author?.date || '',
        stats: {
          additions: 0,
          deletions: 0,
          total: 0,
        },
        files: [],
      }))
    } catch (error) {
      console.error('[GitHub] Error fetching commits:', error)
      return [] // Return empty array instead of throwing
    }
  }

  static async getContributors(owner: string, repo: string, limit = 5): Promise<ContributorData[]> {
    try {
      const client = this.createClient()
      const { data } = await client.repos.listContributors({
        owner,
        repo,
        per_page: limit,
      })
      return data.map((contributor) => ({
        login: contributor.login || 'Unknown',
        name: contributor.login || 'Unknown',
        avatar: contributor.avatar_url || '',
        contributions: contributor.contributions || 0,
      }))
    } catch (error) {
      console.error('[GitHub] Error fetching contributors:', error)
      return [] // Return empty array instead of throwing
    }
  }

  static async getRepoStats(owner: string, repo: string): Promise<RepoStats> {
    try {
      const client = this.createClient()
      const [commits, languages] = await Promise.all([
        client.repos.listCommits({ owner, repo, per_page: 100 }),
        client.repos.listLanguages({ owner, repo }),
      ])
      const totalCommits = commits.data.length
      const languageData = languages.data
      const totalBytes = Object.values(languageData).reduce((sum: number, bytes) => sum + (bytes as number), 0)
      const languagePercentages = Object.entries(languageData).map(([lang, bytes]) => ({
        language: lang,
        percentage: ((bytes as number / totalBytes) * 100).toFixed(1),
      }))
      return {
        totalCommits,
        languages: languagePercentages,
      }
    } catch (error) {
      console.error('[GitHub] Error fetching repo stats:', error)
      return { totalCommits: 0, languages: [] }
    }
  }

  static async getBranches(owner: string, repo: string): Promise<number> {
    try {
      const client = this.createClient()
      const { data } = await client.repos.listBranches({
        owner,
        repo,
        per_page: 100,
      })
      console.log('[GitHub] Branches fetched:', data.length)
      return data.length
    } catch (error) {
      console.error('[GitHub] Error fetching branches:', error)
      return 0
    }
  }

  static async getOpenPRs(owner: string, repo: string): Promise<number> {
    try {
      const client = this.createClient()
      const { data } = await client.pulls.list({
        owner,
        repo,
        state: 'open',
        per_page: 100,
      })
      console.log('[GitHub] Open PRs fetched:', data.length)
      return data.length
    } catch (error) {
      console.error('[GitHub] Error fetching open PRs:', error)
      return 0
    }
  }

  static async getPRReviewTimes(owner: string, repo: string): Promise<number> {
    try {
      const client = this.createClient()
      const { data } = await client.pulls.list({
        owner,
        repo,
        state: 'closed',
        sort: 'updated',
        direction: 'desc',
        per_page: 30,
      })
      const mergedPRs = data.filter((pr) => pr.merged_at).slice(0, 10)
      if (mergedPRs.length === 0) return 0
      const reviewTimes = mergedPRs
        .filter((pr) => pr.created_at && pr.merged_at)
        .map((pr) => {
          const createdAt = new Date(pr.created_at).getTime()
          const mergedAt = new Date(pr.merged_at).getTime()
          return (mergedAt - createdAt) / (1000 * 60 * 60)
        })
      return reviewTimes.length > 0 ? reviewTimes.reduce((a, b) => a + b, 0) / reviewTimes.length : 0
    } catch (error) {
      console.error('[GitHub] Error fetching PR review times:', error)
      return 0
    }
  }

  static calculateAvgCommitSize(commits: CommitData[]): number {
    if (commits.length === 0) return 0
    const total = commits.reduce((sum, commit) => sum + commit.stats.total, 0)
    return total / commits.length
  }
}

