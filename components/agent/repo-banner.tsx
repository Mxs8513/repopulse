'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useRepository } from '@/lib/repository-context'
import { FolderGit2 } from 'lucide-react'

/**
 * Shared header for agent pages: shows the selected repository and lets the
 * user switch it inline (owner/repo).
 */
export function RepoBanner() {
  const { selectedRepo, setSelectedRepo, hydrated } = useRepository()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')

  const apply = () => {
    const trimmed = value.trim()
    if (trimmed.split('/').length === 2) {
      setSelectedRepo(trimmed)
      setEditing(false)
    }
  }

  return (
    <Card className="p-4 bg-card border-border flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-center gap-2 flex-1">
        <FolderGit2 className="w-5 h-5 text-primary shrink-0" />
        {!hydrated ? (
          // Stable placeholder: identical on server and first client render,
          // swapped only after the stored repo loads in an effect.
          <span className="text-sm text-muted-foreground">Loading repository…</span>
        ) : editing || !selectedRepo ? (
          <div className="flex gap-2 flex-1">
            <Input
              placeholder="owner/repo (e.g. facebook/react)"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
              className="flex-1 h-9"
            />
            <Button size="sm" onClick={apply}>
              Select
            </Button>
          </div>
        ) : (
          <>
            <span className="font-medium text-foreground">{selectedRepo}</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                setValue(selectedRepo)
                setEditing(true)
              }}
            >
              Change
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}
