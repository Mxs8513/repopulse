// Server-side only. The token is never sent to the browser — all GitHub API
// calls happen inside API routes via GitHubService.

export function getGithubToken() {
  const token = (process.env.MY_GITHUB_PAT || process.env.GITHUB_TOKEN)?.trim()
  if (!token) {
    throw new Error(
      'Missing GitHub token. Set MY_GITHUB_PAT or GITHUB_TOKEN in .env.local (no quotes, no spaces, single line).'
    )
  }
  // Leak-safe debug: length only, never the value.
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Token check] GitHub token present (length=${token.length})`)
  }
  return token
}
