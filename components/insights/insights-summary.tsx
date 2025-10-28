import { Card } from '@/components/ui/card'
import { Brain } from 'lucide-react'

export function InsightsSummary({ summary, repoName }: { summary: string; repoName: string }) {
  return (
    <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-blue-500/10 p-6">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-lg bg-purple-500/20">
          <Brain className="w-6 h-6 text-purple-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold mb-2">AI Summary: {repoName}</h2>
          <p className="text-muted-foreground leading-relaxed">{summary}</p>
        </div>
      </div>
    </Card>
  )
}

