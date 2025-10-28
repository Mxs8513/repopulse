import { Card } from '@/components/ui/card'
import { CheckCircle2 } from 'lucide-react'

export function KeyFeatures({ features }: { features: string[] }) {
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Key Features</h3>
      <div className="space-y-3">
        {features.slice(0, 5).map((feature, index) => (
          <div key={index} className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-foreground">{feature}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

