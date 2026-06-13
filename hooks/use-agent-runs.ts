'use client'

import { useSyncExternalStore } from 'react'
import { listRuns, subscribeToRuns } from '@/lib/agent/run-store'
import type { AgentRun } from '@/lib/agent/types'

const EMPTY: AgentRun[] = []

export function useAgentRuns(): AgentRun[] {
  return useSyncExternalStore(subscribeToRuns, listRuns, () => EMPTY)
}

export function useAgentRun(runId: string | null): AgentRun | undefined {
  const runs = useAgentRuns()
  return runId ? runs.find((r) => r.runId === runId) : undefined
}
