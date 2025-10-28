import { Card } from '@/components/ui/card'
import { Star, GitFork, Users, AlertCircle } from 'lucide-react'

export function CommunityStats({ 
  stars, 
  forks, 
  contributors, 
  openIssues 
}: { 
  stars: number
  forks: number
  contributors: number
  openIssues: number
}) {
  const stats = [
    { label: 'Stars', value: stars.toLocaleString(), icon: Star, color: 'text-yellow-500' },
    { label: 'Forks', value: forks.toLocaleString(), icon: GitFork, color: 'text-blue-500' },
    { label: 'Contributors', value: contributors.toString(), icon: Users, color: 'text-green-500' },
    { label: 'Open Issues', value: openIssues.toString(), icon: AlertCircle, color: 'text-red-500' },
  ]

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Community Stats</h3>
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          return (
            <div key={index} className="p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <Icon className={`w-5 h-5 ${stat.color}`} />
                <span className="text-sm text-muted-foreground">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

