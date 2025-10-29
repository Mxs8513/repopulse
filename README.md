# RepoPulse

> **Actionable insights for your GitHub repositories**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Deploy on Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Mxs8513/repopulse)

## Overview

RepoPulse is a modern, AI-powered GitHub analytics dashboard that provides real-time insights into repository activity, commit patterns, contributor behavior, and development trends. Built with Next.js and React, it transforms raw GitHub data into actionable intelligence for development teams.

### Main Features

- 🎯 **Dashboard Overview** (`/`) - Real-time repository statistics and activity
- 📊 **Repository Analysis** (`/analysis`) - AI-powered repository insights and explanations
- 📝 **Commit History** (`/commits`) - Detailed commit timeline with file changes
- 📈 **Activity Timeline** (`/timeline`) - Visual timeline of repository events
- 💡 **Insights & Trends** (`/insights`) - AI-generated development insights and patterns

## Key Features

- ✅ **Real-time GitHub Data** - Fetch actual commits, contributors, and statistics from GitHub API
- ✅ **AI-Powered Analysis** - Intelligent insights using Groq AI (optional, gracefully degrades)
- ✅ **Commit Visualization** - Interactive commit history with detailed file changes
- ✅ **Contributor Analytics** - Track contributor activity and contributions
- ✅ **Repository Statistics** - Stars, forks, issues, branches, and pull requests
- ✅ **PR Review Times** - Estimate average time to review pull requests
- ✅ **Trend Snapshots** - Visual representation of development patterns
- ✅ **Search & Filter** - Find repositories quickly with real-time search
- ✅ **Responsive Design** - Works seamlessly on desktop and mobile
- ✅ **GitHub Integration** - Direct links to GitHub pages for repositories, commits, and PRs

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **UI Library**: React 18
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui
- **Charts**: Recharts
- **AI**: Groq API (optional)
- **Deployment**: Vercel

## Quick Start

### Prerequisites

- Node.js 18+ (LTS recommended)
- pnpm (recommended) or npm
- GitHub Personal Access Token (optional, for higher rate limits)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/Mxs8513/repopulse.git
cd repopulse
```

2. Install dependencies:

```bash
pnpm install
```

3. Set up environment variables:

Create a `.env.local` file in the root directory:

```bash
# GitHub Personal Access Token (optional but recommended for higher rate limits)
MY_GITHUB_PAT=your_github_token_here

# Groq API Key (optional, enables AI analysis features)
GROQ_API_KEY=your_groq_api_key_here
```

4. Run the development server:

```bash
pnpm dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MY_GITHUB_PAT` | Optional | GitHub Personal Access Token for higher API rate limits (5000/hour vs 60/hour without auth) |
| `GROQ_API_KEY` | Optional | Groq API key for AI-powered analysis features |

**Note**: AI features gracefully degrade if `GROQ_API_KEY` is not set. The app will work without fetching AI insights.

## API Endpoints

### Health Check

```bash
GET /api/health
```

Returns service health status.

### Repository Data

```bash
GET /api/repo?repo=<owner>/<name>
```

**Example:**

```bash
curl http://localhost:3000/api/repo?repo=facebook/react
```

**Response includes:**
- Repository metadata (name, stars, forks, issues)
- Recent commits with authors and dates
- Contributors list
- Branch and PR statistics
- AI analysis (if API key is configured)

## Deployment

### Deploy on Vercel (Recommended)

[![Deploy on Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Mxs8513/repopulse)

1. Click the button above or visit [Vercel](https://vercel.com)
2. Import your repository
3. Add environment variables in **Project Settings > Environment Variables**
4. Deploy

### Manual Deployment

1. Set environment variables in your deployment platform
2. Build the project: `pnpm build`
3. Start the production server: `pnpm start`

## Security

⚠️ **Important**: Never commit secrets or API keys to the repository.

- All secrets should be in `.env.local` (already gitignored)
- Use environment variables in production
- This repository includes a pre-commit hook that blocks accidental secret commits
- Review the `.gitignore` file to ensure sensitive files are excluded

## Project Structure

```
repopulse/
├── app/                    # Next.js app router pages
│   ├── page.tsx           # Dashboard home
│   ├── analysis/          # Repository analysis page
│   ├── commits/           # Commit history page
│   ├── timeline/          # Activity timeline page
│   ├── insights/          # Insights & trends page
│   └── api/               # API routes
├── components/            # React components
│   ├── dashboard/         # Dashboard components
│   ├── analysis/          # Analysis components
│   ├── commits/           # Commit components
│   ├── timeline/          # Timeline components
│   ├── insights/          # Insights components
│   └── ui/               # Reusable UI components
├── lib/                  # Utility functions and services
│   ├── github-service.ts # GitHub API integration
│   ├── ai-service.ts     # AI analysis service
│   └── getGithubToken.ts # Token management
├── hooks/                # Advanced custom React hooks
├── public/               # Static assets
└── types/                # TypeScript type definitions
```

## Recent Updates

See [CHANGELOG.md](./CHANGELOG.md) for detailed version history. Latest highlights:

- **Version 1.36.0** - Rebranded to RepoPulse & Removed Monkey Icon
- **Version 1.35.0** - AI Analysis enabled for Analysis page
- **Version 1.34.0** - Repository Analysis page created
- **Version 1.33.0** - Insights Page with AI Analysis
- **Version 1.32.0** - Fixed Infinite Render Loop
- **Version 1.30.0** - GitHub API integration with real data

## Roadmap

- [ ] Add multi-repository comparison
- [ ] Enhanced AI insights with customizable prompts
- [ ] Export reports as PDF/JSON
- [ ] Webhook integration for real-time updates
- [ ] Custom dashboard widgets
- [ ] Support for private repositories (with authentication)

## License

MIT License - See LICENSE file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branchоци (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Charts powered by [Recharts](https://recharts.org/)
- AI insights powered by [Groq](https://groq.com/)

## Support

For issues, questions, or contributions, please open an issue on [GitHub](https://github.com/Mxs8513/repopulse/issues).

---

**Made with ❤️ by [Mxs8513](https://github.com/Mxs8513)**
