'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ProviderBadge } from '@/components/agent/badges'
import type { AIProviderName } from '@/lib/agent/types'

export interface AnalyticsMetaInfo {
  provider: AIProviderName
  model: string
  cached: boolean
  degraded: boolean
  unavailableReason?: string
}

/**
 * Provider / model / cache status for the Analysis and Insights pages, with
 * an exact explanation whenever live AI output is unavailable.
 */
export function AnalyticsMetaBar({ meta }: { meta?: AnalyticsMetaInfo | null }) {
  if (!meta) return null
  return (
    <Card className="p-3 bg-card border-border space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">AI analysis:</span>
        <ProviderBadge provider={meta.provider} degraded={meta.degraded} />
        <Badge variant="outline" className="text-muted-foreground border-border">
          {meta.model}
        </Badge>
        <Badge
          variant="outline"
          className={meta.cached ? 'text-muted-foreground border-border' : 'text-primary border-primary'}
        >
          {meta.cached ? 'cached' : 'fresh'}
        </Badge>
      </div>
      {meta.unavailableReason && (
        <p className="text-xs text-warning">{meta.unavailableReason}</p>
      )}
    </Card>
  )
}
