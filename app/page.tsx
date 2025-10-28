"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { useRepository } from "@/lib/repository-context"
import { useRepoData } from "@/hooks/use-repo-data"
import { useRecentRepos } from "@/hooks/use-recent-repos"
import { PerformanceChart } from "@/components/dashboard/performance-chart"
import { QuickStats } from "@/components/dashboard/quick-stats"
import { AnimatedStatCard } from "@/components/dashboard/animated-stat-card"
import { RecentRepos } from "@/components/dashboard/recent-repos"
import { DashboardIntro } from "@/components/dashboard/dashboard-intro"
import {
  BarChart3,
  Zap,
  Code2,
  Clock,
  Cloud,
  Trophy,
  CheckCircle2,
  Cpu,
  Rocket,
  FileCode,
  GitCommit,
} from "lucide-react"

export default function DashboardHome() {
  const { selectedRepo, setSelectedRepo } = useRepository()
  const [inputValue, setInputValue] = useState("facebook/react")
  const { data: repoData, error, isLoading } = useRepoData(selectedRepo)
  const { recentRepos, addRecentRepo } = useRecentRepos()
  const [currentTime, setCurrentTime] = useState(new Date())
  const [mounted, setMounted] = useState(false)

  // Debug: Log data flow to verify mapping
  useEffect(() => {
    if (repoData) {
      console.log('[Dashboard] Display Data:', {
        commits: repoData.commits?.length || 0,
        stars: repoData.repository?.stars || 0,
        forks: repoData.repository?.forks || 0,
        openIssues: repoData.repository?.openIssues || 0,
        branches: repoData.stats?.branches || 0,
        openPRs: repoData.stats?.openPRs || 0,
        avgCommitSize: repoData.stats?.avgCommitSize || 0,
        reviewTime: repoData.stats?.reviewTime || 0,
      })
    }
  }, [repoData])

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  // Real-time clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const timeString = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'America/Chicago',
  })

  const dateString = currentTime.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Chicago',
  })

  // Initialize with selectedRepo if available - only once on mount
  useEffect(() => {
    if (selectedRepo) {
      setInputValue(selectedRepo)
    } else {
      // Set initial default if no repo selected
      setSelectedRepo("facebook/react")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync inputValue with selectedRepo when it changes externally (e.g., from recent repos)
  useEffect(() => {
    if (selectedRepo && selectedRepo !== inputValue) {
      setInputValue(selectedRepo)
    }
}, [selectedRepo])

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

  const handleLoadRepository = async () => {
    const repoToLoad = inputValue.trim()
    
    if (!repoToLoad) {
      return
    }
    
    // Update global state
    setSelectedRepo(repoToLoad)
    
    // Store in localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('currentRepository', repoToLoad)
    }
  }

  const handleRecentRepoClick = (repo: string) => {
    setSelectedRepo(repo)
    setInputValue(repo)
  }

  return (
    <div className="relative min-h-screen p-4 lg:p-6 space-y-6 z-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard Overview</h1>
          <p className="text-muted-foreground mt-1">Monitor your repository activity and performance metrics</p>
        </div>
        <Clock className="w-8 h-8 text-muted-foreground" />
      </div>

      {/* Repository Input */}
      <Card className="p-6 bg-card border-border shadow-lg">
        <div className="flex gap-4">
          <Input
            placeholder="Enter repository (e.g., facebook/react)"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLoadRepository()}
            className="flex-1 bg-background border-border text-foreground h-12"
          />
          <Button 
            onClick={handleLoadRepository}
            disabled={isLoading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 h-12 disabled:opacity-50"
            suppressHydrationWarning
          >
            Load
          </Button>
        </div>
      </Card>

      {/* Dashboard Intro */}
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
        {/* Left Column - Main Content */}
        <div className="lg:col-span-8 space-y-6">
          {/* Animated Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <AnimatedStatCard 
              icon="📊" 
              value={repoData?.commits?.length?.toString() || "0"} 
              change="Total"
              label="Commits"
              trend={repoData?.commits?.map((_, i) => i * 10) || [45, 52, 48, 65, 58, 72, 68]}
              href={repoData?.repository?.fullName ? `https://github.com/${repoData.repository.fullName}/commits` : undefined}
            />
            <AnimatedStatCard 
              icon="⚡" 
              value={repoData?.repository?.stars?.toString() || "0"} 
              change="Stars"
              label="Repository"
              trend={repoData?.repository ? [30, 35, 38, 42, 40, 45, 42] : [0, 0, 0, 0, 0, 0, 0]}
              href={repoData?.repository?.fullName ? `https://github.com/${repoData.repository.fullName}` : undefined}
            />
            <AnimatedStatCard 
              icon="🎯" 
              value={repoData?.repository?.forks?.toString() || "0"} 
              change="Forks"
              label="Community"
              trend={repoData?.repository ? [88, 90, 91, 92, 93, 94, 94] : [0, 0, 0, 0, 0, 0, 0]}
              href={repoData?.repository?.fullName ? `https://github.com/${repoData.repository.fullName}` : undefined}
            />
            <AnimatedStatCard 
              icon="📈" 
              value={repoData?.repository?.openIssues?.toString() || "0"} 
              change="Open"
              label="Issues"
              trend={repoData?.repository ? [35, 38, 42, 45, 47, 49, 50] : [0, 0, 0, 0, 0, 0, 0]}
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

          {/* Recent Activity */}
          {repoData?.commits && repoData.commits.length > 0 && (
            <Card className="p-6 bg-card border-border shadow-md">
              <h3 className="text-lg font-semibold text-foreground mb-4">Recent Activity</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-md hover:bg-accent transition-colors">
                  <GitCommit className="w-5 h-5 text-primary flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm text-foreground">{repoData.commits.length} commits loaded</span>
                    <p className="text-xs text-muted-foreground">Latest from {repoData.repository?.fullName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-md hover:bg-accent transition-colors">
                  <FileCode className="w-5 h-5 text-secondary flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm text-foreground">Language: {repoData.repository?.language || 'Unknown'}</span>
                    <p className="text-xs text-muted-foreground">Primary language</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-md hover:bg-accent transition-colors">
                  <Rocket className="w-5 h-5 text-warning flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm text-foreground">⭐ {repoData.repository?.stars?.toLocaleString() || 0} stars</span>
                    <p className="text-xs text-muted-foreground">Community engagement</p>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* AI Summary */}
          <Card className="p-6 bg-card border-border shadow-md">
            <h3 className="text-lg font-semibold text-foreground mb-4">AI Summary</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              {repoData?.ai?.summary || 'Load a repository to see AI-powered insights and analysis.'}
            </p>
            {repoData?.ai?.insights && repoData.ai.insights.length > 0 && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">Key Insights:</p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {repoData.ai.insights.slice(0, 4).map((insight, index) => (
                      <li key={index}>• {insight}</li>
                    ))}
                  </ul>
                </div>
                {repoData.ai.trends && (
                  <div>
                    <p className="text-sm font-medium text-foreground mb-2">Trends:</p>
                    <p className="text-sm text-muted-foreground">{repoData.ai.trends}</p>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Bottom Three Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Commit Notes */}
            <Card className="p-6 bg-card border-border shadow-md">
              <h3 className="text-lg font-semibold text-foreground mb-4">Recent Commits</h3>
              <div className="space-y-3">
                {repoData?.commits && repoData.commits.length > 0 ? (
                  repoData.commits.slice(0, 3).map((commit, index) => {
                    const colors = ['border-success', 'border-primary', 'border-destructive']
                    const firstLine = commit.message.split('\n')[0].substring(0, 50)
                    
                    return (
                      <div key={index} className={`border-l-2 ${colors[index]} pl-3 py-2`}>
                        <p className="text-sm font-medium text-foreground">{firstLine}...</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          by {commit.author?.name || 'Unknown'} • {new Date(commit.date).toLocaleDateString()}
                        </p>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">Load a repository to see recent commits</p>
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
                  <p className="text-success">
                    Stars: {repoData?.repository?.stars?.toLocaleString() || 0}
                  </p>
                  <p className="text-muted-foreground">
                    Forks: {repoData?.repository?.forks?.toLocaleString() || 0}
                  </p>
                  <p className="text-muted-foreground mt-2">Language: {repoData?.repository?.language || 'Unknown'}</p>
                </div>
              </div>
            </Card>

            {/* Language Breakdown */}
            <Card className="p-6 bg-card border-border shadow-md">
              <h3 className="text-lg font-semibold text-foreground mb-4">Language Breakdown</h3>
              <div className="space-y-3">
                {repoData?.stats?.languages && repoData.stats.languages.length > 0 ? (
                  repoData.stats.languages.slice(0, 5).map((lang, index) => {
                    const colors = ['bg-primary', 'bg-warning', 'bg-secondary', 'bg-destructive', 'bg-chart-5']
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
                  <p className="text-sm text-muted-foreground">Load a repository to see language distribution</p>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Right Column - Widgets */}
        <div className="lg:col-span-4 space-y-6">
          {/* Time & Weather Widget */}
          <Card className="p-6 bg-gradient-to-br from-primary/20 via-primary/10 to-secondary/20 border-primary/30 shadow-lg">
            <div className="text-center space-y-2">
              <p className="text-4xl font-bold text-foreground" suppressHydrationWarning>
                {timeString}
              </p>
              <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                {dateString}
              </p>
              <div className="flex items-center justify-center gap-2 pt-2">
                <Cloud className="w-5 h-5 text-foreground" />
                <span className="text-lg text-foreground">22°C</span>
                <span className="text-sm text-muted-foreground">Chicago</span>
              </div>
            </div>
          </Card>

          {/* Notifications */}
          <Card className="p-6 bg-card border-border shadow-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Notifications</h3>
              <Badge variant="destructive" className="rounded-full">
                3
              </Badge>
            </div>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-2 rounded hover:bg-accent transition-colors">
                <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
                <div className="flex-1">
                  <p className="text-sm text-foreground">New commit detected</p>
                  <p className="text-xs text-muted-foreground">2m ago</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-2 rounded hover:bg-accent transition-colors">
                <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
                <div className="flex-1">
                  <p className="text-sm text-foreground">AI analysis complete</p>
                  <p className="text-xs text-muted-foreground">5m ago</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-2 rounded hover:bg-accent transition-colors">
                <div className="w-2 h-2 rounded-full bg-muted-foreground mt-1.5" />
                <div className="flex-1">
                  <p className="text-sm text-foreground">Repository sync successful</p>
                  <p className="text-xs text-muted-foreground">12m ago</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Top Contributors */}
          <Card className="p-6 bg-card border-border shadow-md">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-5 h-5 text-warning" />
              <h3 className="text-lg font-semibold text-foreground">Top Contributors</h3>
            </div>
            <div className="space-y-4">
              {repoData?.contributors && repoData.contributors.length > 0 ? (
                repoData.contributors.slice(0, 5).map((contributor, index) => {
                  const initials = contributor.login.substring(0, 2).toUpperCase()
                  const colors = ['bg-warning', 'bg-muted-foreground', 'bg-chart-5', 'bg-muted', 'bg-muted']
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
                <p className="text-sm text-muted-foreground">Load a repository to see top contributors</p>
              )}
              {repoData?.repository?.fullName && repoData.contributors && repoData.contributors.length > 0 && (
                <a
                  href={`https://github.com/${repoData.repository.fullName}/graphs/contributors`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline block text-center mt-4"
                >
                  View all contributors →
                </a>
              )}
            </div>
          </Card>

          {/* System Status */}
          <Card className="p-6 bg-card border-border shadow-md">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-success" />
                <span className="text-sm font-medium text-foreground">AI Engine</span>
                <Badge variant="outline" className="ml-auto text-success border-success">
                  active
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-success" />
                <span className="text-sm font-medium text-foreground">Cache</span>
                <Badge variant="outline" className="ml-auto text-success border-success">
                  online
                </Badge>
              </div>
              <div className="pt-2 border-t border-border">
                <p className="text-sm font-medium text-success text-center">All Systems Operational</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
