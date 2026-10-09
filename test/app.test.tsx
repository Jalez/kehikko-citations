import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { mailbox, resetServerStanding } from 'kehikot-module-protocol/client'

import { App, KEPT } from '../src/app.tsx'

/**
 * The page, driven for real on both sides.
 *
 * The host is whatever posts `kehikot.hello` at the window — which is what a host is — and the
 * server's answers are a fake `fetch`, so a test can move the canvas between renders and stop the
 * server under an open page.
 */
const realFetch = globalThis.fetch
const settle = (ms = 30) => act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))))
const CONTEXT = { epic: null, theme: 'light', project: 'p', projectPath: '/p' }
let said: Record<string, unknown> = CONTEXT

/** Greet the page, as a host does on the frame's load. */
async function greet(context: Record<string, unknown> = {}, state: string | null = null) {
  said = { ...CONTEXT, ...context }
  window.postMessage({ type: 'kehikot.hello', protocol: 2, session: 's', state, context: said }, '*')
  await settle()
}

/** Move the canvas under an open page. */
async function move(context: Record<string, unknown>) {
  said = { ...said, ...context }
  window.postMessage({ type: 'kehikot.context', protocol: 2, ...said }, '*')
  await settle()
}

/** The page, framed and greeted. */
async function open(context: Record<string, unknown> = {}) {
  const drawn = render(<App />)
  await greet(context)
  return drawn
}

const cover = () => document.querySelector('[data-cover]')

beforeEach(() => {
  resetServerStanding()
  /* The mailbox replays what arrived before anybody listened, and the last test's greeting is not this one's. */
  mailbox.forget?.()
})

afterEach(() => {
  cleanup()
  globalThis.fetch = realFetch
  document.documentElement.className = ''
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
  await open({ epic: 'a' })
  await screen.findByText('Title of a')

  fireEvent.click(await screen.findByRole('button', { name: /^a/ }))
  await move({ epic: 'b' })

  await screen.findByText('Title of b')
  expect(screen.queryByText('Title of a')).toBeNull()
  expect(asked.at(-1)).toBe('b@/p')
})

test('a hand pick is dropped when the project changes, not asked of the new project', async () => {
  const asked = serve()
  await open({ epic: 'a', projectPath: '/p' })
  await screen.findByText('Title of a')
  fireEvent.click(await screen.findByRole('button', { name: /^b/ }))
  await screen.findByText('Title of b')

  await move({ epic: 'a', projectPath: '/q' })

  await waitFor(() => expect(asked.at(-1)).toBe('a@/q'))
  expect(asked).not.toContain('b@/q')
})

test('with no epic and no pick the last document is not left drawn', async () => {
  serve()
  await open({ epic: 'a' })
  await screen.findByText('Title of a')

  await move({ epic: null })

  await waitFor(() => expect(cover()?.getAttribute('data-cover')).toBe('no-epic'))
  expect(document.body.textContent).toContain('No epic is open — open one in Kehikot.')
  /* Two documents are above, so the cover says they can be picked. */
  expect(document.body.textContent).toContain('Or pick one of the documents above')
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
  await open({ epic: 'a', parts: PARTS() })
  await screen.findByText('Title of intro')
  expect(screen.getByText('Title of methods')).toBeTruthy()
  expect(screen.getByText('Title of nowhere')).toBeTruthy()
  expect(screen.getByText('typo')).toBeTruthy()
  expect(screen.getByText('3 of 3')).toBeTruthy()
  expect(screen.queryByTestId('focus')).toBeNull()
})

test('a ticked part leaves the entries cited in its files, and the rest are counted', async () => {
  serveThree()
  await open({ epic: 'a', parts: PARTS() })
  await screen.findByText('Title of intro')

  await move({ epic: 'a', parts: PARTS('intro') })

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
  await open({ epic: 'a', parts: PARTS() })
  fireEvent.click(await screen.findByText('Title of methods'))

  await move({ epic: 'a', parts: PARTS('intro') })

  expect(screen.getByText('Title of methods')).toBeTruthy()
  expect(screen.getByTestId('focus').textContent).toContain('The one you have open is among them')

  fireEvent.click(screen.getByText('Title of methods'))
  expect(screen.queryByText('Title of methods')).toBeNull()
})

test('parts that own none of the citing files leave a sentence, not the filter’s', async () => {
  serveThree()
  await open({ epic: 'a', parts: [{ id: 'results', heading: 'Results', refs: [], picked: true, files: ['chapters/results.tex'] }] })
  await screen.findByTestId('unfocused')
  expect(screen.getByTestId('focus').textContent).toStartWith('3 entries outside the picked part (Results).')
  expect(screen.queryByText('The filter is hiding every entry')).toBeNull()
})

test('a document of another epic, picked by hand, is not narrowed by the open epic’s parts', async () => {
  serveThree()
  await open({ epic: 'a', parts: PARTS('intro') })
  await screen.findByTestId('focus')

  fireEvent.click(screen.getByRole('button', { name: /^b/ }))

  await screen.findByText('Title of methods')
  expect(screen.getByText('Title of nowhere')).toBeTruthy()
  expect(screen.queryByTestId('focus')).toBeNull()
})

describe('the not-ready moments, each as the one shared cover', () => {
  test('before anything has greeted the page it is waiting — never "no project" — and then unhosted', async () => {
    const asked = serve()
    render(<App />)
    await settle()
    expect(cover()?.getAttribute('data-cover')).toBe('waiting')
    expect(document.body.textContent).not.toContain('No project')
    /* Nothing is forced onto the document before a host has said a theme. */
    expect(document.documentElement.classList.contains('light')).toBe(false)
    await settle(800)
    expect(cover()?.getAttribute('data-cover')).toBe('unhosted')
    expect(document.body.textContent).toContain('Nothing is framing this page — open Citations in Kehikot.')
    /* And nothing was read: with no project there is nowhere to look. */
    expect(asked).toHaveLength(0)
  })

  test('hosted with no project: no project, what this app would read, and the host’s theme on the document', async () => {
    serve()
    await open({ projectPath: null, theme: 'dark' })
    expect(cover()?.getAttribute('data-cover')).toBe('no-project')
    expect(document.body.textContent).toContain('No project is open — open one in Kehikot.')
    expect(document.body.textContent).toContain('.kehikot/paper/<epic>/')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  test('a project and an epic: loading under the head, then the list', async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    globalThis.fetch = (async (url: string) => {
      const u = new URL(url, 'http://x')
      if (u.pathname.endsWith('/api/documents')) return Response.json({ documents: [] })
      await held
      return Response.json({ citations: citations('a') })
    }) as unknown as typeof fetch
    await open({ epic: 'a' })
    expect(cover()?.getAttribute('data-cover')).toBe('loading')
    expect(screen.getByRole('heading', { name: 'a' })).toBeTruthy()
    release()
    await screen.findByText('Title of a')
    expect(cover()).toBeNull()
  })

  test('its own server not answering says so under the head, and Try again reads again', async () => {
    serve()
    await open({ epic: 'a' })
    await screen.findByText('Title of a')

    const working = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new TypeError('Load failed')
    }) as unknown as typeof fetch
    fireEvent.click(screen.getByRole('button', { name: /^b/ }))
    await waitFor(() => expect(cover()?.getAttribute('data-cover')).toBe('down'))
    expect(document.body.textContent).toContain('Citations’ own server is not answering.')
    expect(document.body.textContent).not.toContain('Load failed')
    /* The picker is still there: the cover is under the head, not over it. */
    expect(screen.getByRole('button', { name: /^a/ })).toBeTruthy()

    globalThis.fetch = working
    fireEvent.click(within(cover() as HTMLElement).getByRole('button', { name: 'Try again' }))
    await screen.findByText('Title of b')
    expect(cover()).toBeNull()
  })

  test('a refusal that is not "no such document" is said in the server’s own words', async () => {
    globalThis.fetch = (async (url: string) => {
      const u = new URL(url, 'http://x')
      if (u.pathname.endsWith('/api/documents')) return Response.json({ documents: [] })
      return Response.json({ ok: false, error: 'that is not an epic name' }, { status: 400 })
    }) as unknown as typeof fetch
    await open({ epic: 'a' })
    await screen.findByText('that is not an epic name')
    expect(document.body.textContent).not.toContain('No project')
  })

  test('no document for the epic stays this app’s own sentence', async () => {
    globalThis.fetch = (async (url: string) => {
      const u = new URL(url, 'http://x')
      if (u.pathname.endsWith('/api/documents')) return Response.json({ documents: [] })
      return Response.json({ ok: false, error: 'no document for "a" in this project' }, { status: 404 })
    }) as unknown as typeof fetch
    await open({ epic: 'a' })
    await screen.findByText('Nothing in this project holds a document for “a”')
  })
})

describe('the filter the host keeps', () => {
  test('what was kept is applied on the greeting, and the defaults are not written over it first', async () => {
    serve()
    const sent: unknown[] = []
    const hear = (event: MessageEvent) => {
      const data = event.data as { type?: string; method?: string; params?: { state?: string } }
      if (data?.type === 'kehikot.request' && data.method === 'state.set') sent.push(KEPT.read(data.params?.state ?? null))
    }
    window.addEventListener('message', hear)
    const saved = { sifting: { query: 'zzz', standing: 'uncited' as const }, ordering: 'key' as const }
    render(<App />)
    await settle()
    /* Not greeted: nothing is written, least of all the defaults. */
    expect(sent).toHaveLength(0)
    await greet({ epic: 'a' }, KEPT.write(saved))
    await settle(60)
    /* Whatever is sent back after the greeting is what was kept, never the defaults over it. */
    expect(sent.length).toBeGreaterThan(0)
    for (const one of sent) expect(one).toEqual(saved)
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('zzz')
    window.removeEventListener('message', hear)
  })

  test('the kept string is read strictly', () => {
    expect(KEPT.read(null)).toBeNull()
    expect(KEPT.read('not json')).toBeNull()
    expect(KEPT.read('{"v":-1}')).toBeNull()
  })
})
