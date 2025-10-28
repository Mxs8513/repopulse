'use client'

export function QuickStats({ stats, repoFullName }: { stats?: { avgCommitSize?: number; codeReviewTime?: number; activeBranches?: number; openPRs?: number }; repoFullName?: string }) {
  const quickStats = [
    { label: 'Avg Commit Size', value: stats?.avgCommitSize?.toFixed(0) || '0', unit: 'lines', trend: 'up', href: repoFullName ? `https://github.com/${repoFullName}/commits` : undefined },
    { label: 'Code Review Time', value: stats?.codeReviewTime?.toFixed(1) || '0', unit: 'hours', trend: 'down', href: repoFullName ? `https://github.com/${repoFullName}/pulls` : undefined },
    { label: 'Active Branches', value: stats?.activeBranches?.toString() || '0', unit: '', trend: 'up', href: repoFullName ? `https://github.com/${repoFullName}/branches` : undefined },
    { label: 'Open PRs', value: stats?.openPRs?.toString() || '0', unit: '', trend: 'neutral', href: repoFullName ? `https://github.com/${repoFullName}/pulls` : undefined },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {quickStats.map((stat, index) => (
        <a
          key={index}
          href={stat.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`rounded-lg border bg-card p-4 transition-all ${stat.href ? 'hover:border-primary cursor-pointer hover:shadow-md' : 'cursor-default'}`}
        >
          <div className="text-2xl font-bold">
            {stat.value}
            <span className="text-sm text-muted-foreground ml-1">{stat.unit}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            {stat.trend === 'up' && <span className="text-green-500">↑</span>}
            {stat.trend === 'down' && <span className="text-red-500">↓</span>}
            {stat.trend === 'neutral' && <span className="text-muted-foreground">→</span>}
            {stat.label}
          </div>
        </a>
      ))}
    </div>
  )
}

