'use client'

import { useState, useEffect } from 'react'
import { useRepository } from '@/lib/repository-context'
import { useRepoData } from '@/hooks/use-repo-data'
import { InsightsSummary } from './insights-summary'
import { KeyInsights } from './key-insights'
import { TrendAnalysis } from './trend-analysis'
import { ContributorInsights } from './contributor-insights'
import { LanguageBreakdown } from './language-breakdown'
import { Loader2, AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function InsightsView() {
  const { selectedRepo, setSelectedRepo } = useRepository()
  const [inputValue, setInputValue] = useState(selectedRepo || 'facebook/react')
  const aiEnabledRepo = selectedRepo ? `${selectedRepo}?enableAI=true` : null
  const { data, error, isLoading } = useRepoData(aiEnabledRepo)

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
            {isLoading ? 'Analyzing...' : 'Analyze'}
          </Button>
        </div>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Generating AI insights...</span>
        </div>
      )}

      {error && (
        <Card className="border-red-500/20 bg-red-500/10 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-red-500 mb-2">Error Loading Insights</h3>
              <p className="text-sm text-muted-foreground">{error.message || 'Failed to load repository data'}</p>
            </div>
          </div>
        </Card>
      )}

      {data && !isLoading && (
        <div className="space-y-6">
          <InsightsSummary 
            summary={data.ai?.summary || 'No summary available'} 
            repoName={data.repository.fullName}
          />
          <KeyInsights insights={data.ai?.insights || []} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TrendAnalysis trend={data.ai?.trends || 'No trend data available'} />
            <ContributorInsights contributors={data.contributors || []} />
          </div>
          <LanguageBreakdown languages={data.stats?.languages || []} />
        </div>
      )}
    </div>
  )
}

