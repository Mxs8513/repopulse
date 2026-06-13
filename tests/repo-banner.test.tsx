// Hydration safety: React compares the server-rendered HTML with the first
// client render. These tests render RepoBanner both ways — with no browser
// globals (server) and with a populated localStorage (client first paint) —
// and assert the markup is identical. Effects don't run in renderToString,
// which is exactly the hydration-comparison surface.

import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { RepositoryProvider } from '@/lib/repository-context'
import { RepoBanner } from '@/components/agent/repo-banner'

function render(): string {
  return renderToString(
    <RepositoryProvider>
      <RepoBanner />
    </RepositoryProvider>
  )
}

const g = globalThis as Record<string, unknown>

afterEach(() => {
  delete g.window
  delete g.localStorage
})

describe('RepoBanner hydration', () => {
  it('renders identical markup on server and client first paint when a repo is stored', () => {
    // Server: no window, no localStorage.
    const serverHtml = render()

    // Client first paint: browser globals exist and a repo was previously saved.
    g.window = {}
    g.localStorage = {
      getItem: () => 'XiaomiMiMo/MiMo-Code',
      setItem: () => undefined,
      removeItem: () => undefined,
    }
    const clientHtml = render()

    expect(clientHtml).toBe(serverHtml)
  })

  it('shows a stable placeholder until the stored repo loads after mount', () => {
    const html = render()
    expect(html).toContain('Loading repository')
    // The stored value must never appear in pre-hydration markup.
    expect(html).not.toContain('XiaomiMiMo')
  })
})
