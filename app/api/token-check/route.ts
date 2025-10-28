import { NextResponse } from 'next/server'
import { getGithubToken } from '@/lib/getGithubToken'

export async function GET() {
  try {
    const token = getGithubToken()
    return NextResponse.json({
      prefix: token.slice(0, 12),
      length: token.length,
      source: 'MY_GITHUB_PAT'
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}

