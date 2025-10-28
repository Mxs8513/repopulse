'use client'

import { useState, useEffect } from 'react'
import { useRepository } from '@/lib/repository-context'
import { useRepoData } from '@/hooks/use-repo-data'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, AlertCircle, Clock } from 'lucide-react'
import { format } from 'date-fns'

export function TimelineView() {
  const { selectedRepo, setSelectedRepo } = useRepository()
  const [inputValue, setInputValue] = useState(selectedRepo || 'facebook/react')
  const { data, error, isLoading } = useRepoData(selectedRepo)

  // Sync inputValue with selectedRepo when it changes
  useEffect(() => {
    if (selectedRepo && selectedRepo !== inputValue) {
      setInputValue(selectedRepo)
    }
  }, [selectedRepo])

  const handleLoad = () => {
    setSelectedRepo(inputValue.trim())
    if (typeof window !== 'undefined') {
      localStorage.setItem('currentRepository', inputValue.trim())
    }
  }

  return (
    <div className="min-h-screen p-6 space-y-6">
      <Card className="p-6 bg-card border-border shadow-lg">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Enter repository (e.g., facebook/react)"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
            className="flex-1 h-12 bg-background border-border text-foreground"
          />
          <Button
            onClick={handleLoad}
            disabled={isLoading}
            className="px-8 h-12 bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Load'}
          </Button>
        </div>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Loading commit history...</span>
        </div>
      )}

      {error && (
        <Card className="border-red-500/20 bg-red-500/10 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-red-500 mb-2">Error Loading Timeline</h3>
              <p className="text-sm text-muted-foreground">{error.message || 'Failed to load repository data'}</p>
            </div>
          </div>
        </Card>
      )}

      {data && !isLoading && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Clock className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold">Commit Timeline: {data.repository.fullName}</h1>
          </div>
          
          {data.commits && data.commits.length > 0 ? (
            <div className="space-y-4">
              {data.commits.map((commit, index) => (
                <Card key={index} className="p-6 hover:border-primary transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="w-3 h-3 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground mb-1">{commit.message}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{commit.author.name}</span>
                        <span>•</span>
                        <span>{format(new Date(commit.date), 'MMM d, yyyy')}</span>
                        <span>•</span>
                        <code className="text-xs">{commit.sha}</code>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span className="text-green-500">+{commit.stats.additions}</span>
                        <span className="text-red-500">-{commit.stats.deletions}</span>
                        <span className="text-muted-foreground">{commit.files.length} files</span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">No commits found for this repository</p>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

