"use client"

import { useEffect, useState } from 'react'

interface AnimatedStatCardProps {
  icon: string
  value: string
  change: string
  label: string
  trend: number[]
  onClick?: () => void
  href?: string
}

export function AnimatedStatCard({ icon, value, change, label, trend, onClick, href }: AnimatedStatCardProps) {
  const [displayValue, setDisplayValue] = useState(0)
  const numericValue = parseFloat(value.replace(/[^0-9.]/g, ''))
  
  useEffect(() => {
    let start = 0
    const duration = 1000
    const increment = numericValue / (duration / 16)
    
    const timer = setInterval(() => {
      start += increment
      if (start >= numericValue) {
        setDisplayValue(numericValue)
        clearInterval(timer)
      } else {
        setDisplayValue(start)
      }
    }, 16)
    
    return () => clearInterval(timer)
  }, [numericValue])
  
  const max = Math.max(...trend)
  const min = Math.min(...trend)
  const range = max - min
  
  const cardContent = (
    <>
      <div className="flex items-start justify-between mb-4">
        <span className="text-3xl group-hover:scale-110 transition-transform">{icon}</span>
        <div className="text-right">
          <div className="text-3xl font-bold">
            {value.includes('K') ? `${displayValue.toFixed(1)}K` : displayValue.toFixed(0)}
            {value.includes('%') && '%'}
          </div>
          <div className="text-sm text-green-500 font-medium">{change}</div>
        </div>
      </div>
      
      <div className="flex items-end gap-1 h-8 mb-2">
        {trend.map((val, i) => {
          const height = ((val - min) / range) * 100
          return (
            <div
              key={i}
              className="flex-1 bg-primary/30 rounded-sm transition-all duration-300 hover:bg-primary"
              style={{ height: `${height}%` }}
            />
          )
        })}
      </div>
      
      <div className="text-sm text-muted-foreground">{label}</div>
    </>
  )
  
  const className = "rounded-lg border bg-card p-6 hover:border-primary transition-all duration-200 group hover:shadow-lg hover:shadow-primary/20"
  
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${className} cursor-pointer block`}
      >
        {cardContent}
      </a>
    )
  }
  
  return (
    <div 
      onClick={onClick}
      className={`${className} ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {cardContent}
    </div>
  )
}

