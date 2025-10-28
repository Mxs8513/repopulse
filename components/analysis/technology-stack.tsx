import { Card } from '@/components/ui/card'
import { Code2 } from 'lucide-react'

export function TechnologyStack({ stack }: { stack: string[] }) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <Code2 className="w-5 h-5 text-purple-400" />
        <h3 className="text-lg font-semibold">Technology Stack</h3>
      </div>
      <div className="space-y-2">
        {stack.slice(0, 5).map((tech, index) => (
          <div key={index} className="p-2 bg-muted/50 rounded-md">
            <p className="text-sm text-foreground">{tech}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

