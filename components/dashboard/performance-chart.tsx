"use client";

import * as React from "react";
import { XAxis, YAxis, CartesianGrid, Area, AreaChart } from "recharts";
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval, eachMonthOfInterval, subMonths, startOfYear, eachWeekOfInterval } from "date-fns";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bullet } from "@/components/ui/bullet";
import type { TimePeriod } from "@/types/dashboard";

const chartConfig = {
  commits: {
    label: "Commits",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

type ChartDataPoint = {
  date: string;
  commits: number;
};

interface DashboardChartProps {
  commits?: Array<{
    date: string;
    sha: string;
  }>;
}

export function PerformanceChart({ commits = [] }: DashboardChartProps) {
  const [activeTab, setActiveTab] = React.useState<TimePeriod>("week");

  const handleTabChange = (value: string) => {
    if (value === "week" || value === "month" || value === "year") {
      setActiveTab(value as TimePeriod);
    }
  };

  const processCommitsData = (timePeriod: TimePeriod): ChartDataPoint[] => {
    if (commits.length === 0) {
      return [];
    }

    const now = new Date();
    let dateRange: Date[] = [];
    let dateFormat = "";

    if (timePeriod === "week") {
      dateRange = eachDayOfInterval({
        start: subDays(now, 6),
        end: now,
      });
      dateFormat = "EEE";
    } else if (timePeriod === "month") {
      dateRange = eachWeekOfInterval({
        start: subDays(now, 29),
        end: now,
      });
      dateFormat = "MMM dd";
    } else {
      dateRange = eachMonthOfInterval({
        start: subMonths(now, 11),
        end: now,
      });
      dateFormat = "MMM";
    }

    const commitCounts = new Map<string, number>();

    commits.forEach((commit) => {
      const commitDate = new Date(commit.date);
      
      dateRange.forEach((rangeDate) => {
        const key = format(rangeDate, dateFormat);
        
        if (timePeriod === "week") {
          if (format(commitDate, "yyyy-MM-dd") === format(rangeDate, "yyyy-MM-dd")) {
            commitCounts.set(key, (commitCounts.get(key) || 0) + 1);
          }
        } else if (timePeriod === "month") {
          const weekStart = startOfWeek(rangeDate);
          const weekEnd = endOfWeek(rangeDate);
          if (commitDate >= weekStart && commitDate <= weekEnd) {
            commitCounts.set(key, (commitCounts.get(key) || 0) + 1);
          }
        } else {
          if (format(commitDate, "yyyy-MM") === format(rangeDate, "yyyy-MM")) {
            commitCounts.set(key, (commitCounts.get(key) || 0) + 1);
          }
        }
      });
    });

    return dateRange.map((date) => {
      const key = format(date, dateFormat);
      return {
        date: key,
        commits: commitCounts.get(key) || 0,
      };
    });
  };

  const formatYAxisValue = (value: number) => {
    if (value === 0) {
      return "";
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}K`;
    }
    return value.toString();
  };

  const renderChart = (data: ChartDataPoint[]) => {
    if (data.length === 0) {
      return (
        <div className="bg-accent rounded-lg p-12 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">
            Enter a repository above to view commit activity
          </p>
        </div>
      );
    }

    return (
      <div className="bg-accent rounded-lg p-3">
        <ChartContainer className="md:aspect-[3/1] w-full" config={chartConfig}>
          <AreaChart
            accessibilityLayer
            data={data}
            margin={{
              left: -12,
              right: 12,
              top: 12,
              bottom: 12,
            }}
          >
            <defs>
              <linearGradient id="fillCommits" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-commits)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-commits)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              horizontal={false}
              strokeDasharray="8 8"
              strokeWidth={2}
              stroke="var(--muted-foreground)"
              opacity={0.3}
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              tickMargin={12}
              strokeWidth={1.5}
              className="uppercase text-sm fill-muted-foreground"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={0}
              tickCount={6}
              className="text-sm fill-muted-foreground"
              tickFormatter={formatYAxisValue}
              domain={[0, "dataMax"]}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  className="min-w-[200px] px-4 py-3"
                />
              }
            />
            <Area
              dataKey="commits"
              type="linear"
              fill="url(#fillCommits)"
              fillOpacity={0.4}
              stroke="var(--color-commits)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ChartContainer>
      </div>
    );
  };

  const weekData = processCommitsData("week");
  const monthData = processCommitsData("month");
  const yearData = processCommitsData("year");

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleTabChange}
      className="max-md:gap-4"
    >
      <div className="flex items-center justify-between mb-4 max-md:contents">
        <TabsList className="max-md:w-full">
          <TabsTrigger value="week">WEEK</TabsTrigger>
          <TabsTrigger value="month">MONTH</TabsTrigger>
          <TabsTrigger value="year">YEAR</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-6 max-md:order-1">
          <ChartLegend label="Commits" color="var(--chart-1)" />
        </div>
      </div>
      <TabsContent value="week" className="space-y-4">
        {renderChart(weekData)}
      </TabsContent>
      <TabsContent value="month" className="space-y-4">
        {renderChart(monthData)}
      </TabsContent>
      <TabsContent value="year" className="space-y-4">
        {renderChart(yearData)}
      </TabsContent>
    </Tabs>
  );
}

export const ChartLegend = ({
  label,
  color,
}: {
  label: string;
  color: string;
}) => {
  return (
    <div className="flex items-center gap-2 uppercase">
      <Bullet style={{ backgroundColor: color }} className="rotate-45" />
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
    </div>
  );
};

