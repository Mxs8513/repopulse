# RepoPulse Backup Plan

## Backup Strategy

This backup will create a complete, non-destructive snapshot of the RepoPulse project while preserving all original files.

## What Will Be Archived

### Included
- All source code files (.ts, .tsx, .js, .jsx, .json, .md, etc.)
- Configuration files (tsconfig.json, package.json, next.config.mjs, etc.)
- Public assets (images, fonts, etc.)
- Environment configuration (redacted)

### Excluded (to keep backup size manageable)
- `.next/` - Next.js build output
- `node_modules/` - Dependencies (can be reinstalled with npm install)
- `.git/` - Git history (already in the original project)
- `coverage/` - Test coverage reports
- `.vercel/` - Deployment cache
- `dist/`, `build/`, `out/` - Build directories

## Safety Rules

1. **NO destructive actions** - Original project is never modified
2. **NO git operations** - Won't run git clean or mutate working tree
3. **NO deletions** - All backups are additive only
4. **Secrets are redacted** - Environment files have values replaced with ***REDACTED***
5. **Integrity checks** - All backups include checksums and manifests

## Backup Destination

All backups will be created in: `~/Desktop/RepoPulse-backups/`

## Backup Components

1. **Zip Archive** - Lightweight code snapshot (excludes builds)
2. **Code Snapshot** - Plain folder copy (excludes builds)
3. **Full Copy** - Complete copy with all dependencies (if space allows)
4. **Environment Files** - Redacted copies for reference
5. **Manifests & Checksums** - For integrity verification
6. **Restore Test** - Non-destructive test in /tmp

## Estimated Backup Sizes

- Zip archive: ~50-100 MB
- Code snapshot: ~50-100 MB
- Full copy: ~500 MB - 1 GB

## Last Updated

2024-10-28

