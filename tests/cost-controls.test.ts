import { describe, expect, it } from 'vitest'
import { deriveBudgetLevel, estimateCostUSD, getCostConfig } from '@/lib/ai/cost-controls'

describe('estimateCostUSD (gpt-4o-mini pricing)', () => {
  it('estimates a typical ask call at a fraction of a cent', () => {
    // ~8k chars of context (2k tokens) + 1200 max output tokens
    const usd = estimateCostUSD(8000, 1200)
    expect(usd).toBeGreaterThan(0)
    expect(usd).toBeLessThan(0.005)
  })

  it('scales with input size', () => {
    expect(estimateCostUSD(35000, 1200)).toBeGreaterThan(estimateCostUSD(5000, 1200))
  })

  it('keeps a heavy demo month near the light demo budget', () => {
    // 200 calls/day x 30 days at worst-case context = the absolute ceiling
    const worstCallUSD = estimateCostUSD(35000, 1200)
    expect(worstCallUSD * 200 * 30).toBeLessThan(12 * 2) // even the ceiling is near budget
    // a realistic day (40 calls at ~10k chars) is comfortably cheap
    expect(estimateCostUSD(10000, 1200) * 40 * 30).toBeLessThan(12)
  })
})

describe('deriveBudgetLevel thresholds', () => {
  it('returns ok below 50%', () => {
    expect(deriveBudgetLevel(3.9, 8, 10, 120)).toBe('ok')
  })

  it('warns at 50% and 80%', () => {
    expect(deriveBudgetLevel(4, 8, 10, 120)).toBe('warn_50')
    expect(deriveBudgetLevel(6.4, 8, 10, 120)).toBe('warn_80')
  })

  it('blocks at 100% of the monthly budget', () => {
    expect(deriveBudgetLevel(8, 8, 10, 120)).toBe('blocked')
    expect(deriveBudgetLevel(9.5, 8, 10, 120)).toBe('blocked')
  })

  it('blocks when the daily call limit is reached regardless of spend', () => {
    expect(deriveBudgetLevel(0.5, 8, 120, 120)).toBe('blocked')
  })
})

describe('getCostConfig defaults', () => {
  it('matches the recommended light demo defaults', () => {
    const c = getCostConfig()
    expect(c.maxOutputTokens).toBe(1200)
    expect(c.maxContextChars).toBe(35000)
    expect(c.maxRetrievedFiles).toBe(8)
    expect(c.snippetsPerFile).toBe(3)
    expect(c.snippetChars).toBe(2500)
    expect(c.cacheEnabled).toBe(true)
    expect(c.dailyCallLimit).toBe(200)
    expect(c.reportDailyLimit).toBe(100)
    expect(c.monthlyBudgetUSD).toBe(12)
  })
})
