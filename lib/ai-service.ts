import Groq from 'groq-sdk'
import type { CommitData } from './github-service'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

export class AIService {
  static async generateRepoSummary(commits: CommitData[], repoName: string): Promise<string> {
    try {
      const commitMessages = commits
        .slice(0, 20)
        .map((c) => c.message)
        .join('\n')
      const response = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert code analyst. Provide concise, insightful summaries of repository activity. Focus on technical depth, architecture, and development patterns.',
          },
          {
            role: 'user',
            content: `Analyze these recent commits from ${repoName} and provide a brief summary (2-3 sentences) of the development focus:\n\n${commitMessages}`,
          },
        ],
        max_tokens: 300,
        temperature: 0.7,
      })
      return response.choices[0]?.message?.content || 'Unable to generate summary'
    } catch (error) {
      console.error('[AI] Error generating repo summary:', error)
      return 'AI analysis temporarily unavailable'
    }
  }

  static async generateInsights(commits: CommitData[], repoName: string): Promise<string[]> {
    try {
      const stats = {
        totalCommits: commits.length,
        totalAdditions: commits.reduce((sum, c) => sum + c.stats.additions, 0),
        totalDeletions: commits.reduce((sum, c) => sum + c.stats.deletions, 0),
        uniqueAuthors: new Set(commits.map((c) => c.author.name)).size,
      }
      const commitMessages = commits
        .slice(0, 15)
        .map((c) => c.message)
        .join('\n')
      const response = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content:
              'You are a code analyst. Generate 4 brief, specific insights about repository activity. Focus on technical patterns, development velocity, and code quality.',
          },
          {
            role: 'user',
            content: `Based on these stats and commits for ${repoName}, provide 4 key insights:\n\nStats: ${JSON.stringify(stats)}\n\nRecent commits:\n${commitMessages}`,
          },
        ],
        max_tokens: 400,
        temperature: 0.7,
      })
      const content = response.choices[0]?.message?.content || ''
      return content
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .slice(0, 4)
    } catch (error) {
      console.error('[AI] Error generating insights:', error)
      return [
        'Active development detected',
        'Multiple contributors working',
        'Regular commit frequency',
        'Ongoing feature development',
      ]
    }
  }

  static async analyzeTrends(commits: CommitData[], repoName: string): Promise<string> {
    try {
      const recentCommits = commits.slice(0, 10)
      const commitTypes = recentCommits.map((c) => {
        const msg = c.message.toLowerCase()
        if (msg.includes('fix')) return 'fix'
        if (msg.includes('feat')) return 'feature'
        if (msg.includes('refactor')) return 'refactor'
        if (msg.includes('docs')) return 'documentation'
        return 'other'
      })
      const typeCount = commitTypes.reduce(
        (acc, type) => {
          acc[type] = (acc[type] || 0) + 1
          return acc
        },
        {} as Record<string, number>
      )
      const dominantType = Object.entries(typeCount)
        .sort((a, b) => b[1] - a[1])[0]?.[0]
      const trendMap: Record<string, string> = {
        fix: 'Focus on bug fixes and stability improvements',
        feature: 'Active feature development and enhancements',
        refactor: 'Code quality improvements and refactoring',
        documentation: 'Documentation updates and improvements',
        other: 'General maintenance and updates',
      }
      return trendMap[dominantType] || 'Ongoing development activity'
    } catch (error) {
      console.error('[AI] Error analyzing trends:', error)
      return 'Development trends analysis unavailable'
    }
  }

  static async generateCommitExplanation(commit: CommitData, repoName: string): Promise<string> {
    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content:
              'You are a code reviewer. Provide concise, technical explanations of what each commit does. Focus on the functional impact and technical implementation.',
          },
          {
            role: 'user',
            content: `Explain this commit from ${repoName} in 1-2 sentences:\n\nMessage: ${commit.message}\nChanges: +${commit.stats.additions} / -${commit.stats.deletions} lines`,
          },
        ],
        max_tokens: 150,
        temperature: 0.7,
      })
      return response.choices[0]?.message?.content || 'AI explanation temporarily unavailable'
    } catch (error) {
      console.error('[AI] Error generating commit explanation:', error)
      return 'AI explanation temporarily unavailable'
    }
  }
}

