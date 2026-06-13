// Phase 8 sandbox verification endpoint. Runs ONLY approved patches and ONLY
// allowlisted commands in a temporary workspace. Never commits, pushes, merges,
// or opens a PR. Returns the result + audit events for the client to persist.

import { NextRequest, NextResponse } from 'next/server'
import { runSandboxVerification, selectApprovedPatches } from '@/lib/agent/sandbox'
import { nodeSandboxExecutor } from '@/lib/agent/sandbox-executor'
import type { FilePatchProposal } from '@/lib/agent/types'

export const dynamic = 'force-dynamic'
// Allow time for npm commands; still bounded by per-command timeout in the executor.
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const runId = typeof body.runId === 'string' ? body.runId : ''
    const patches: FilePatchProposal[] = Array.isArray(body.patches) ? body.patches : []
    const commands: string[] = Array.isArray(body.commands) ? body.commands.map(String) : []

    if (!runId) {
      return NextResponse.json({ error: 'runId is required' }, { status: 400 })
    }

    // Defense in depth: re-filter to approved-only on the server, never trust the client.
    const approvedOnly = selectApprovedPatches(patches)
    const repo = typeof body.repo === 'string' && body.repo.trim() ? body.repo.trim() : ''

    if (!repo) {
      return NextResponse.json({ error: 'repo is required' }, { status: 400 })
    }

    const { result, events } = await runSandboxVerification(
      { runId, patches: approvedOnly, commands, repo },
      nodeSandboxExecutor
    )

    return NextResponse.json({ result, events })
  } catch (error) {
    console.error('[API sandbox] Error:', error)
    return NextResponse.json({ error: 'Sandbox verification failed to run' }, { status: 500 })
  }
}
