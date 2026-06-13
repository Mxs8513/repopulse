import { describe, it, expect } from 'vitest'
import { analyzePatch, verifyProposalPatches } from '../lib/agent/diff-verification'
import type { FilePatchProposal } from '../lib/agent/types'

describe('Enhanced Diff Verification', () => {
  it('fails on unstructured JSON output', () => {
    const patch: FilePatchProposal = {
      path: 'src/Button.tsx',
      changeSummary: 'Update button',
      reasoning: 'Better styling',
      risk: 'low',
      proposedChange: '{"error": "could not generate patch"}',
      groundedInContent: true,
      approval: 'pending',
    }

    const result = analyzePatch(patch, { task: 'fix button', constraints: [] })
    expect(result.status).toBe('failed')
    expect(result.issues.some((i) => i.id === 'structured')).toBe(true)
  })

  it('fails on placeholder content', () => {
    const patch: FilePatchProposal = {
      path: 'src/handler.ts',
      changeSummary: 'Add handler',
      reasoning: 'Implement logic',
      risk: 'low',
      proposedChange: `
        export function myHandler() {
          // TODO: implement logic here
          return true
        }
      `,
      groundedInContent: true,
      approval: 'pending',
    }

    const result = analyzePatch(patch, { task: 'add handler', constraints: [] })
    expect(result.status).toBe('failed')
    expect(result.issues.some((i) => i.id === 'placeholder')).toBe(true)
  })

  it('fails when patch path does not match declared file', () => {
    const patch: FilePatchProposal = {
      path: 'src/Button.tsx',
      changeSummary: 'Update',
      reasoning: 'Fix',
      risk: 'low',
      proposedChange: `diff --git a/src/Icon.tsx b/src/Icon.tsx
        --- a/src/Icon.tsx
        +++ b/src/Icon.tsx
        @@ -1 +1 @@
        -export const Icon = () => null
        +export const Icon = () => <div />`,
      groundedInContent: true,
      approval: 'pending',
    }

    const result = analyzePatch(patch, { task: 'fix button', constraints: [] })
    expect(result.status).toBe('failed')
    expect(result.issues.some((i) => i.id === 'path_match')).toBe(true)
  })

  it('fails when test_only constraint is violated', () => {
    const patch: FilePatchProposal = {
      path: 'src/utils.ts',
      changeSummary: 'Update utils',
      reasoning: 'Add helper',
      risk: 'low',
      proposedChange: 'export function helper() { return 42; }',
      groundedInContent: true,
      approval: 'pending',
    }

    const result = analyzePatch(patch, {
      task: 'add test',
      constraints: ['test_only'],
    })
    expect(result.status).toBe('failed')
    expect(result.issues.some((i) => i.id === 'constraints')).toBe(true)
  })

  it('warns on ungrounded patch', () => {
    const patch: FilePatchProposal = {
      path: 'src/Button.tsx',
      changeSummary: 'Update',
      reasoning: 'Fix styling',
      risk: 'low',
      proposedChange: 'export function Button() { }',
      groundedInContent: false,
      contentUnavailableReason: 'File too large',
      approval: 'pending',
    }

    const result = analyzePatch(patch, { task: 'fix button', constraints: [] })
    expect(result.status).toBe('failed')
    expect(result.issues.some((i) => i.id === 'grounded')).toBe(true)
  })

  it('warns on weak stub signals', () => {
    const patch: FilePatchProposal = {
      path: 'src/handler.ts',
      changeSummary: 'Implement handler',
      reasoning: 'Add handler logic',
      risk: 'low',
      proposedChange: `
        export function handler() {
          console.warn('Not implemented yet')
          return true
        }
      `,
      groundedInContent: true,
      approval: 'pending',
    }

    const result = analyzePatch(patch, { task: 'add handler', constraints: [] })
    expect(result.status).toBe('needs_review')
    expect(result.issues.some((i) => i.severity === 'warn')).toBe(true)
  })

  it('passes on valid patch with good explanation', () => {
    const patch: FilePatchProposal = {
      path: 'src/Button.tsx',
      changeSummary: 'Add disabled state styling to Button component',
      reasoning: 'The Button component was missing visual feedback for disabled state. This patch adds gray text and reduced opacity when disabled prop is true, improving UX.',
      risk: 'low',
      proposedChange: `
        export function Button({ disabled }: { disabled?: boolean }) {
          return (
            <button 
              className={disabled ? 'opacity-50 text-gray-400' : 'text-black'}
              disabled={disabled}
            >
              Click me
            </button>
          )
        }
      `,
      groundedInContent: true,
      approval: 'pending',
    }

    const result = analyzePatch(patch, { task: 'add disabled state to button', constraints: [] })
    expect(result.status).toMatch(/passed|needs_review/)
    expect(result.score).toBeGreaterThanOrEqual(70)
  })

  it('detects multiple issues in a bad proposal', () => {
    const patches: FilePatchProposal[] = [
      {
        path: 'src/Auth.tsx',
        changeSummary: 'Fix auth',
        reasoning: 'Implement security',
        risk: 'high',
        proposedChange: '{"error": "invalid"}',
        groundedInContent: false,
        approval: 'pending',
      },
      {
        path: 'src/config.json',
        changeSummary: 'Update config',
        reasoning: 'Fix config',
        risk: 'medium',
        proposedChange: 'TODO: implement this',
        groundedInContent: true,
        approval: 'pending',
      },
    ]

    const { patches: verified, summary } = verifyProposalPatches(patches, {
      task: 'add test for button',
      constraints: ['test_only'],
    })

    expect(summary.failed).toBeGreaterThan(0)
    expect(summary.canApproveAll).toBe(false)
  })
})
