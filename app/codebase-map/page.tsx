'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RepoBanner } from '@/components/agent/repo-banner'
import { CategoryBadge, CATEGORY_LABELS } from '@/components/agent/badges'
import { useRepository } from '@/lib/repository-context'
import type { CodebaseMap, FileCategory, IndexedFile } from '@/lib/agent/types'
import { ChevronDown, ChevronRight, FileCode, Folder, FolderTree } from 'lucide-react'

class IndexError extends Error {
  kind?: string
  constructor(message: string, kind?: string) {
    super(message)
    this.kind = kind
  }
}

const ERROR_TITLES: Record<string, string> = {
  rate_limited: 'GitHub rate limit reached',
  not_found: 'Repository not found',
  auth_required: 'Access denied — token required',
  invalid_input: 'Invalid repository name',
  github_error: 'GitHub API error',
}

const fetcher = (url: string) =>
  fetch(url).then(async (res) => {
    const data = await res.json()
    if (!res.ok) throw new IndexError(data.error || 'Request failed', data.kind)
    return data
  })

interface TreeNode {
  name: string
  path: string
  children: Map<string, TreeNode>
  file?: IndexedFile
}

function buildTree(files: IndexedFile[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: new Map() }
  for (const file of files) {
    const parts = file.path.split('/')
    let node = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const childPath = parts.slice(0, i + 1).join('/')
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, path: childPath, children: new Map() })
      }
      node = node.children.get(part)!
      if (i === parts.length - 1) node.file = file
    }
  }
  return root
}

function TreeView({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 1)
  const isDir = node.children.size > 0
  const sorted = useMemo(
    () =>
      [...node.children.values()].sort((a, b) => {
        const aDir = a.children.size > 0 ? 0 : 1
        const bDir = b.children.size > 0 ? 0 : 1
        return aDir - bDir || a.name.localeCompare(b.name)
      }),
    [node.children]
  )

  if (!node.name) {
    return (
      <div>
        {sorted.map((child) => (
          <TreeView key={child.path} node={child} depth={depth} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ paddingLeft: depth > 0 ? 14 : 0 }}>
      <div
        className="flex items-center gap-1.5 py-0.5 text-sm hover:bg-accent/50 rounded px-1 cursor-pointer"
        onClick={() => isDir && setOpen(!open)}
      >
        {isDir ? (
          <>
            {open ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
            <Folder className="w-4 h-4 text-warning shrink-0" />
            <span className="text-foreground">{node.name}</span>
            <span className="text-xs text-muted-foreground">({node.children.size})</span>
          </>
        ) : (
          <>
            <span className="w-3.5" />
            <FileCode className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-foreground truncate">{node.name}</span>
            {node.file && node.file.category !== 'unknown' && (
              <span className="text-[10px] uppercase text-muted-foreground ml-auto pr-1">
                {CATEGORY_LABELS[node.file.category]}
              </span>
            )}
          </>
        )}
      </div>
      {isDir && open && sorted.map((child) => <TreeView key={child.path} node={child} depth={depth + 1} />)}
    </div>
  )
}

const CATEGORY_ORDER: FileCategory[] = [
  'frontend_page',
  'frontend_component',
  'backend_api',
  'service_or_lib',
  'test',
  'config',
  'database_model',
  'ci_cd',
  'documentation',
  'unknown',
]

export default function CodebaseMapPage() {
  const { selectedRepo } = useRepository()
  const { data, error, isLoading } = useSWR<CodebaseMap, IndexError>(
    selectedRepo ? `/api/codebase-map?repo=${encodeURIComponent(selectedRepo)}` : null,
    fetcher
  )

  const tree = useMemo(() => (data ? buildTree(data.files) : null), [data])

  return (
    <div className="relative min-h-screen p-4 lg:p-6 space-y-6 z-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Codebase Map</h1>
          <p className="text-muted-foreground mt-1">
            Deterministic repository structure analysis — built from real file paths, not AI guesses
          </p>
        </div>
        <FolderTree className="w-8 h-8 text-muted-foreground" />
      </div>

      <RepoBanner />

      {!selectedRepo && (
        <Card className="p-6 bg-card border-border">
          <p className="text-muted-foreground">Select a repository above to index its file tree.</p>
        </Card>
      )}

      {isLoading && (
        <Card className="p-6 bg-card border-border">
          <p className="text-center text-muted-foreground">Indexing repository tree…</p>
        </Card>
      )}

      {error && (
        <Card className="p-6 bg-card border-destructive/50 space-y-1">
          <p className="font-medium text-destructive">
            {ERROR_TITLES[error.kind ?? ''] || 'Indexing failed'}
          </p>
          <p className="text-sm text-muted-foreground">{String(error.message || error)}</p>
        </Card>
      )}

      {data && (
        <>
          {/* Indexing status */}
          <Card className="p-4 bg-card border-border flex flex-wrap items-center gap-x-4 gap-y-2">
            <Badge variant="outline" className="text-success border-success">
              Indexed successfully
            </Badge>
            {data.partial && (
              <Badge variant="outline" className="text-warning border-warning">
                Partial index
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {data.files.length} files indexed
              {data.filesSkipped > 0 && ` · ${data.filesSkipped} skipped (binary / vendored)`}
              {` · branch ${data.defaultBranch}`}
            </span>
          </Card>

          {/* Architecture summary */}
          <Card className="p-6 bg-card border-border">
            <h3 className="text-lg font-semibold text-foreground mb-2">Architecture Summary</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{data.architecture.text}</p>
            <div className="flex flex-wrap gap-2 mt-4">
              {data.architecture.detectedFrameworks.map((fw) => (
                <Badge key={fw} variant="outline" className="text-primary border-primary">
                  {fw}
                </Badge>
              ))}
            </div>
            {data.partial && (
              <p className="text-xs text-warning mt-3">
                This is a partial index — the repository tree was too large for a full listing, so only
                top-level and key directories (app, src, lib, components, …) were indexed.
              </p>
            )}
          </Card>

          {/* Category cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {CATEGORY_ORDER.filter((c) => data.categoryCounts[c] > 0).map((cat) => (
              <Card key={cat} className="p-4 bg-card border-border">
                <p className="text-2xl font-bold text-foreground">{data.categoryCounts[cat]}</p>
                <p className="text-xs text-muted-foreground uppercase">{CATEGORY_LABELS[cat]}</p>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* File tree */}
            <Card className="p-6 bg-card border-border overflow-auto max-h-[36rem]">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                File Tree <span className="text-sm font-normal text-muted-foreground">({data.files.length} files, branch {data.defaultBranch})</span>
              </h3>
              {tree && <TreeView node={tree} />}
            </Card>

            {/* Key files / entrypoints / API routes / tests */}
            <div className="space-y-6">
              <Card className="p-6 bg-card border-border">
                <h3 className="text-lg font-semibold text-foreground mb-3">Key Files</h3>
                <ul className="space-y-1.5">
                  {data.architecture.keyFiles.map((f) => (
                    <li key={f} className="text-sm font-mono text-muted-foreground truncate">
                      {f}
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="p-6 bg-card border-border">
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  API Routes <span className="text-sm font-normal text-muted-foreground">({data.architecture.apiRoutes.length})</span>
                </h3>
                {data.architecture.apiRoutes.length > 0 ? (
                  <ul className="space-y-1.5 max-h-40 overflow-auto">
                    {data.architecture.apiRoutes.map((f) => (
                      <li key={f} className="text-sm font-mono text-muted-foreground truncate">
                        {f}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No API route files detected.</p>
                )}
              </Card>

              <Card className="p-6 bg-card border-border">
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  Tests <span className="text-sm font-normal text-muted-foreground">({data.architecture.testFiles.length})</span>
                </h3>
                {data.architecture.testFiles.length > 0 ? (
                  <ul className="space-y-1.5 max-h-40 overflow-auto">
                    {data.architecture.testFiles.map((f) => (
                      <li key={f} className="text-sm font-mono text-muted-foreground truncate">
                        {f}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-warning">
                    No test files detected — changes to this repository carry higher regression risk.
                  </p>
                )}
              </Card>
            </div>
          </div>

          {/* Next-step guidance so the workflow doesn't dead-end here */}
          <Card className="p-5 bg-card border-border flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-48">
              <p className="text-sm font-medium text-foreground">Indexed. What next?</p>
              <p className="text-xs text-muted-foreground">
                Ask grounded questions about this code, or plan a change against it.
              </p>
            </div>
            <a
              href="/ask"
              className="text-sm px-4 py-2 rounded-md border border-border text-foreground hover:bg-accent transition-colors"
            >
              Ask Repo →
            </a>
            <a
              href="/planner"
              className="text-sm px-4 py-2 rounded-md border border-primary text-primary hover:bg-primary/10 transition-colors"
            >
              Plan a change →
            </a>
          </Card>
        </>
      )}
    </div>
  )
}
