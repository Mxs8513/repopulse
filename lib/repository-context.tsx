'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

interface RepositoryContextType {
  selectedRepo: string | null
  setSelectedRepo: (repo: string | null) => void
}

const RepositoryContext = createContext<RepositoryContextType | undefined>(undefined)

export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  // Initialize with localStorage value immediately to avoid delay
  const [selectedRepo, setSelectedRepoState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('currentRepository')
    }
    return null
  })

  // Listen for storage changes from other tabs/windows
  useEffect(() => {
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
    <RepositoryContext.Provider value={{ selectedRepo, setSelectedRepo }}>
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

