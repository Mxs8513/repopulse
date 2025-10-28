'use client'

import { useState, useEffect } from 'react'
import { useRepository } from '@/lib/repository-context'
import { useRepoData } from '@/hooks/use-repo-data'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Loader2, AlertCircle, GitCommit } from 'lucide-react'
import { CommitCard } from './commit-card'
import { CommitDetailModal } from './commit-detail-modal'
import type { Commit } from './commit-card'

export function CommitsList() {
  const { selectedRepo, setSelectedRepo } = useRepository()
  const [inputValue, setInputValue] = useState(selectedRepo || 'facebook/react')
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null)
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

  const commits = data?.commits || []

  return (
    <div className="space-y-6">
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
          <span className="ml-3 text-muted-foreground">Loading commits...</span>
        </div>
      )}

      {error && (
        <Card className="border-red-500/20 bg-red-500/10 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-red-500 mb-2">Error Loading Commits</h3>
              <p className="text-sm text-muted-foreground">{error.message || 'Failed to load repository data'}</p>
            </div>
          </div>
        </Card>
      )}

      {commits.length > 0 && !isLoading && (
        <>
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">{commits.length} commits</h2>
                <p className="text-sm text-muted-foreground mt-1">Repository: {data?.repository.fullName}</p>
              </div>
            </div>
          </Card>

          <div className="space-y-3">
            {commits.map((commit, index) => (
              <div
                key={index}
                onClick={() => setSelectedCommit(commit)}
              >
                <CommitCard
                  commit={commit}
                  repoFullName={data?.repository.fullName || ''}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Commit Detail Modal */}
      {selectedCommit && (
        <CommitDetailModal
          commit={selectedCommit}
          onClose={() => setSelectedCommit(null)}
          repoFullName={data?.repository.fullName || ''}
        />
      )}

      {commits.length === 0 && !isLoading && !error && (
        <Card className="p-12 text-center">
          <GitCommit className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">No commits found. Load a repository to see commit history.</p>
        </Card>
      )}
    </div>
  )
}

