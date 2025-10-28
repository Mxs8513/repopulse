import { Card } from '@/components/ui/card'
import { Rocket } from 'lucide-react'

export function GettingStarted({ steps }: { steps: string[] }) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <Rocket className="w-5 h-5 text-blue-400" />
        <h3 className="text-lg font-semibold">Getting Started</h3>
      </div>
      <div className="space-y-3">
        {steps.slice(0, 4).map((step, index) => (
          <div key={index} className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
              {index + 1}
            </div>
            <p className="text-sm text-foreground flex-1">{step}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

