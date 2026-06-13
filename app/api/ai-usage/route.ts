// Read-only budget/usage status for the UI. Never calls an AI provider.

import { NextResponse } from 'next/server'
import { getBudgetStatus, getCostConfig, getUsage } from '@/lib/ai/cost-controls'
import { resolveProviderName } from '@/lib/ai/provider'

export const dynamic = 'force-dynamic'

export async function GET() {
  const usage = getUsage()
  const config = getCostConfig()
  const response = NextResponse.json({
    provider: resolveProviderName(),
    budget: getBudgetStatus(),
    usage: {
      month: usage.month,
      totalCalls: usage.totalCalls,
      callsToday: usage.callsToday,
      estimatedUSD: usage.estimatedUSD,
    },
    limits: {
      maxOutputTokens: config.maxOutputTokens,
      maxContextChars: config.maxContextChars,
      maxRetrievedFiles: config.maxRetrievedFiles,
      snippetsPerFile: config.snippetsPerFile,
      snippetChars: config.snippetChars,
      dailyCallLimit: config.dailyCallLimit,
      monthlyBudgetUSD: config.monthlyBudgetUSD,
      cacheEnabled: config.cacheEnabled,
    },
  })
  response.headers.set('Cache-Control', 'no-store, max-age=0')
  return response
}
