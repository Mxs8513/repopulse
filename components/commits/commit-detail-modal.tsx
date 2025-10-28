'use client'

import { X, FileText, FilePlus, FileX, ExternalLink } from 'lucide-react'

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

interface CommitDetailModalProps {
  commit: Commit | null
  onClose: () => void
  repoFullName: string
}

export function CommitDetailModal({ commit, onClose, repoFullName }: CommitDetailModalProps) {
  if (!commit) return null

  const githubUrl = `https://github.com/${repoFullName}/commit/${commit.sha}`
  const messageLines = commit.message.split('\n')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card border rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-2xl font-bold mb-2">{messageLines[0]}</h2>
            {messageLines.length > 1 && (
              <p className="text-sm text-muted-foreground">{messageLines.slice(1).join('\n')}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Commit Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground mb-1">Author</div>
              <div className="font-medium">{commit.author.name}</div>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground mb-1">Date</div>
              <div className="font-medium">{new Date(commit.date).toLocaleDateString()}</div>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground mb-1">Commit Hash</div>
              <code className="font-mono text-sm">{commit.sha}</code>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground mb-1">Changes</div>
              <div className="flex items-center gap-3">
                <span className="text-green-500 font-medium">+{commit.stats.additions}</span>
                <span className="text-red-500 font-medium">-{commit.stats.deletions}</span>
                <span className="text-muted-foreground">{commit.files.length} files</span>
              </div>
            </div>
          </div>

          {/* AI Explanation */}
          {commit.aiExplanation && (
            <div className="rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-secondary/20 border border-primary/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🤖</span>
                <h3 className="text-sm font-semibold">AI Explanation</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{commit.aiExplanation}</p>
            </div>
          )}

          {/* Files Changed */}
          {commit.files.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Files Changed</h3>
              <div className="space-y-2">
                {commit.files.map((file, index) => {
                  const Icon = file.status === 'added' ? FilePlus : file.status === 'deleted' ? FileX : FileText
                  const statusColor = file.status === 'added' ? 'text-green-500' : file.status === 'deleted' ? 'text-red-500' : 'text-blue-500'

                  return (
                    <div
                      key={index}
                      className="rounded-lg border bg-card p-3 hover:border-primary transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Icon className={`w-4 h-4 ${statusColor} flex-shrink-0`} />
                          <code className="text-xs font-mono truncate">{file.path}</code>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-green-500">+{file.additions}</span>
                          <span className="text-red-500">-{file.deletions}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md bg-muted hover:bg-muted/80 transition-colors"
          >
            Close
          </button>
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity inline-flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            View on GitHub
          </a>
        </div>
      </div>
    </div>
  )
}

