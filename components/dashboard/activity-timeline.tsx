export function ActivityTimeline() {
  const activities = [
    { type: 'commit', user: 'Alex Chen', action: 'pushed 3 commits to', target: 'main', time: '2m ago', color: 'bg-green-500' },
    { type: 'pr', user: 'Sarah Kim', action: 'opened pull request', target: '#234', time: '15m ago', color: 'bg-blue-500' },
    { type: 'issue', user: 'Mike Johnson', action: 'closed issue', target: '#189', time: '1h ago', color: 'bg-purple-500' },
    { type: 'release', user: 'Emma Wilson', action: 'published release', target: 'v2.1.0', time: '3h ago', color: 'bg-orange-500' },
  ]

  return (
    <div className="rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold mb-4">Activity Timeline</h2>
      <div className="space-y-4">
        {activities.map((activity, index) => (
          <div key={index} className="flex gap-4 group">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full ${activity.color} ring-4 ring-card group-hover:ring-primary/20 transition-all`} />
              {index < activities.length - 1 && (
                <div className="w-0.5 h-full bg-border mt-1" />
              )}
            </div>
            <div className="flex-1 pb-4">
              <div className="text-sm">
                <span className="font-medium text-primary">{activity.user}</span>
                <span className="text-muted-foreground"> {activity.action} </span>
                <span className="font-medium">{activity.target}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{activity.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

