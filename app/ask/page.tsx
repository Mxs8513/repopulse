'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RepoBanner } from '@/components/agent/repo-banner'
import { CategoryBadge, ConfidenceBadge, ProviderBadge } from '@/components/agent/badges'
import { useRepository } from '@/lib/repository-context'
import type { AskAnswer } from '@/lib/agent/types'
import { MessageSquareCode, Search } from 'lucide-react'

const EXAMPLE_QUESTIONS = [
  'Where is GitHub API data fetched?',
  'Where is AI analysis implemented?',
  'Which routes are API routes?',
  'What tests exist?',
  'Where is environment variable handling done?',
]

type AnswerWithMeta = AskAnswer & { degraded?: boolean }

const ERROR_TITLES: Record<string, string> = {
  rate_limited: 'GitHub rate limit reached',
  not_found: 'Repository not found',
  auth_required: 'Access denied — token required',
  invalid_input: 'Invalid repository name',
  github_error: 'GitHub API error',
}

export default function AskRepoPage() {
  const { selectedRepo } = useRepository()
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<AnswerWithMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const ask = async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed || !selectedRepo || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: selectedRepo, question: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError({
          title: ERROR_TITLES[data.kind ?? ''] || 'Failed to answer question',
          message: data.error || 'Request failed',
        })
        return
      }
      setHistory((prev) => [data as AnswerWithMeta, ...prev])
      setQuestion('')
    } catch (e) {
      setError({
        title: 'Failed to answer question',
        message: e instanceof Error ? e.message : 'Unexpected error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen p-4 lg:p-6 space-y-6 z-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Ask Repo</h1>
          <p className="text-muted-foreground mt-1">
            Grounded Q&A — every answer cites the repository files it was retrieved from
          </p>
        </div>
        <MessageSquareCode className="w-8 h-8 text-muted-foreground" />
      </div>

      <RepoBanner />

      <Card className="p-6 bg-card border-border space-y-4">
        <div className="flex gap-3">
          <Input
            placeholder={selectedRepo ? `Ask about ${selectedRepo}…` : 'Select a repository first'}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask(question)}
            disabled={!selectedRepo || loading}
            className="flex-1 h-11"
          />
          <Button onClick={() => ask(question)} disabled={!selectedRepo || loading || !question.trim()} className="h-11 px-6">
            <Search className="w-4 h-4 mr-2" />
            {loading ? 'Retrieving…' : 'Ask'}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => ask(q)}
              disabled={!selectedRepo || loading}
              className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      </Card>

      {error && (
        <Card className="p-4 bg-card border-destructive/50 space-y-1">
          <p className="text-destructive text-sm font-medium">{error.title}</p>
          <p className="text-muted-foreground text-sm">{error.message}</p>
        </Card>
      )}

      {history.map((item, idx) => (
        <Card key={`${item.question}-${idx}`} className="p-6 bg-card border-border space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground flex-1 min-w-48">{item.question}</h3>
            <Badge variant="outline" className="text-muted-foreground border-border">
              {item.intent.replace(/_/g, ' ')}
            </Badge>
            <ConfidenceBadge confidence={item.confidence} />
            <ProviderBadge provider={item.provider} degraded={item.degraded} />
          </div>

          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{item.answer}</p>

          {item.sources.length > 0 && (
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Source files</p>
              <div className="space-y-2">
                {item.sources.map((s) => (
                  <div key={s.path} className="border border-border rounded-md p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-mono text-foreground flex-1 min-w-40 truncate">{s.path}</span>
                      <CategoryBadge category={s.category} />
                      <span className="text-xs text-muted-foreground">score {s.score}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{s.reason}</p>
                    {s.snippet && (
                      <pre className="mt-2 text-xs bg-muted/50 rounded p-3 overflow-auto max-h-48 text-muted-foreground">
                        {s.snippet}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => setQuestion(`Follow-up on "${item.question}": `)}
              className="text-xs text-primary hover:underline"
            >
              Ask a follow-up →
            </button>
            <a href="/planner" className="text-xs text-muted-foreground hover:text-foreground">
              Turn this into a change plan →
            </a>
          </div>
        </Card>
      ))}
    </div>
  )
}
