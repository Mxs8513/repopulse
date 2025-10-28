import { Card } from '@/components/ui/card'
import { Code2 } from 'lucide-react'

const colors = ['bg-primary', 'bg-warning', 'bg-secondary', 'bg-destructive', 'bg-chart-5']

export function LanguageBreakdown({ languages }: { languages: Array<{ language: string; percentage: string }> }) {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="p-3 rounded-lg bg-cyan-500/10">
          <Code2 className="w-6 h-6 text-cyan-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold">Language Distribution</h3>
        </div>
      </div>
      <div className="space-y-4">
        {languages.slice(0, 5).map((lang, index) => (
          <div key={lang.language}>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-foreground font-medium">{lang.language}</span>
              <span className="text-muted-foreground">{lang.percentage}%</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full ${colors[index % colors.length]}`} 
                style={{ width: `${lang.percentage}%` }} 
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

