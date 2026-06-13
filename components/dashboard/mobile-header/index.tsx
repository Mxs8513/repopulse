import * as React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Bot } from "lucide-react";

export function MobileHeader() {
  return (
    <div className="lg:hidden h-header-mobile sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="flex items-center justify-between px-4 py-3">
        {/* Left: opens the sidebar navigation */}
        <SidebarTrigger />

        {/* Center: RepoPulse Agent branding (matches the desktop sidebar) */}
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded bg-sidebar-primary-foreground/10 text-sidebar-primary-foreground">
            <Bot className="size-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-display">RepoPulse Agent</p>
            <p className="text-[10px] uppercase text-muted-foreground">AI Codebase Intelligence</p>
          </div>
        </div>

        {/* Right: spacer to keep the branding centered (no fake notifications UI) */}
        <div className="size-9" aria-hidden="true" />
      </div>
    </div>
  );
}
