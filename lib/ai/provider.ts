// AI provider abstraction. Selects openai | groq | anthropic | mock via
// AI_PROVIDER, falling back automatically: explicit env choice → openai if
// OPENAI_API_KEY → groq if GROQ_API_KEY → anthropic if ANTHROPIC_API_KEY →
// mock. Clients are created lazily per request so a missing API key can
// never crash the build or the app.
//
// The provider only ever SUMMARIZES retrieved repository evidence passed in
// by the caller — never the whole repo. Grounding rules live in the prompts:
// never invent file paths. Live calls go through budget + cache guards in
// withFallback (see lib/ai/cost-controls.ts).

import type {
  AIProviderName,
  ChangePlan,
  QuestionIntent,
  RetrievedFile,
} from '@/lib/agent/types'
import {
  estimateCostUSD,
  getBudgetStatus,
  getCachedResponse,
  getCostConfig,
  recordCall,
  setCachedResponse,
} from './cost-controls'
import type { BudgetStatus } from './cost-controls'

export interface AskContext {
  repo: string
  question: string
  intent: QuestionIntent
  sources: RetrievedFile[]
  architectureText: string
}

export interface PlanContext {
  repo: string
  task: string
  affectedFiles: RetrievedFile[]
  architectureText: string
  hasTests: boolean
  verificationCommands: string[]
}

export interface DiffContext {
  repo: string
  task: string
  planSteps: string[]
  file: {
    path: string
    content: string | null
    unavailableReason?: string
  }
}

export interface AnalyticsContext {
  repo: string
  /** Compact stats only — never raw file contents or the whole repo. */
  statsSummary: string
  commitMessages: string[]
}

/**
 * Facts for the optional AI-polished executive summary of a final engineering
 * report. These are DERIVED deterministically from a completed run; the AI may
 * only rephrase them into prose and must never recompute or invent results.
 */
export interface ReportNarrativeContext {
  repo: string
  task: string
  /** Plain-English sandbox/workflow conclusion (already decided). */
  conclusion: string
  approvalStatus: string
  approved: number
  rejected: number
  /** Null when the sandbox has not run / phase did not execute. */
  baselinePassed: boolean | null
  patchedPassed: boolean | null
  /** Whether approved patches were actually applied inside the sandbox clone. */
  patchTestedInSandbox: boolean
  confidence: number
  /** The deterministic narrative, used as a grounding baseline to rephrase. */
  deterministicNarrative: string
  deterministicBusinessSummary?: string
  deterministicKeyFindings?: string[]
  deterministicConfidenceExplanation?: string
  deterministicRecommendations?: string[]
}

export interface ReportWordingResult {
  narrative: string
  businessSummary: string
  keyFindings: string[]
  confidenceExplanation: string
  recommendations: string[]
}

export interface AIProvider {
  name: AIProviderName
  answerRepoQuestion(ctx: AskContext): Promise<string>
  generateChangePlan(ctx: PlanContext): Promise<Pick<ChangePlan, 'taskSummary' | 'steps' | 'assumptions' | 'risks'>>
  generateDiffProposal(ctx: DiffContext): Promise<{ changeSummary: string; reasoning: string; proposedChange: string; proposedContent?: string }>
  generateRepoSummary(repo: string, commitMessages: string[]): Promise<string>
  generateRepoInsights(ctx: AnalyticsContext): Promise<string[]>
  /** Polish a deterministic engineering-report summary into 2–4 prose sentences. */
  generateEngineeringSummary(ctx: ReportNarrativeContext): Promise<string>
  /** Improve stakeholder-facing report wording without changing facts. */
  generateEngineeringReportWording?(ctx: ReportNarrativeContext): Promise<ReportWordingResult>
}

/** Model used by each provider, for UI badges. Safe to expose. */
export const PROVIDER_MODELS: Record<AIProviderName, string> = {
  openai: 'gpt-4o-mini',
  groq: 'llama-3.1-8b-instant',
  anthropic: 'claude-haiku-4-5',
  mock: 'deterministic',
}

const GROUNDING_RULES = `Rules:
- Only reference file paths that appear in the provided evidence. Never invent paths.
- If the evidence is insufficient, say so explicitly instead of guessing.
- Be concise and technical.`

// ---------- Mock provider (deterministic, no API key needed) ----------

const mockProvider: AIProvider = {
  name: 'mock',

  async answerRepoQuestion(ctx) {
    if (ctx.sources.length === 0) {
      return `I don't have enough indexed file content to answer that confidently. No relevant paths were found for this question.`
    }
    const top = ctx.sources.slice(0, 3)
    const lines = top.map((s) => `- ${s.path} (${s.category.replace(/_/g, ' ')}) — ${s.reason}`)
    return [
      `Based on the indexed file tree of ${ctx.repo}, the most relevant files for this ${ctx.intent.replace(/_/g, ' ')} are:`,
      ...lines,
      '',
      `${ctx.architectureText}`,
      '',
      '[Mock provider: deterministic answer assembled from retrieved evidence — set OPENAI_API_KEY, GROQ_API_KEY, or ANTHROPIC_API_KEY for AI-written summaries.]',
    ].join('\n')
  },

  async generateChangePlan(ctx) {
    const fileList = ctx.affectedFiles.map((f) => f.path)
    const steps = [
      ...fileList.slice(0, 4).map((p) => `Inspect ${p} and confirm it is the right place for this change`),
      `Implement: ${ctx.task}`,
      ctx.hasTests
        ? 'Add or update tests covering the new behavior'
        : 'Add a small testable utility plus a test if feasible (no existing test suite detected)',
      ...ctx.verificationCommands.slice(0, 2).map((c) => `Run ${c} and confirm it passes`),
    ]
    return {
      taskSummary: ctx.task,
      steps,
      assumptions: [
        'Plan is based on file paths and repository structure only (mock provider; file contents not analyzed).',
        `Affected-file selection used keyword retrieval over ${ctx.repo}'s indexed tree.`,
      ],
      risks: [
        'Affected files are inferred from path names; verify each file before editing.',
        ctx.hasTests ? 'Existing tests may need updating.' : 'No test suite detected — regressions are harder to catch.',
      ],
    }
  },

  async generateDiffProposal(ctx) {
    if (!ctx.file.content) {
      return {
        changeSummary: `Cannot propose an exact patch for ${ctx.file.path}.`,
        reasoning: ctx.file.unavailableReason || 'File content was not retrieved.',
        proposedChange: 'Need file content before proposing exact patch.',
      }
    }
    const preview = ctx.file.content.split('\n').slice(0, 6).join('\n')
    return {
      changeSummary: `Apply "${ctx.task}" to ${ctx.file.path}`,
      reasoning: 'Mock provider: shows where the change would anchor without generating speculative code. Use a real AI provider for concrete patch suggestions.',
      proposedChange: [
        `# Conceptual change for ${ctx.file.path}`,
        `# Task: ${ctx.task}`,
        `# Plan steps: ${ctx.planSteps.slice(0, 2).join('; ') || 'n/a'}`,
        '',
        '--- current file starts with ---',
        preview,
        '--- proposed: modify this file per the plan; exact edits require an AI provider ---',
      ].join('\n'),
    }
  },

  async generateRepoSummary(repo, commitMessages) {
    const n = commitMessages.length
    return `Recent activity in ${repo}: ${n} commits indexed. Latest: "${commitMessages[0] || 'n/a'}". [Mock provider — deterministic summary.]`
  },

  async generateRepoInsights(ctx) {
    const fixes = ctx.commitMessages.filter((m) => /\bfix/i.test(m)).length
    const feats = ctx.commitMessages.filter((m) => /\bfeat|add/i.test(m)).length
    return [
      `${ctx.commitMessages.length} recent commits analyzed for ${ctx.repo} (${feats} feature/addition, ${fixes} fix-related).`,
      `Repository stats snapshot: ${ctx.statsSummary || 'not available'}.`,
      'Commit messages suggest ongoing iterative development rather than large rewrites.',
      '[Mock provider — set OPENAI_API_KEY for AI-written insights.]',
    ]
  },

  async generateEngineeringSummary(ctx) {
    // Deterministic fallback: return the narrative the report builder already
    // produced. No facts are invented or recomputed here.
    return ctx.deterministicNarrative
  },

  async generateEngineeringReportWording(ctx) {
    return {
      narrative: ctx.deterministicNarrative,
      businessSummary: ctx.deterministicBusinessSummary ?? ctx.deterministicNarrative,
      keyFindings: ctx.deterministicKeyFindings ?? [],
      confidenceExplanation: ctx.deterministicConfidenceExplanation ?? '',
      recommendations: ctx.deterministicRecommendations ?? [],
    }
  },
}

// ---------- OpenAI provider (REST API; gpt-4o-mini for cost efficiency) ----------

async function openaiComplete(system: string, user: string, maxTokens = 800): Promise<string> {
  const { maxOutputTokens, maxContextChars } = getCostConfig()
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY || ''}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: Math.min(maxTokens, maxOutputTokens),
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        // Hard cap on context size — the whole repo is never sent.
        { role: 'user', content: user.slice(0, maxContextChars) },
      ],
    }),
  })
  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

// ---------- Groq provider ----------

async function groqComplete(system: string, user: string, maxTokens = 800): Promise<string> {
  const { default: Groq } = await import('groq-sdk')
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY })
  const response = await client.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: maxTokens,
    temperature: 0.3,
  })
  return response.choices[0]?.message?.content || ''
}

// ---------- Anthropic provider (REST API; no extra SDK dependency) ----------

async function anthropicComplete(system: string, user: string, maxTokens = 800): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status}`)
  }
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

type CompleteFn = (system: string, user: string, maxTokens?: number) => Promise<string>

function makeLLMProvider(name: 'openai' | 'groq' | 'anthropic', complete: CompleteFn): AIProvider {
  return {
    name,

    async answerRepoQuestion(ctx) {
      if (ctx.sources.length === 0) {
        return `I don't have enough indexed file content to answer that confidently. No relevant paths were found for this question.`
      }
      const evidence = ctx.sources
        .map((s) => `- ${s.path} [${s.category}] (${s.reason})${s.snippet ? `\n  snippet:\n${s.snippet}` : ''}`)
        .join('\n')
      return complete(
        `You answer questions about a GitHub repository using ONLY the retrieved evidence provided. ${GROUNDING_RULES}`,
        `Repository: ${ctx.repo}\nArchitecture: ${ctx.architectureText}\nQuestion (${ctx.intent}): ${ctx.question}\n\nRetrieved evidence:\n${evidence}\n\nAnswer the question grounded in this evidence. Cite file paths.`
      )
    },

    async generateChangePlan(ctx) {
      const fileList = ctx.affectedFiles.map((f) => `- ${f.path} [${f.category}] (${f.reason})`).join('\n')
      const raw = await complete(
        `You are a senior engineer writing implementation plans. ${GROUNDING_RULES}
Respond with strict JSON: {"taskSummary": string, "steps": string[], "assumptions": string[], "risks": string[]}. No markdown fences.`,
        `Repository: ${ctx.repo}\nArchitecture: ${ctx.architectureText}\nTask: ${ctx.task}\nLikely affected files:\n${fileList}\nTests present: ${ctx.hasTests}\nVerification commands available: ${ctx.verificationCommands.join(', ') || 'none'}\n\nWrite a step-by-step implementation plan.`,
        1200
      )
      try {
        const parsed = JSON.parse(raw.replace(/^```(json)?/m, '').replace(/```\s*$/m, '').trim())
        if (Array.isArray(parsed.steps) && parsed.steps.length > 0) {
          return {
            taskSummary: String(parsed.taskSummary || ctx.task),
            steps: parsed.steps.map(String),
            assumptions: (parsed.assumptions || []).map(String),
            risks: (parsed.risks || []).map(String),
          }
        }
      } catch {
        // fall through to mock-shaped fallback below
      }
      return mockProvider.generateChangePlan(ctx)
    },

    async generateDiffProposal(ctx) {
      if (!ctx.file.content) {
        return {
          changeSummary: `Cannot propose an exact patch for ${ctx.file.path}.`,
          reasoning: ctx.file.unavailableReason || 'File content was not retrieved.',
          proposedChange: 'Need file content before proposing exact patch.',
        }
      }
      const raw = await complete(
        `You propose code patches for review. The patch will NOT be applied automatically — a human reviews it. ${GROUNDING_RULES}
Respond with strict JSON: {"changeSummary": string, "reasoning": string, "proposedChange": string, "proposedContent": string}.
- "proposedChange" is a human-readable before/after or unified-diff style summary for THIS file only.
- "proposedContent" is the COMPLETE updated file content after your change (the entire file, not a fragment), based strictly on the provided current content. If you cannot produce the full file safely, set "proposedContent" to an empty string.
No markdown fences.`,
        `Repository: ${ctx.repo}\nTask: ${ctx.task}\nPlan steps: ${ctx.planSteps.join('; ')}\nFile: ${ctx.file.path}\n\nCurrent file content:\n${ctx.file.content.slice(0, 12000)}\n\nPropose the change.`,
        4000
      )
      try {
        const parsed = JSON.parse(raw.replace(/^```(json)?/m, '').replace(/```\s*$/m, '').trim())
        if (parsed.proposedChange) {
          const proposedContent = typeof parsed.proposedContent === 'string' ? parsed.proposedContent : ''
          return {
            changeSummary: String(parsed.changeSummary || ''),
            reasoning: String(parsed.reasoning || ''),
            proposedChange: String(parsed.proposedChange),
            // Only treat as applicable full-file content when it's substantive.
            proposedContent: proposedContent.trim().length > 0 ? proposedContent : undefined,
          }
        }
      } catch {
        // fall through
      }
      return {
        changeSummary: `Proposed change for ${ctx.file.path}`,
        reasoning: 'Provider returned an unstructured response; raw output shown below.',
        proposedChange: raw,
      }
    },

    async generateRepoSummary(repo, commitMessages) {
      return complete(
        'You are an expert code analyst. Summarize repository activity in 2-3 sentences. Be concrete.',
        `Repository: ${repo}\nRecent commits:\n${commitMessages.slice(0, 20).join('\n')}`
      )
    },

    async generateRepoInsights(ctx) {
      const raw = await complete(
        `You are a code analyst. Generate exactly 4 brief, specific insights about repository activity based ONLY on the provided stats and commit messages. ${GROUNDING_RULES}
Respond with strict JSON: {"insights": string[]}. No markdown fences.`,
        `Repository: ${ctx.repo}\nStats: ${ctx.statsSummary}\nRecent commits:\n${ctx.commitMessages.slice(0, 15).join('\n')}`,
        600
      )
      try {
        const parsed = JSON.parse(raw.replace(/^```(json)?/m, '').replace(/```\s*$/m, '').trim())
        if (Array.isArray(parsed.insights) && parsed.insights.length > 0) {
          return parsed.insights.slice(0, 4).map(String)
        }
      } catch {
        // fall through to line splitting
      }
      const lines = raw.split('\n').map((l) => l.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean)
      if (lines.length > 0) return lines.slice(0, 4)
      return mockProvider.generateRepoInsights(ctx)
    },

    async generateEngineeringSummary(ctx) {
      const text = await complete(
        `You write the executive summary of an engineering audit report. You are given FACTS that were computed deterministically by the tool. Rewrite them into 2–4 polished, professional sentences for an engineer or recruiter.
STRICT RULES:
- Use ONLY the provided facts. Never invent results, file names, or outcomes.
- Never claim the sandbox passed if it did not. Never claim a patch was tested if it was not applied.
- Do not add numbers or statuses that are not in the facts.
- Plain prose only: no markdown, no headings, no bullet points.`,
        `Repository: ${ctx.repo}
Request: ${ctx.task}
Conclusion: ${ctx.conclusion}
Approval status: ${ctx.approvalStatus}
Approved files: ${ctx.approved}
Rejected files: ${ctx.rejected}
Baseline verification passed: ${ctx.baselinePassed === null ? 'not run' : ctx.baselinePassed}
Patched verification passed: ${ctx.patchedPassed === null ? 'not run' : ctx.patchedPassed}
Patch applied & tested in sandbox: ${ctx.patchTestedInSandbox}
Overall confidence: ${ctx.confidence}%

Reference (deterministic) summary to rephrase faithfully:
${ctx.deterministicNarrative}`,
        400
      )
      const trimmed = text.trim()
      // Guard against empty/garbage output — never break report generation.
      return trimmed.length > 0 ? trimmed : ctx.deterministicNarrative
    },

    async generateEngineeringReportWording(ctx) {
      const fallback = await mockProvider.generateEngineeringReportWording!(ctx)
      const raw = await complete(
        `You improve stakeholder-facing wording for an engineering verification report.
STRICT RULES:
- Use ONLY the provided facts and deterministic text.
- Do not change repository name, user request, approved/rejected decisions, sandbox conclusion, command results, confidence score, file paths, pass/fail statuses, or recommendations meaning.
- Do not claim success unless the facts say sandbox verification passed.
- Return strict JSON with keys: narrative, businessSummary, keyFindings, confidenceExplanation, recommendations.
- keyFindings and recommendations must be arrays of short strings.
- No markdown fences.`,
        `Repository: ${ctx.repo}
Request: ${ctx.task}
Conclusion: ${ctx.conclusion}
Approval status: ${ctx.approvalStatus}
Approved files: ${ctx.approved}
Rejected files: ${ctx.rejected}
Baseline verification passed: ${ctx.baselinePassed === null ? 'not run' : ctx.baselinePassed}
Patched verification passed: ${ctx.patchedPassed === null ? 'not run' : ctx.patchedPassed}
Patch applied & tested in sandbox: ${ctx.patchTestedInSandbox}
Overall confidence: ${ctx.confidence}%

Deterministic narrative:
${ctx.deterministicNarrative}

Deterministic business summary:
${ctx.deterministicBusinessSummary ?? ''}

Deterministic key findings:
${(ctx.deterministicKeyFindings ?? []).join('\n')}

Deterministic confidence explanation:
${ctx.deterministicConfidenceExplanation ?? ''}

Deterministic recommendations:
${(ctx.deterministicRecommendations ?? []).join('\n')}`,
        900
      )
      try {
        const parsed = JSON.parse(raw.replace(/^```(json)?/m, '').replace(/```\s*$/m, '').trim())
        return {
          narrative: String(parsed.narrative || fallback.narrative),
          businessSummary: String(parsed.businessSummary || fallback.businessSummary),
          keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings.slice(0, 6).map(String) : fallback.keyFindings,
          confidenceExplanation: String(parsed.confidenceExplanation || fallback.confidenceExplanation),
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 4).map(String) : fallback.recommendations,
        }
      } catch {
        return fallback
      }
    },
  }
}

// ---------- Selection ----------

export function resolveProviderName(): AIProviderName {
  const explicit = process.env.AI_PROVIDER?.toLowerCase()
  if (explicit === 'mock') return 'mock'
  if (explicit === 'openai' && process.env.OPENAI_API_KEY) return 'openai'
  if (explicit === 'groq' && process.env.GROQ_API_KEY) return 'groq'
  if (explicit === 'anthropic' && process.env.ANTHROPIC_API_KEY) return 'anthropic'
  if (process.env.OPENAI_API_KEY) return 'openai'
  if (process.env.GROQ_API_KEY) return 'groq'
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  return 'mock'
}

export function getProvider(): AIProvider {
  const name = resolveProviderName()
  if (name === 'openai') return makeLLMProvider('openai', openaiComplete)
  if (name === 'groq') return makeLLMProvider('groq', groqComplete)
  if (name === 'anthropic') return makeLLMProvider('anthropic', anthropicComplete)
  return mockProvider
}

export interface WithFallbackOptions {
  /**
   * Stable key for the prompt cache (e.g. hash of the call inputs). Repeated
   * identical requests are served from cache without touching the API. Its
   * length also serves as the input-size estimate for cost accounting.
   */
  cacheKey?: string
}

export interface AICallResult<T> {
  result: T
  provider: AIProviderName
  degraded: boolean
  /** Served from the prompt cache — no API call, no cost. */
  cached: boolean
  budget: BudgetStatus
}

/**
 * Run an AI call behind the cost guards: prompt cache first, then the
 * monthly-budget / daily-call gate (blocked → mock), then the live provider
 * with automatic degradation to mock on failure. Every live call is recorded
 * against the budget.
 */
export async function withFallback<T>(
  fn: (provider: AIProvider) => Promise<T>,
  options: WithFallbackOptions = {}
): Promise<AICallResult<T>> {
  const provider = getProvider()
  const budget = getBudgetStatus()

  if (provider.name === 'mock') {
    return { result: await fn(mockProvider), provider: 'mock', degraded: false, cached: false, budget }
  }

  // 1. Cache: identical prompts never hit the API twice.
  if (options.cacheKey) {
    const cached = getCachedResponse<T>(`${provider.name}:${options.cacheKey}`)
    if (cached !== undefined) {
      return { result: cached, provider: provider.name, degraded: false, cached: true, budget }
    }
  }

  // 2. Budget gate: at 100% of budget or the daily call limit, live calls
  //    are blocked and the deterministic mock answers instead.
  if (budget.level === 'blocked') {
    console.warn(`[AI] Budget gate: ${budget.message}`)
    return { result: await fn(mockProvider), provider: 'mock', degraded: true, cached: false, budget }
  }

  try {
    const result = await fn(provider)
    const inputChars = options.cacheKey?.length ?? 4000
    const updatedBudget = (() => {
      recordCall(estimateCostUSD(inputChars, getCostConfig().maxOutputTokens))
      return getBudgetStatus()
    })()
    if (options.cacheKey) setCachedResponse(`${provider.name}:${options.cacheKey}`, result)
    return { result, provider: provider.name, degraded: false, cached: false, budget: updatedBudget }
  } catch (error) {
    console.error(`[AI] ${provider.name} provider failed, degrading to mock:`, error instanceof Error ? error.message : error)
    return { result: await fn(mockProvider), provider: 'mock', degraded: true, cached: false, budget }
  }
}
