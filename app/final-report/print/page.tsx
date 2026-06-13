'use client'

import { Suspense, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FinalEngineeringReport } from '@/components/agent/final-report'
import { useAgentRuns } from '@/hooks/use-agent-runs'

function PrintBodyClass() {
  useEffect(() => {
    document.body.classList.add('final-report-print-route')
    return () => document.body.classList.remove('final-report-print-route')
  }, [])
  return null
}

function FinalReportPrintContent() {
  const runs = useAgentRuns()
  const searchParams = useSearchParams()
  const selectedId = searchParams.get('run')
  const selected = selectedId ? runs.find((run) => run.runId === selectedId) : undefined

  return (
    <div className="final-report-export-page min-h-screen bg-white text-neutral-950">
      <PrintBodyClass />
      {!selectedId || !selected ? (
        <Card className="m-6 p-6 bg-white text-neutral-950 border-neutral-200">
          <p className="text-sm text-neutral-700">Choose a report from the Final Report page before exporting a PDF.</p>
          <Button asChild size="sm" variant="outline" className="mt-4">
            <Link href="/final-report">Back to Final Report</Link>
          </Button>
        </Card>
      ) : (
        <>
          <div className="final-report-export-actions mx-auto max-w-4xl px-6 py-4 text-sm text-neutral-700 print:hidden">
            <p>For the cleanest PDF, turn off browser headers and footers in the print dialog.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => window.print()}>Save as PDF</Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/final-report?run=${selected.runId}`}>Back to report</Link>
              </Button>
            </div>
          </div>
          <main className="mx-auto max-w-4xl bg-white px-6 py-6 print:max-w-none print:p-0">
            <FinalEngineeringReport run={selected} documentMode />
          </main>
        </>
      )}
    </div>
  )
}

export default function FinalReportPrintPage() {
  return (
    <Suspense fallback={null}>
      <FinalReportPrintContent />
    </Suspense>
  )
}
