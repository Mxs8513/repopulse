import { Card } from '@/components/ui/card'
import { Target } from 'lucide-react'

export function UseCases({ useCases }: { useCases: string[] }) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <Target className="w-5 h-5 text-orange-400" />
        <h3 className="text-lg font-semibold">Use Cases</h3>
      </div>
      <div className="space-y-2">
        {useCases.slice(0, 4).map((useCase, index) => (
          <div key={index} className="p-3 bg-muted/50 rounded-md">
            <p className="text-sm text-foreground">{useCase}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

