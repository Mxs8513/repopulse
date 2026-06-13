import { NextResponse } from 'next/server'
import { PROVIDER_MODELS, resolveProviderName } from '@/lib/ai/provider'
import { getCostConfig } from '@/lib/ai/cost-controls'
import { isSandboxEnabled } from '@/lib/agent/sandbox'

export const dynamic = 'force-dynamic'

export async function GET() {
  const provider = resolveProviderName()
  // Booleans and public names only — never echo configuration values.
  return NextResponse.json({
    ok: true,
    ts: Date.now(),
    githubTokenConfigured: Boolean(process.env.MY_GITHUB_PAT || process.env.GITHUB_TOKEN),
    aiProvider: provider,
    mockMode: provider === 'mock',
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    activeModel: PROVIDER_MODELS[provider],
    costGuardEnabled: getCostConfig().monthlyBudgetUSD > 0,
    sandboxEnabled: isSandboxEnabled(),
  })
}
