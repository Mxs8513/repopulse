'use client'

import { useState, useEffect, useCallback } from 'react'

export interface RecentRepo {
  fullName: string
  stars: number
  language: string
  updatedAt: string
  addedAt: number
}

const STORAGE_KEY = 'repopulse_recent_repos'
const MAX_RECENT = 5

export function useRecentRepos() {
  const [recentRepos, setRecentRepos] = useState<RecentRepo[]>([])

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        setRecentRepos(JSON.parse(stored))
      } catch (error) {
        console.error('[v0] Failed to parse recent repos:', error)
      }
    }
  }, [])

  const addRecentRepo = useCallback((repo: RecentRepo) => {
    setRecentRepos((prev) => {
      if (prev.length > 0 && prev[0].fullName === repo.fullName) {
        return prev
      }
      const filtered = prev.filter((r) => r.fullName !== repo.fullName)
      const updated = [repo, ...filtered].slice(0, MAX_RECENT)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  const clearRecentRepos = useCallback(() => {
    setRecentRepos([])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return {
    recentRepos,
    addRecentRepo,
    clearRecentRepos,
  }
}

