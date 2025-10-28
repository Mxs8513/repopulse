'use client'

interface RecentRepo {
  fullName: string
  stars: number
  language: string
  updatedAt: string
}

interface RecentReposProps {
  recentRepos: RecentRepo[]
  onRepoClick: (repo: string) => void
}

export function RecentRepos({ recentRepos, onRepoClick }: RecentReposProps) {
  const formatStars = (stars: number) => {
    if (stars >= 1000) {
      return `${(stars / 1000).toFixed(1)}k`
    }
    return stars.toString()
  }

  if (recentRepos.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Recently Opened</h3>
        <p className="text-sm text-muted-foreground">No repositories opened yet</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4">Recently Opened</h3>
      <div className="space-y-2">
        {recentRepos.map((repo) => (
          <div
            key={repo.fullName}
            onClick={() => onRepoClick(repo.fullName)}
            className="flex items-center justify-between gap-3 p-3 rounded-md hover:bg-accent transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium truncate block">{repo.fullName}</span>
                <span className="text-xs text-muted-foreground">{repo.language || 'Unknown'}</span>
              </div>
            </div>
            <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
              ⭐ {formatStars(repo.stars)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

