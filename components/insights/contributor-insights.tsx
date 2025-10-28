import { Card } from '@/components/ui/card'
import { Users } from 'lucide-react'

export function ContributorInsights({ contributors }: { contributors: Array<{ login: string; contributions: number; avatar: string }> }) {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-4 mb-4">
        <div className="p-3 rounded-lg bg-green-500/10">
          <Users className="w-6 h-6 text-green-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold">Top Contributors</h3>
        </div>
      </div>
      <div className="space-y-3">
        {contributors.slice(0, 5).map((contributor, index) => (
          <div key={contributor.login} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold">
              {index + 1}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{contributor.login}</p>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                <div 
                  className="h-full bg-primary" 
                  style={{ width: `${Math.min((contributor.contributions / 100) * 100, 100)}%` }} 
                />
              </div>
            </div>
            <span className="text-sm font-semibold">{contributor.contributions}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

