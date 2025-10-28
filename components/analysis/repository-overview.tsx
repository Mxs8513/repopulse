import { Card } from '@/components/ui/card'
import { Code2, Star, Users, AlertCircle } from 'lucide-react'

export function RepositoryOverview({ 
  overview, 
  repoName, 
  description, 
  stars, 
  language 
}: { 
  overview: string
  repoName: string
  description: string
  stars: number
  language: string
}) {
  return (
    <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-blue-500/10 p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="p-3 rounded-lg bg-purple-500/20">
          <Code2 className="w-6 h-6 text-purple-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold mb-2">{repoName}</h2>
          <p className="text-muted-foreground mb-4">{description || 'No description available'}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-yellow-500" />
          <span className="text-sm font-semibold">{stars.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold">{language}</span>
        </div>
      </div>
      <div className="p-4 bg-background/50 rounded-lg">
        <p className="text-sm text-foreground leading-relaxed">{overview}</p>
      </div>
    </Card>
  )
}

