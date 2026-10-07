import { afterEach, expect, mock, test } from 'bun:test'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { Roadmap } from '../src/wire/use-kehikot.ts'

/**
 * The page's own fetches, driven for real.
 *
 * The wire to the host is replaced by a mutable object and the server's
 * answers by a fake `fetch`, so a test can move the canvas between renders.
 */
let wire: Partial<Roadmap> = {}
mock.module('../src/wire/use-kehikot.ts', () => ({
  useKehikot: () => ({
    epic: null,
    project: '/p',
    theme: 'light',
    kept: null,
    framed: false,
    epics: null,
    keep: () => {},
    ...wire,
  }),
}))

const { App } = await import('../src/app.tsx')

afterEach(() => {
  cleanup()
  wire = {}
})

const citations = (epic: string) => ({
  epic,
  bib: 'refs.bib',
  files: ['main.tex'],
  rows: [{ key: `${epic}-key`, type: 'article', line: 1, times: 1, where: [], author: null, year: 2020, title: `Title of ${epic}`, venue: null }],
  broken: [],
  citesEverything: false,
  problems: [],
})

/** Serves two documents, `a` and `b`, and remembers what was asked for. */
function serve() {
  const asked: string[] = []
  globalThis.fetch = (async (url: string) => {
    const u = new URL(url, 'http://x')
    if (u.pathname.endsWith('/api/documents')) {
      return Response.json({
        documents: [
          { epic: 'a', title: null, entries: 1 },
          { epic: 'b', title: null, entries: 1 },
        ],
      })
    }
    const epic = u.searchParams.get('epic')!
    asked.push(`${epic}@${u.searchParams.get('project')}`)
    return Response.json({ citations: citations(epic) })
  }) as unknown as typeof fetch
  return asked
}

test('a hand pick holds only until the epic changes', async () => {
  const asked = serve()
  wire = { epic: 'a' }
  const { rerender } = render(<App />)
  await screen.findByText('Title of a')

  fireEvent.click(await screen.findByRole('button', { name: /^a/ }))
  wire = { epic: 'b' }
  rerender(<App />)

  await screen.findByText('Title of b')
  expect(screen.queryByText('Title of a')).toBeNull()
  expect(asked.at(-1)).toBe('b@/p')
})

test('a hand pick is dropped when the project changes, not asked of the new project', async () => {
  const asked = serve()
  wire = { epic: 'a', project: '/p' }
  const { rerender } = render(<App />)
  await screen.findByText('Title of a')
  fireEvent.click(await screen.findByRole('button', { name: /^b/ }))
  await screen.findByText('Title of b')

  wire = { epic: 'a', project: '/q' }
  rerender(<App />)

  await waitFor(() => expect(asked.at(-1)).toBe('a@/q'))
  expect(asked).not.toContain('b@/q')
})

test('with no epic and no pick the last document is not left drawn', async () => {
  serve()
  wire = { epic: 'a' }
  const { rerender } = render(<App />)
  await screen.findByText('Title of a')

  wire = { epic: null }
  rerender(<App />)

  await screen.findByText('No epic is open')
  expect(screen.queryByText('Title of a')).toBeNull()
})
