'use client'

import { GitCommit } from 'lucide-react'

export interface Commit {
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
    path: string
    additions: number
    deletions: number
    status: 'added' | 'modified' | 'deleted'
  }>
  aiExplanation?: string
}

interface CommitCardProps {
  commit: Commit
  repoFullName: string
}

export function CommitCard({ commit }: CommitCardProps) {
  const firstLine = commit.message.split('\n')[0]
  const shortSha = commit.sha.substring(0, 7)

  return (
    <div className="rounded-lg border bg-card p-6 hover:border-primary transition-all duration-200 cursor-pointer group hover:shadow-lg hover:shadow-primary/10">
      <div className="flex items-start gap-4 mb-3">
        <div className="p-2 rounded-md bg-green-500/10">
          <GitCommit className="w-5 h-5 text-green-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-primary group-hover:text-primary/80 transition-colors mb-1">
            {firstLine}
          </h3>
          <p className="text-xs text-muted-foreground font-mono">{shortSha}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-4 border-t">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
            {commit.author.name.substring(0, 2).toUpperCase()}
          </div>
          <span className="text-sm text-foreground">{commit.author.name}</span>
          <span className="text-sm text-muted-foreground">•</span>
          <span className="text-sm text-muted-foreground">{new Date(commit.date).toLocaleDateString()}</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-green-500 font-medium">+{commit.stats.additions}</span>
          <span className="text-red-500 font-medium">-{commit.stats.deletions}</span>
          <span className="text-muted-foreground">{commit.files.length} files</span>
        </div>
      </div>
    </div>
  )
}

