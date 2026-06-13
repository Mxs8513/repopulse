"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import useSWR from "swr"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { useRepository } from "@/lib/repository-context"
import { useRepoData } from "@/hooks/use-repo-data"
import { useRecentRepos } from "@/hooks/use-recent-repos"
import { useAgentRuns } from "@/hooks/use-agent-runs"
import { PerformanceChart } from "@/components/dashboard/performance-chart"
import { QuickStats } from "@/components/dashboard/quick-stats"
import { AnimatedStatCard } from "@/components/dashboard/animated-stat-card"
import { RecentRepos } from "@/components/dashboard/recent-repos"
import { DashboardIntro } from "@/components/dashboard/dashboard-intro"
import { StatusBadge } from "@/components/agent/badges"
import {
  Bot,
  CheckCircle2,
  Trophy,
  FileCode,
  GitCommit,
  FolderTree,
  ClipboardList,
  History,
} from "lucide-react"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function DashboardHome() {
  const { selectedRepo, setSelectedRepo } = useRepository()
  const [inputValue, setInputValue] = useState("facebook/react")
  const { data: repoData, isLoading } = useRepoData(selectedRepo)
  const { recentRepos, addRecentRepo } = useRecentRepos()
  const runs = useAgentRuns()
  const { data: health } = useSWR<{ aiProvider?: string; mockMode?: boolean; githubTokenConfigured?: boolean }>(
    "/api/health",
    fetcher
  )
  const [mounted, setMounted] = useState(false)

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  // Initialize with selectedRepo if available - only once on mount
  useEffect(() => {
    if (selectedRepo) {
      setInputValue(selectedRepo)
    } else {
      setSelectedRepo("facebook/react")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync inputValue with selectedRepo when it changes externally (e.g., from recent repos)
  useEffect(() => {
    if (selectedRepo && selectedRepo !== inputValue) {
      setInputValue(selectedRepo)
    }
  }, [selectedRepo]) // eslint-disable-line react-hooks/exhaustive-deps

  // Add current repo to recent repos
  useEffect(() => {
    if (repoData?.repository?.fullName) {
      addRecentRepo({
        fullName: repoData.repository.fullName,
        stars: repoData.repository.stars,
        language: repoData.repository.language,
        updatedAt: repoData.repository.updatedAt,
        addedAt: Date.now(),
      })
    }
  }, [repoData?.repository?.fullName]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadRepository = () => {
    const repoToLoad = inputValue.trim()
    if (!repoToLoad) return
    setSelectedRepo(repoToLoad)
  }

  const handleRecentRepoClick = (repo: string) => {
    setSelectedRepo(repo)
    setInputValue(repo)
  }

  const openRuns = runs.filter((r) =>
    ["planned", "awaiting_diff", "diff_generated", "verification_pending"].includes(r.status)
  )
  const latestRun = runs[0]

  return (
    <div className="relative min-h-screen p-4 lg:p-6 space-y-6 z-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Overview</h1>
          <p className="text-muted-foreground mt-1">
            Connect a repo, understand it, plan a change, verify it, approve it
          </p>
        </div>
        <Bot className="w-8 h-8 text-muted-foreground" />
      </div>

      {/* Repository Input */}
      <Card className="p-6 bg-card border-border shadow-lg">
        <div className="flex gap-4">
          <Input
            placeholder="Enter repository (e.g., facebook/react)"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLoadRepository()}
            className="flex-1 bg-background border-border text-foreground h-12"
          />
          <Button
            onClick={handleLoadRepository}
            disabled={isLoading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 h-12 disabled:opacity-50"
            suppressHydrationWarning
          >
            Load Repository
          </Button>
        </div>
      </Card>

      {/* Product Intro / Workflow */}
      <DashboardIntro />

      {/* Quick Stats */}
      {!mounted ? null : isLoading ? (
        <Card className="p-6 bg-card border-border shadow-md">
          <p className="text-center text-muted-foreground">Loading repository data...</p>
        </Card>
      ) : (
        repoData?.stats && <QuickStats stats={repoData.stats} repoFullName={repoData.repository?.fullName} />
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column - Repository Observability */}
        <div className="lg:col-span-8 space-y-6">
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <AnimatedStatCard
              icon="📊"
              value={repoData?.commits?.length?.toString() || "0"}
              change="Total"
              label="Commits"
              href={repoData?.repository?.fullName ? `https://github.com/${repoData.repository.fullName}/commits` : undefined}
            />
            <AnimatedStatCard
              icon="🤖"
              value={runs.length.toString()}
              change="Logged"
              label="Agent Runs"
            />
            <AnimatedStatCard
              icon="🎯"
              value={openRuns.length.toString()}
              change="Open"
              label="Pending Review"
            />
            <AnimatedStatCard
              icon="📈"
              value={repoData?.repository?.openIssues?.toString() || "0"}
              change="Open"
              label="Issues"
              href={repoData?.repository?.fullName ? `https://github.com/${repoData.repository.fullName}/issues` : undefined}
            />
          </div>

          {/* Performance Chart */}
          {!mounted ? null : isLoading ? (
            <Card className="p-6 bg-card border-border shadow-md">
              <p className="text-center text-muted-foreground">Loading commit history...</p>
            </Card>
          ) : repoData?.commits && repoData.commits.length > 0 ? (
            <PerformanceChart commits={repoData.commits} />
          ) : (
            <Card className="p-6 bg-card border-border shadow-md">
              <p className="text-center text-muted-foreground">No commits data available</p>
            </Card>
          )}

          {/* Recent Repositories */}
          <RecentRepos recentRepos={recentRepos} onRepoClick={handleRecentRepoClick} />

          {/* Bottom Three Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Commit Notes */}
            <Card className="p-6 bg-card border-border shadow-md">
              <h3 className="text-lg font-semibold text-foreground mb-4">Recent Commits</h3>
              <div className="space-y-3">
                {repoData?.commits && repoData.commits.length > 0 ? (
                  repoData.commits.slice(0, 3).map((commit: any, index: number) => {
                    const colors = ["border-success", "border-primary", "border-destructive"]
                    const firstLine = commit.message.split("\n")[0].substring(0, 50)

                    return (
                      <div key={index} className={`border-l-2 ${colors[index]} pl-3 py-2`}>
                        <p className="text-sm font-medium text-foreground">{firstLine}...</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          by {commit.author?.name || "Unknown"} • {new Date(commit.date).toLocaleDateString()}
                        </p>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">Connect a repository to see recent commits</p>
                )}
              </div>
            </Card>

            {/* Repo Stats */}
            <Card className="p-6 bg-card border-border shadow-md">
              <h3 className="text-lg font-semibold text-foreground mb-4">Repo Stats</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-3xl font-bold text-foreground">
                    {repoData?.commits?.length || repoData?.stats?.totalCommits || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Commits</p>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-success">Stars: {repoData?.repository?.stars?.toLocaleString() || 0}</p>
                  <p className="text-muted-foreground">Forks: {repoData?.repository?.forks?.toLocaleString() || 0}</p>
                  <p className="text-muted-foreground mt-2">Language: {repoData?.repository?.language || "Unknown"}</p>
                </div>
              </div>
            </Card>

            {/* Language Breakdown */}
            <Card className="p-6 bg-card border-border shadow-md">
              <h3 className="text-lg font-semibold text-foreground mb-4">Language Breakdown</h3>
              <div className="space-y-3">
                {repoData?.stats?.languages && repoData.stats.languages.length > 0 ? (
                  repoData.stats.languages.slice(0, 5).map((lang: any, index: number) => {
                    const colors = ["bg-primary", "bg-warning", "bg-secondary", "bg-destructive", "bg-chart-5"]
                    return (
                      <div key={index}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-foreground">{lang.language}:</span>
                          <span className="text-muted-foreground">{lang.percentage}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full ${colors[index % colors.length]}`} style={{ width: `${lang.percentage}%` }} />
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">Connect a repository to see language distribution</p>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Right Column - Agent Activity */}
        <div className="lg:col-span-4 space-y-6">
          {/* Agent Activity */}
          <Card className="p-6 bg-card border-border shadow-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Agent Activity</h3>
              {openRuns.length > 0 && (
                <Badge variant="outline" className="text-warning border-warning rounded-full">
                  {openRuns.length} open
                </Badge>
              )}
            </div>
            {mounted && runs.length > 0 ? (
              <div className="space-y-3">
                {runs.slice(0, 4).map((run) => (
                  <Link
                    key={run.runId}
                    href={`/agent-runs?run=${run.runId}`}
                    className="flex items-start gap-3 p-2 rounded hover:bg-accent transition-colors"
                  >
                    <History className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{run.task}</p>
                      <p className="text-xs text-muted-foreground">{run.repo}</p>
                    </div>
                    <StatusBadge status={run.status} />
                  </Link>
                ))}
                <Link href="/agent-runs" className="text-sm text-primary hover:underline block text-center pt-1">
                  View all runs →
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  No agent runs yet. Start the workflow:
                </p>
                <Link href="/codebase-map" className="flex items-center gap-3 p-2 rounded hover:bg-accent transition-colors">
                  <FolderTree className="w-4 h-4 text-primary" />
                  <span className="text-sm text-foreground">Index the codebase</span>
                </Link>
                <Link href="/planner" className="flex items-center gap-3 p-2 rounded hover:bg-accent transition-colors">
                  <ClipboardList className="w-4 h-4 text-primary" />
                  <span className="text-sm text-foreground">Plan a change</span>
                </Link>
              </div>
            )}
          </Card>

          {/* Latest run detail */}
          {mounted && latestRun && (
            <Card className="p-6 bg-card border-border shadow-md">
              <h3 className="text-lg font-semibold text-foreground mb-3">Latest Run</h3>
              <p className="text-sm text-foreground mb-1">{latestRun.task}</p>
              <p className="text-xs text-muted-foreground mb-3">
                {latestRun.repo} · {new Date(latestRun.updatedAt).toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <StatusBadge status={latestRun.status} />
                {latestRun.diff && (
                  <span className="text-xs text-muted-foreground">{latestRun.diff.patches.length} patches</span>
                )}
              </div>
            </Card>
          )}

          {/* Top Contributors */}
          <Card className="p-6 bg-card border-border shadow-md">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-5 h-5 text-warning" />
              <h3 className="text-lg font-semibold text-foreground">Top Contributors</h3>
            </div>
            <div className="space-y-4">
              {repoData?.contributors && repoData.contributors.length > 0 ? (
                repoData.contributors.slice(0, 5).map((contributor: any, index: number) => {
                  const initials = contributor.login.substring(0, 2).toUpperCase()
                  const colors = ["bg-warning", "bg-muted-foreground", "bg-chart-5", "bg-muted", "bg-muted"]
                  const maxContributions = repoData.contributors[0]?.contributions || 1
                  const score = Math.round((contributor.contributions / maxContributions) * 100)

                  return (
                    <a
                      key={index}
                      href={`https://github.com/${contributor.login}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 hover:bg-accent/50 p-2 rounded-md transition-colors"
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-foreground text-sm font-medium">
                        {index + 1}
                      </div>
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full ${colors[index % colors.length]} text-foreground text-xs font-bold`}>
                        {initials}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{contributor.login}</p>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                          <div className="h-full bg-primary" style={{ width: `${score}%` }} />
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-foreground">{contributor.contributions}</span>
                    </a>
                  )
                })
              ) : (
                <p className="text-sm text-muted-foreground">Connect a repository to see top contributors</p>
              )}
            </div>
          </Card>

          {/* System Status (real, from /api/health) */}
          <Card className="p-6 bg-card border-border shadow-md">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`w-5 h-5 ${health?.mockMode ? "text-warning" : "text-success"}`} />
                <span className="text-sm font-medium text-foreground">AI Provider</span>
                <Badge
                  variant="outline"
                  className={`ml-auto uppercase ${health?.mockMode ? "text-warning border-warning" : "text-success border-success"}`}
                >
                  {health?.aiProvider ?? "…"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <GitCommit className={`w-5 h-5 ${health?.githubTokenConfigured ? "text-success" : "text-warning"}`} />
                <span className="text-sm font-medium text-foreground">GitHub Token</span>
                <Badge
                  variant="outline"
                  className={`ml-auto uppercase ${health?.githubTokenConfigured ? "text-success border-success" : "text-warning border-warning"}`}
                >
                  {health === undefined ? "…" : health.githubTokenConfigured ? "set" : "unset"}
                </Badge>
              </div>
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground text-center">
                  <FileCode className="w-3.5 h-3.5 inline mr-1" />
                  Deterministic indexing works without any API keys
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
