import { Card } from '@/components/ui/card'
import { TrendingUp } from 'lucide-react'

export function TrendAnalysis({ trend }: { trend: string }) {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-lg bg-blue-500/10">
          <TrendingUp className="w-6 h-6 text-blue-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold mb-2">Development Trends</h3>
          <p className="text-muted-foreground">{trend}</p>
        </div>
      </div>
    </Card>
  )
}

