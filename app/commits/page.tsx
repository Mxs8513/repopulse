import { CommitsList } from '@/components/commits/commits-list'

export default function CommitsPage() {
  return (
    <div className="min-h-screen p-6">
      <div className="container mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Commit History</h1>
          <p className="text-sm text-muted-foreground mt-2">View and analyze repository commit activity</p>
        </div>
        <CommitsList />
      </div>
    </div>
  )
}

