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
    parts: [],
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

/** Document `a` again, with three entries: cited from the introduction, from the methods, and from nowhere. */
function serveThree() {
  const row = (key: string, ...files: string[]) => ({
    key, type: 'article', line: 1, times: files.length, author: null, year: 2020, title: `Title of ${key}`, venue: null,
    where: files.map((file) => ({ file, line: 1, command: 'cite' })),
  })
  globalThis.fetch = (async (url: string) => {
    const u = new URL(url, 'http://x')
    if (u.pathname.endsWith('/api/documents')) {
      return Response.json({ documents: [{ epic: 'a', title: null, entries: 3 }, { epic: 'b', title: null, entries: 3 }] })
    }
    return Response.json({
      citations: {
        ...citations(u.searchParams.get('epic')!),
        rows: [row('intro', 'chapters/intro.tex'), row('methods', 'chapters/methods.tex'), row('nowhere')],
        broken: [{ key: 'typo', times: 1, where: [{ file: 'chapters/methods.tex', line: 9, command: 'cite' }] }],
      },
    })
  }) as unknown as typeof fetch
}

const PARTS = (...picked: string[]) =>
  ['intro', 'methods'].map((id) => ({ id, heading: id, refs: [], picked: picked.includes(id), files: [`chapters/${id}.tex`] }))

test('nothing ticked: every entry, every broken citation, and no line about parts', async () => {
  serveThree()
  wire = { epic: 'a', parts: PARTS() }
  render(<App />)
  await screen.findByText('Title of intro')
  expect(screen.getByText('Title of methods')).toBeTruthy()
  expect(screen.getByText('Title of nowhere')).toBeTruthy()
  expect(screen.getByText('typo')).toBeTruthy()
  expect(screen.getByText('3 of 3')).toBeTruthy()
  expect(screen.queryByTestId('focus')).toBeNull()
})

test('a ticked part leaves the entries cited in its files, and the rest are counted', async () => {
  serveThree()
  wire = { epic: 'a', parts: PARTS() }
  const { rerender } = render(<App />)
  await screen.findByText('Title of intro')

  wire = { epic: 'a', parts: PARTS('intro') }
  rerender(<App />)

  expect(screen.getByText('Title of intro')).toBeTruthy()
  expect(screen.queryByText('Title of methods')).toBeNull()
  expect(screen.queryByText('Title of nowhere')).toBeNull()
  expect(screen.queryByText('typo')).toBeNull()
  expect(screen.getByText('1 of 3')).toBeTruthy()
  expect(screen.getByTestId('focus').textContent).toBe(
    '2 entries outside the picked part (intro). 1 broken citation outside the picked part (intro).',
  )
})

test('a tick does not close the entry somebody has open', async () => {
  serveThree()
  wire = { epic: 'a', parts: PARTS() }
  const { rerender } = render(<App />)
  fireEvent.click(await screen.findByText('Title of methods'))

  wire = { epic: 'a', parts: PARTS('intro') }
  rerender(<App />)

  expect(screen.getByText('Title of methods')).toBeTruthy()
  expect(screen.getByTestId('focus').textContent).toContain('The one you have open is among them')

  fireEvent.click(screen.getByText('Title of methods'))
  expect(screen.queryByText('Title of methods')).toBeNull()
})

test('parts that own none of the citing files leave a sentence, not the filter’s', async () => {
  serveThree()
  wire = { epic: 'a', parts: [{ id: 'results', heading: 'Results', refs: [], picked: true, files: ['chapters/results.tex'] }] }
  render(<App />)
  await screen.findByTestId('unfocused')
  expect(screen.getByTestId('focus').textContent).toStartWith('3 entries outside the picked part (Results).')
  expect(screen.queryByText('The filter is hiding every entry')).toBeNull()
})

test('a document of another epic, picked by hand, is not narrowed by the open epic’s parts', async () => {
  serveThree()
  wire = { epic: 'a', parts: PARTS('intro') }
  render(<App />)
  await screen.findByTestId('focus')

  fireEvent.click(screen.getByRole('button', { name: /^b/ }))

  await screen.findByText('Title of methods')
  expect(screen.getByText('Title of nowhere')).toBeTruthy()
  expect(screen.queryByTestId('focus')).toBeNull()
})
