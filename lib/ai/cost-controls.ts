// Cost controls for live AI providers, tuned for a small monthly budget.
// All AI calls are on-demand (user-triggered) — nothing here runs during
// indexing or page load. Usage is tracked server-side in a local JSON file
// (gitignored) with an in-memory fallback for read-only filesystems.

import fs from 'fs'
import path from 'path'

// ---------- Env knobs (recommended defaults for a light demo budget) ----------

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name])
  return Number.isFinite(v) && v > 0 ? v : fallback
}

export function getCostConfig() {
  return {
    maxOutputTokens: envInt('OPENAI_MAX_OUTPUT_TOKENS', 1200),
    maxContextChars: envInt('OPENAI_MAX_CONTEXT_CHARS', 35000),
    maxRetrievedFiles: envInt('OPENAI_MAX_RETRIEVED_FILES', 8),
    snippetsPerFile: envInt('OPENAI_SNIPPETS_PER_FILE', 3),
    snippetChars: envInt('OPENAI_SNIPPET_CHARS', 2500),
    cacheEnabled: process.env.AI_CACHE_ENABLED !== 'false',
    dailyCallLimit: envInt('AI_DAILY_CALL_LIMIT', 200),
    reportDailyLimit: envInt('AI_REPORT_DAILY_LIMIT', 100),
    monthlyBudgetUSD: envInt('AI_MONTHLY_BUDGET_USD', 12),
  }
}

// ---------- Cost estimation (gpt-4o-mini pricing) ----------

const INPUT_USD_PER_MTOK = 0.15
const OUTPUT_USD_PER_MTOK = 0.6
const CHARS_PER_TOKEN = 4

/**
 * Conservative per-call estimate: full input plus the worst-case output
 * (max tokens). Real calls usually cost less, so the budget errs safe.
 */
export function estimateCostUSD(inputChars: number, maxOutputTokens: number): number {
  const inputTokens = Math.ceil(inputChars / CHARS_PER_TOKEN)
  const usd = (inputTokens * INPUT_USD_PER_MTOK + maxOutputTokens * OUTPUT_USD_PER_MTOK) / 1_000_000
  return Math.round(usd * 10000) / 10000
}

// ---------- Usage tracking ----------

export interface UsageState {
  month: string // e.g. "2026-06"
  estimatedUSD: number
  totalCalls: number
  day: string // e.g. "2026-06-12"
  callsToday: number
  reportDay?: string
  reportCallsToday?: number
}

const USAGE_FILE = path.join(process.cwd(), '.ai-usage.json')

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}
function currentDay(): string {
  return new Date().toISOString().slice(0, 10)
}

function emptyUsage(): UsageState {
  return { month: currentMonth(), estimatedUSD: 0, totalCalls: 0, day: currentDay(), callsToday: 0 }
}

let memoryUsage: UsageState | null = null

function normalize(state: UsageState): UsageState {
  if (state.month !== currentMonth()) return emptyUsage()
  const day = currentDay()
  let next = state
  if (next.day !== day) next = { ...next, day, callsToday: 0 }
  if ((next.reportDay ?? next.day) !== day) next = { ...next, reportDay: day, reportCallsToday: 0 }
  return next
}

export function getUsage(): UsageState {
  if (memoryUsage) return normalize(memoryUsage)
  try {
    const raw = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8'))
    memoryUsage = normalize({ ...emptyUsage(), ...raw })
  } catch {
    memoryUsage = emptyUsage()
  }
  return memoryUsage
}

function saveUsage(state: UsageState): void {
  memoryUsage = state
  try {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(state, null, 2))
  } catch {
    // Read-only filesystem (serverless) — in-memory tracking still applies.
  }
}

export function recordCall(costUSD: number): UsageState {
  const usage = getUsage()
  const updated: UsageState = {
    ...usage,
    estimatedUSD: Math.round((usage.estimatedUSD + costUSD) * 10000) / 10000,
    totalCalls: usage.totalCalls + 1,
    callsToday: usage.callsToday + 1,
  }
  saveUsage(updated)
  return updated
}

export interface ReportBudgetStatus {
  blocked: boolean
  callsToday: number
  dailyLimit: number
  message: string
}

export function getReportBudgetStatus(): ReportBudgetStatus {
  const usage = getUsage()
  const dailyLimit = getCostConfig().reportDailyLimit
  const callsToday = usage.reportCallsToday ?? 0
  const blocked = callsToday >= dailyLimit
  return {
    blocked,
    callsToday,
    dailyLimit,
    message: blocked
      ? 'Enhanced report wording limit reached today. A technical report is still available.'
      : `${callsToday}/${dailyLimit} enhanced report wording calls used today.`,
  }
}

export function recordReportCall(): ReportBudgetStatus {
  const usage = getUsage()
  const day = currentDay()
  saveUsage({
    ...usage,
    reportDay: day,
    reportCallsToday: (usage.reportCallsToday ?? 0) + 1,
  })
  return getReportBudgetStatus()
}

// ---------- Budget status ----------

export type BudgetLevel = 'ok' | 'warn_50' | 'warn_80' | 'blocked'

export interface BudgetStatus {
  level: BudgetLevel
  monthUSD: number
  budgetUSD: number
  percentUsed: number
  callsToday: number
  dailyLimit: number
  message: string
}

/** Pure threshold logic, exported for tests. */
export function deriveBudgetLevel(
  monthUSD: number,
  budgetUSD: number,
  callsToday: number,
  dailyLimit: number
): BudgetLevel {
  if (monthUSD >= budgetUSD || callsToday >= dailyLimit) return 'blocked'
  const pct = monthUSD / budgetUSD
  if (pct >= 0.8) return 'warn_80'
  if (pct >= 0.5) return 'warn_50'
  return 'ok'
}

export function getBudgetStatus(): BudgetStatus {
  const { monthlyBudgetUSD, dailyCallLimit } = getCostConfig()
  const usage = getUsage()
  const level = deriveBudgetLevel(usage.estimatedUSD, monthlyBudgetUSD, usage.callsToday, dailyCallLimit)
  const percentUsed = Math.round((usage.estimatedUSD / monthlyBudgetUSD) * 100)

  const messages: Record<BudgetLevel, string> = {
    ok: `$${usage.estimatedUSD.toFixed(2)} of $${monthlyBudgetUSD} monthly AI budget used.`,
    warn_50: `Over half the monthly AI budget is used ($${usage.estimatedUSD.toFixed(2)} of $${monthlyBudgetUSD}).`,
    warn_80: `Approaching the monthly AI budget ($${usage.estimatedUSD.toFixed(2)} of $${monthlyBudgetUSD}). Live AI calls will be blocked at 100%.`,
    blocked:
      usage.callsToday >= dailyCallLimit
        ? `Daily AI call limit reached (${usage.callsToday}/${dailyCallLimit}). Live calls fall back to mock mode until tomorrow.`
        : `Monthly AI budget exhausted ($${usage.estimatedUSD.toFixed(2)} of $${monthlyBudgetUSD}). Live calls fall back to mock mode until next month.`,
  }

  return {
    level,
    monthUSD: usage.estimatedUSD,
    budgetUSD: monthlyBudgetUSD,
    percentUsed,
    callsToday: usage.callsToday,
    dailyLimit: dailyCallLimit,
    message: messages[level],
  }
}

// ---------- Prompt/response cache (repeated prompts never re-call the API) ----------

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const responseCache = new Map<string, { value: unknown; expires: number }>()

export function getCachedResponse<T>(key: string): T | undefined {
  if (!getCostConfig().cacheEnabled) return undefined
  const hit = responseCache.get(key)
  if (hit && hit.expires > Date.now()) return hit.value as T
  if (hit) responseCache.delete(key)
  return undefined
}

export function setCachedResponse(key: string, value: unknown): void {
  if (!getCostConfig().cacheEnabled) return
  // Bound the cache so a long dev session can't grow it unbounded.
  if (responseCache.size > 500) {
    const oldest = responseCache.keys().next().value
    if (oldest) responseCache.delete(oldest)
  }
  responseCache.set(key, { value, expires: Date.now() + CACHE_TTL_MS })
}
