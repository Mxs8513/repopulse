'use client'

import { useState } from 'react'
import { X, Zap, Brain, TrendingUp, Shield } from 'lucide-react'

export function DashboardIntro() {
  const [isVisible, setIsVisible] = useState(true)

  if (!isVisible) return null

  return (
    <div className="relative rounded-lg border bg-gradient-to-br from-purple-900/20 via-blue-900/20 to-background p-8 mb-6 overflow-hidden" suppressHydrationWarning>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f12_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f12_1px,transparent_1px)] bg-[size:24px_24px] opacity-20" />
      
      <button
        onClick={() => setIsVisible(false)}
        className="absolute top-4 right-4 p-2 rounded-md hover:bg-muted/50 transition-colors z-10"
        aria-label="Close introduction"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="relative z-10">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-4xl">📊</div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              RepoPulse Dashboard
            </h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-3xl">
            <span className="font-semibold text-foreground">Monitor, Optimize, Navigate, Keep Your</span> repository activity with AI-powered insights and real-time analytics.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="rounded-lg bg-card/50 backdrop-blur-sm border border-purple-500/20 p-4 hover:border-purple-500/40 transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-md bg-purple-500/10">
                <Zap className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="font-semibold">Real-Time Monitoring</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Track commits, pull requests, and repository activity as they happen
            </p>
          </div>
          <div className="rounded-lg bg-card/50 backdrop-blur-sm border border-blue-500/20 p-4 hover:border-blue-500/40 transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-md bg-blue-500/10">
                <Brain className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="font-semibold">AI-Powered Insights</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Get intelligent analysis and recommendations for your codebase
            </p>
          </div>
          <div className="rounded-lg bg-card/50 backdrop-blur-sm border border-cyan-500/20 p-4 hover:border-cyan-500/40 transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-md bg-cyan-500/10">
                <TrendingUp className="w-5 h-5 text-cyan-400" />
              </div>
              <h3 className="font-semibold">Performance Metrics</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Visualize trends and measure team productivity over time
            </p>
          </div>
          <div className="rounded-lg bg-card/50 backdrop-blur-sm border border-green-500/20 p-4 hover:border-green-500/40 transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-md bg-green-500/10">
                <Shield className="w-5 h-5 text-green-400" />
              </div>
              <h3 className="font-semibold">Code Quality</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Analyze code patterns and maintain high standards across repos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 border border-primary/20">
          <div className="text-2xl">🚀</div>
          <div className="flex-1">
            <h3 className="font-semibold mb-1">Quick Start</h3>
            <p className="text-sm text-muted-foreground">
              Enter a repository name above to begin monitoring. Try <code className="px-2 py-0.5 rounded bg-muted text-xs">facebook/react</code> or <code className="px-2 py-0.5 rounded bg-muted text-xs">vercel/next.js</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

