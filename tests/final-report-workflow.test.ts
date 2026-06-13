import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(path, 'utf-8')
}

describe('Final Report workflow placement', () => {
  it('Final Report route renders the dedicated report experience', () => {
    const page = source('app/final-report/page.tsx')
    expect(page).toContain('Final Engineering Report')
    expect(page).toContain('FinalEngineeringReport')
    expect(page).toContain('/final-report?run=')
    expect(page).toContain('/final-report/print?run=')
    expect(page).toContain('Export PDF')
    expect(page).not.toContain('Open PDF Preview')
  })

  it('dedicated print route renders document mode without the normal report controls', () => {
    const page = source('app/final-report/print/page.tsx')
    expect(page).toContain('final-report-print-route')
    expect(page).toContain('documentMode')
    expect(page).toContain('Save as PDF')
    expect(page).toContain('For the cleanest PDF')
    expect(page).not.toContain('PDF preview')
    expect(page).not.toContain('Export Visual Report')
    expect(page).not.toContain('Download Report Markdown')
    expect(page).not.toContain('Improve Report Wording')
  })

  it('sidebar includes Final Report under Agent Workflow after Agent Runs', () => {
    const sidebar = source('components/dashboard/sidebar/index.tsx')
    const agentRuns = sidebar.indexOf('title: "Agent Runs"')
    const finalReport = sidebar.indexOf('title: "Final Report"')
    expect(agentRuns).toBeGreaterThan(-1)
    expect(finalReport).toBeGreaterThan(agentRuns)
    expect(sidebar).toContain('url: "/final-report"')
  })

  it('Run Detail links to Final Report instead of embedding the full visual report', () => {
    const detail = source('components/agent/run-detail.tsx')
    expect(detail).toContain('Open Final Engineering Report')
    expect(detail).toContain('/final-report?run=')
    expect(detail).not.toContain('<FinalEngineeringReport run={run} />')
  })

  it('Final Report UI keeps PDF export and Markdown export available', () => {
    const report = source('components/agent/final-report.tsx')
    expect(report).toContain('Download Report Markdown')
    expect(report).toContain('Export Visual Report')
    expect(report).not.toContain('Improve Report Wording')
  })

  it('print CSS avoids forced blank pages and uses compact diff rows', () => {
    const css = source('app/globals.css')
    expect(css).toContain('.report-diff-print-summary')
    expect(css).toContain('.report-diff-print-table')
    expect(css).toContain('table-layout: fixed')
    expect(css).toContain('.report-diff-print-cards')
    expect(css).toContain('.report-diff-table')
    expect(css).toContain('.final-report-export-actions')
    expect(css).toContain('.final-report-ai-notice')
    expect(css).toContain('.report-technical-appendix')
    expect(css).toContain('body.final-report-print-route')
    expect(css).toContain('color-scheme: light')
    expect(css).toContain('opacity: 1')
    expect(css).toContain('overflow-wrap: anywhere')
    expect(css).toContain('font-family: Arial, Helvetica, sans-serif')
    expect(css).not.toContain('break-after: page')
    expect(css).not.toContain('page-break-before: always')
  })
})
