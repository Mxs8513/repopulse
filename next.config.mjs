/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Prevent cache errors with large GitHub API responses
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
}

// Debug: Log token length when Next.js loads config
const token = process.env.GITHUB_TOKEN
console.log('[next.config.mjs] GitHub token length:', token?.length)
console.log('[next.config.mjs] Token preview:', token?.substring(0, 20))

export default nextConfig
