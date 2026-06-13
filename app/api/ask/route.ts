import { NextRequest, NextResponse } from 'next/server'
import { getOrBuildCodebaseMap, parseRepoParam } from '@/lib/agent/map-cache'
import { classifyQuestionIntent } from '@/lib/agent/intent'
import { retrieveRelevantFiles } from '@/lib/agent/retrieval'
import { withFallback } from '@/lib/ai/provider'
import { getCostConfig } from '@/lib/ai/cost-controls'
import { GitHubService } from '@/lib/github-service'
import type { AskAnswer, Confidence } from '@/lib/agent/types'

export const dynamic = 'force-dynamic'

function deriveConfidence(sourceCount: number, topScore: number): Confidence {
  if (sourceCount >= 3 && topScore >= 5) return 'high'
  if (sourceCount >= 1 && topScore >= 2) return 'medium'
  return 'low'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = parseRepoParam(body.repo ?? null)
    const question = typeof body.question === 'string' ? body.question.trim() : ''

    if (!parsed) {
      return NextResponse.json({ error: 'Invalid repository format. Use: owner/repo' }, { status: 400 })
    }
    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 })
    }

    const result = await getOrBuildCodebaseMap(parsed.owner, parsed.repo)
    if (!result.ok) {
      return NextResponse.json({ error: result.message, kind: result.kind }, { status: result.status })
    }
    const map = result.map

    const intent = classifyQuestionIntent(question)
    const { maxRetrievedFiles, snippetsPerFile, snippetChars } = getCostConfig()
    const sources = retrieveRelevantFiles(question, map.files, { intent, limit: maxRetrievedFiles })

    // Ground the answer further: fetch short snippets for the top sources
    // (bounded — the whole repo is never sent to the AI provider).
    if (sources.length > 0) {
      const contents = await GitHubService.getFileContents(
        parsed.owner,
        parsed.repo,
        sources.slice(0, snippetsPerFile).map((s) => s.path),
        snippetsPerFile
      )
      for (const c of contents) {
        const source = sources.find((s) => s.path === c.path)
        if (source && c.content) {
          source.snippet = c.content.slice(0, snippetChars)
        }
      }
    }

    const { result: answerText, provider, degraded, cached, budget } = await withFallback(
      (p) =>
        p.answerRepoQuestion({
          repo: map.repo,
          question,
          intent,
          sources,
          architectureText: map.architecture.text,
        }),
      { cacheKey: JSON.stringify({ kind: 'ask', repo: map.repo, question, sources }) }
    )

    const grounded = sources.length > 0
    const answer: AskAnswer = {
      question,
      intent,
      answer: grounded
        ? answerText
        : `I don't have enough indexed file content to answer that confidently. Relevant paths found: none. Try rephrasing with file, feature, or technology names that appear in the repository.`,
      confidence: deriveConfidence(sources.length, sources[0]?.score ?? 0),
      sources,
      provider,
      grounded,
    }

    return NextResponse.json({ ...answer, degraded, cached, budget })
  } catch (error) {
    console.error('[API ask] Error:', error)
    return NextResponse.json({ error: 'Failed to answer question' }, { status: 500 })
  }
}
