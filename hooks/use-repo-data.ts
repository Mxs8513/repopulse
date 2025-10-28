'use client'

import { useEffect } from 'react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export function useRepoData(repoPath: string | null) {
  const isAIRequest = repoPath?.includes('enableAI=true')
  const actualRepoPath = isAIRequest ? repoPath.split('?')[0] : repoPath
  
  const key = actualRepoPath ? `/api/repo?repo=${encodeURIComponent(actualRepoPath)}${isAIRequest ? '&enableAI=true' : ''}` : null
  
  const { data, error, isLoading, mutate } = useSWR(
    key,
    fetcher,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 0,
      refreshInterval: 0,
    }
  )

  // Force refetch when repoPath changes - removed infinite loop
  // SWR already handles refetching when the key changes

  return {
    data,
    error,
    isLoading,
    refetch: mutate,
  }
}

