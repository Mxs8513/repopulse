"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
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
  const [repoUrl, setRepoUrl] = useState("facebook/react")

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
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            className="flex-1 bg-background border-border text-foreground h-12"
          />
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 h-12">Load</Button>
        </div>
      </Card>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column - Main Content */}
        <div className="lg:col-span-8 space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Total Commits */}
            <Card className="p-6 bg-card border-border hover:border-primary/50 transition-all shadow-md hover:shadow-primary/20 min-h-[140px]">
              <div className="flex items-start justify-between mb-4">
                <BarChart3 className="w-6 h-6 text-primary" />
                <div className="text-right">
                  <div className="text-3xl font-bold text-foreground">1.2K</div>
                  <div className="text-sm text-success font-medium">+12.5%</div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">Total Commits</div>
            </Card>

            {/* Active Repos */}
            <Card className="p-6 bg-card border-border hover:border-primary/50 transition-all shadow-md hover:shadow-primary/20 min-h-[140px]">
              <div className="flex items-start justify-between mb-4">
                <Zap className="w-6 h-6 text-warning" />
                <div className="text-right">
                  <div className="text-3xl font-bold text-foreground">42</div>
                  <div className="text-sm text-success font-medium">+8.2%</div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">Active Repos</div>
            </Card>

            {/* AI Accuracy */}
            <Card className="p-6 bg-card border-border hover:border-primary/50 transition-all shadow-md hover:shadow-primary/20 min-h-[140px]">
              <div className="flex items-start justify-between mb-4">
                <Cpu className="w-6 h-6 text-secondary" />
                <div className="text-right">
                  <div className="text-3xl font-bold text-foreground">94%</div>
                  <div className="text-sm text-success font-medium">+2.1%</div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">AI Accuracy</div>
            </Card>

            {/* Lines Analyzed */}
            <Card className="p-6 bg-card border-border hover:border-primary/50 transition-all shadow-md hover:shadow-primary/20 min-h-[140px]">
              <div className="flex items-start justify-between mb-4">
                <Code2 className="w-6 h-6 text-chart-5" />
                <div className="text-right">
                  <div className="text-3xl font-bold text-foreground">50.0KK</div>
                  <div className="text-sm text-success font-medium">+15.3%</div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">Lines Analyzed</div>
            </Card>
          </div>

          {/* Repositories and Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Repositories */}
            <Card className="p-6 bg-card border-border shadow-md">
              <h3 className="text-lg font-semibold text-foreground mb-4">Repositories</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-md hover:bg-accent transition-colors cursor-pointer">
                  <div className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
                  <span className="text-sm text-foreground font-medium">facebook/react</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-md hover:bg-accent transition-colors cursor-pointer">
                  <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                  <span className="text-sm text-foreground font-medium">vercel/next.js</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-md hover:bg-accent transition-colors cursor-pointer">
                  <div className="w-2 h-2 rounded-full bg-chart-4 flex-shrink-0" />
                  <span className="text-sm text-foreground font-medium">tailwindlabs/tailwindcss</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-md hover:bg-accent transition-colors cursor-pointer">
                  <div className="w-2 h-2 rounded-full bg-warning flex-shrink-0" />
                  <span className="text-sm text-foreground font-medium">microsoft/vscode</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-md hover:bg-accent transition-colors cursor-pointer">
                  <div className="w-2 h-2 rounded-full bg-destructive flex-shrink-0" />
                  <span className="text-sm text-foreground font-medium">openai/openai-python</span>
                </div>
              </div>
            </Card>

            {/* Recent Activity */}
            <Card className="p-6 bg-card border-border shadow-md">
              <h3 className="text-lg font-semibold text-foreground mb-4">Recent Activity</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-md hover:bg-accent transition-colors">
                  <GitCommit className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-sm text-foreground">5 commits today</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-md hover:bg-accent transition-colors">
                  <FileCode className="w-5 h-5 text-secondary flex-shrink-0" />
                  <span className="text-sm text-foreground">12 files modified</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-md hover:bg-accent transition-colors">
                  <Rocket className="w-5 h-5 text-warning flex-shrink-0" />
                  <span className="text-sm text-foreground">2 new features</span>
                </div>
              </div>
            </Card>
          </div>

          {/* AI Summary */}
          <Card className="p-6 bg-card border-border shadow-md">
            <h3 className="text-lg font-semibold text-foreground mb-4">AI Summary</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              This repository shows active development with consistent contributions from multiple developers. Recent
              commits focus on performance improvements and feature enhancements.
            </p>
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Key Insights:</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• 15% increase in commit frequency</li>
                  <li>• Focus on React 18 features</li>
                  <li>• Strong TypeScript adoption</li>
                  <li>• Active community contributions</li>
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Trends:</p>
                <p className="text-sm text-muted-foreground">
                  Performance optimizations and developer experience improvements are the main focus areas.
                </p>
              </div>
            </div>
          </Card>

          {/* Bottom Three Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Commit Notes */}
            <Card className="p-6 bg-card border-border shadow-md">
              <h3 className="text-lg font-semibold text-foreground mb-4">Commit Notes</h3>
              <div className="space-y-3">
                <div className="border-l-2 border-success pl-3 py-2">
                  <p className="text-sm font-medium text-foreground">Suspense fallback added to UX</p>
                  <p className="text-xs text-muted-foreground mt-1">Improves loading states</p>
                </div>
                <div className="border-l-2 border-destructive pl-3 py-2">
                  <p className="text-sm font-medium text-foreground">Memory leak fixed in `useEffect`</p>
                  <p className="text-xs text-muted-foreground mt-1">Performance optimization</p>
                </div>
                <div className="border-l-2 border-primary pl-3 py-2">
                  <p className="text-sm font-medium text-foreground">API docs fully updated</p>
                  <p className="text-xs text-muted-foreground mt-1">Documentation improvements</p>
                </div>
              </div>
            </Card>

            {/* Repo Stats */}
            <Card className="p-6 bg-card border-border shadow-md">
              <h3 className="text-lg font-semibold text-foreground mb-4">Repo Stats</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-3xl font-bold text-foreground">324</p>
                  <p className="text-sm text-muted-foreground">Commits</p>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-success">+12,430 lines added</p>
                  <p className="text-destructive">-4,893 removed</p>
                  <p className="text-muted-foreground mt-2">Last 30 days</p>
                </div>
              </div>
            </Card>

            {/* File Types */}
            <Card className="p-6 bg-card border-border shadow-md">
              <h3 className="text-lg font-semibold text-foreground mb-4">File Types</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-foreground">TypeScript:</span>
                    <span className="text-muted-foreground">60%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: "60%" }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-foreground">JavaScript:</span>
                    <span className="text-muted-foreground">20%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-warning" style={{ width: "20%" }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-foreground">CSS:</span>
                    <span className="text-muted-foreground">15%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-secondary" style={{ width: "15%" }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-foreground">Other:</span>
                    <span className="text-muted-foreground">5%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-muted-foreground" style={{ width: "5%" }} />
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Right Column - Widgets */}
        <div className="lg:col-span-4 space-y-6">
          {/* Time & Weather Widget */}
          <Card className="p-6 bg-gradient-to-br from-primary/20 via-primary/10 to-secondary/20 border-primary/30 shadow-lg">
            <div className="text-center space-y-2">
              <p className="text-4xl font-bold text-foreground">23:38:12</p>
              <p className="text-sm text-muted-foreground">Monday, October 20, 2025</p>
              <div className="flex items-center justify-center gap-2 pt-2">
                <Cloud className="w-5 h-5 text-foreground" />
                <span className="text-lg text-foreground">22°C</span>
                <span className="text-sm text-muted-foreground">San Francisco</span>
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
              {[
                { rank: 1, name: "Alex Chen", initials: "AC", score: 95, color: "bg-warning" },
                { rank: 2, name: "Sarah Kim", initials: "SK", score: 87, color: "bg-muted-foreground" },
                { rank: 3, name: "Mike Johnson", initials: "MJ", score: 82, color: "bg-chart-5" },
                { rank: 4, name: "Emma Wilson", initials: "EW", score: 78, color: "bg-muted" },
                { rank: 5, name: "David Lee", initials: "DL", score: 73, color: "bg-muted" },
              ].map((contributor) => (
                <div key={contributor.rank} className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-foreground text-sm font-medium">
                    {contributor.rank}
                  </div>
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full ${contributor.color} text-foreground text-xs font-bold`}
                  >
                    {contributor.initials}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{contributor.name}</p>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-primary" style={{ width: `${contributor.score}%` }} />
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-foreground">{contributor.score}</span>
                </div>
              ))}
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
