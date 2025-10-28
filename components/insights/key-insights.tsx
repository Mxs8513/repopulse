import { Card } from '@/components/ui/card'
import { Sparkles, TrendingUp, Code2, Users } from 'lucide-react'

const icons = [Sparkles, TrendingUp, Code2, Users]

export function KeyInsights({ insights }: { insights: string[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {insights.map((insight, index) => {
        const Icon = icons[index % icons.length]
        const colors = ['text-purple-400', 'text-blue-400', 'text-cyan-400', 'text-green-400']
        const bgColors = ['bg-purple-500/10', 'bg-blue-500/10', 'bg-cyan-500/10', 'bg-green-500/10']
        
        return (
          <Card key={index} className="p-6 hover:border-primary transition-colors">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-lg ${bgColors[index % bgColors.length]}`}>
                <Icon className={`w-5 h-5 ${colors[index % colors.length]}`} />
              </div>
              <p className="text-sm text-foreground leading-relaxed flex-1">{insight}</p>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

