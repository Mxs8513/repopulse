'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

interface RepositoryContextType {
  selectedRepo: string | null
  setSelectedRepo: (repo: string | null) => void
  /** False until the localStorage value has been loaded on the client. */
  hydrated: boolean
}

const RepositoryContext = createContext<RepositoryContextType | undefined>(undefined)

export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  // The initial render must be identical on server and client, so the stored
  // repo is loaded in an effect (after hydration) — never during render.
  const [selectedRepo, setSelectedRepoState] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setSelectedRepoState(localStorage.getItem('currentRepository'))
    setHydrated(true)

    // Listen for storage changes from other tabs/windows
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'currentRepository') {
        setSelectedRepoState(e.newValue)
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  const setSelectedRepo = (repo: string | null) => {
    setSelectedRepoState(repo)
    if (repo) {
      localStorage.setItem('currentRepository', repo)
    } else {
      localStorage.removeItem('currentRepository')
    }
  }

  return (
    <RepositoryContext.Provider value={{ selectedRepo, setSelectedRepo, hydrated }}>
      {children}
    </RepositoryContext.Provider>
  )
}

export function useRepository() {
  const context = useContext(RepositoryContext)
  if (context === undefined) {
    throw new Error('useRepository must be used within a RepositoryProvider')
  }
  return context
}
