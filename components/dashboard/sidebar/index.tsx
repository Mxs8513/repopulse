"use client"

import type * as React from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import AtomIcon from "@/components/icons/atom"
import BracketsIcon from "@/components/icons/brackets"
import ProcessorIcon from "@/components/icons/proccesor"
import CuteRobotIcon from "@/components/icons/cute-robot"
import GearIcon from "@/components/icons/gear"
import { Bullet } from "@/components/ui/bullet"
import { useIsV0 } from "@/lib/v0-context"
import { usePathname } from "next/navigation"
import {
  GitCommit,
  Bot,
  FolderTree,
  MessageSquareCode,
  ClipboardList,
  GitPullRequestDraft,
  ShieldCheck,
  History,
  FileText,
} from "lucide-react"

const data = {
  navMain: [
    {
      title: "Agent Workflow",
      items: [
        {
          title: "Overview",
          url: "/",
          icon: BracketsIcon,
        },
        {
          title: "Codebase Map",
          url: "/codebase-map",
          icon: FolderTree,
        },
        {
          title: "Ask Repo",
          url: "/ask",
          icon: MessageSquareCode,
        },
        {
          title: "Change Planner",
          url: "/planner",
          icon: ClipboardList,
        },
        {
          title: "Diff Review",
          url: "/diff-review",
          icon: GitPullRequestDraft,
        },
        {
          title: "Verification",
          url: "/verification",
          icon: ShieldCheck,
        },
        {
          title: "Agent Runs",
          url: "/agent-runs",
          icon: History,
        },
        {
          title: "Final Report",
          url: "/final-report",
          icon: FileText,
        },
      ],
    },
    {
      title: "Repository Analytics",
      items: [
        {
          title: "Commits",
          url: "/commits",
          icon: GitCommit,
        },
        {
          title: "Timeline",
          url: "/timeline",
          icon: AtomIcon,
        },
        {
          title: "Analysis",
          url: "/analysis",
          icon: ProcessorIcon,
        },
        {
          title: "Insights",
          url: "/insights",
          icon: CuteRobotIcon,
        },
      ],
    },
    {
      title: "System",
      items: [
        {
          title: "Settings",
          url: "/settings",
          icon: GearIcon,
        },
      ],
    },
  ],
  desktop: {
    title: "Human Approval Required",
    status: "online",
  },
}

export function DashboardSidebar({ className, ...props }: React.ComponentProps<typeof Sidebar>) {
  const isV0 = useIsV0()
  const pathname = usePathname()

  return (
    <Sidebar {...props} className={cn("py-sides", className)}>
      <SidebarHeader className="rounded-t-lg flex gap-3 flex-row rounded-b-none">
        <div className="flex overflow-clip size-12 shrink-0 items-center justify-center rounded bg-sidebar-primary-foreground/10 transition-colors group-hover:bg-sidebar-primary text-sidebar-primary-foreground">
          <Bot className="size-10 group-hover:scale-[1.7] origin-top-left transition-transform" />
        </div>
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="text-2xl font-display">RepoPulse Agent</span>
          <span className="text-xs uppercase">AI Codebase Intelligence</span>
        </div>
      </SidebarHeader>

      <div className="px-4 py-3 bg-sidebar-accent/50 border-y border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-medium uppercase tracking-wide">{data.desktop.title}</span>
        </div>
      </div>

      <SidebarContent className="overflow-y-auto overscroll-contain">
        {data.navMain.map((group, i) => (
          <SidebarGroup className={cn(i === 0 && "rounded-t-none")} key={group.title}>
            <SidebarGroupLabel>
              <Bullet className="mr-2" />
              {group.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title} className={cn(isV0 && "pointer-events-none")}>
                    <SidebarMenuButton asChild isActive={pathname === item.url}>
                      <a href={item.url}>
                        <item.icon className="size-5" />
                        <span>{item.title}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {/* Workflow note lives inside the scrollable region so it never pins
            over the lower nav items on short laptop screens. */}
        <SidebarGroup>
          <SidebarGroupLabel>
            <Bullet className="mr-2" />
            Workflow
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-2 py-2">
            <p className="text-xs text-sidebar-foreground/70 leading-relaxed px-2">
              Repo → Index → Ask → Plan → Diff → Verify → Approve. The AI never applies changes without
              your explicit approval.
            </p>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}
