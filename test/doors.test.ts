import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { answer } from '../doors.ts'
import { ID, MANIFEST } from '../manifest.ts'

/**
 * The doors, called the way `vite.config.ts` calls them: a method, a path, a
 * query and a body.
 *
 * The property under test throughout is that nothing here writes and nothing
 * here can be talked into reading outside a document's own root. The first test
 * is written as an enumeration rather than as a comment, because a comment
 * cannot fail.
 */

const root = mkdtempSync(join(tmpdir(), 'kehikko-citations-doors-'))
/* The project, with its paper where the paper module keeps it. */
const project = join(root, 'project')
const thesis = join(project, '.kehikot', 'paper', 'thesis')

beforeAll(() => {
  mkdirSync(join(thesis, 'chapters'), { recursive: true })
  writeFileSync(
    join(thesis, 'main.tex'),
    [
      '\\addbibresource{references.bib}',
      '\\title{A thesis}',
      '\\begin{document}',
      '\\include{chapters/one}',
      '\\end{document}',
    ].join('\n'),
  )
  writeFileSync(join(thesis, 'chapters', 'one.tex'), 'A claim \\autocite{cited}. A ghost \\autocite{ghost}.')
  writeFileSync(
    join(thesis, 'references.bib'),
    ['@article{cited, author = {A, One}, year = {2001}}', '@misc{nevercited, author = {B, Two}, year = {2002}}'].join(
      '\n',
    ),
  )
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

/* Every read names the project, as the page does from `kehikot.context.projectPath`. */
const get = (path: string, query = '', at: string | null = project) =>
  answer('GET', path, new URLSearchParams(at === null ? query : `${query}${query ? '&' : ''}project=${encodeURIComponent(at)}`), null)
const post = (path: string, body: Record<string, unknown> | null) =>
  answer('POST', path, new URLSearchParams(), body)

describe('there is no write path', () => {
  /*
   * Every POST this app will accept, enumerated. `/mcp` is the only one, and
   * every tool behind it reads. If a route is ever added that writes, this test
   * fails and whoever added it has to come and read the essay in `doors.ts`
   * about the ticket and the origin that must arrive with it.
   */
  test.each(['/api/edits', '/api/citations', '/api/documents', '/api/bib', '/api/notice'])(
    'POST %s is refused',
    (path) => {
      expect(post(path, { anything: 'at all' })?.status).toBeGreaterThanOrEqual(400)
    },
  )

  test('the MCP door offers only tools that read', () => {
    const reply = post('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const tools = ((reply?.body as { result: { tools: { name: string }[] } }).result.tools ?? []).map((t) => t.name)
    expect(tools).toEqual(['bibliography', 'problems'])
  })

  test('a GET on the MCP door is refused', () => {
    expect(get('/mcp')?.status).toBe(405)
  })

  test('a notification is answered with nothing at all', () => {
    expect(post('/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' })).toEqual({ status: 202, body: null })
  })
})

describe('the ordinary doors', () => {
  test('health says which module this is', () => {
    expect(get('/healthz')?.body).toEqual({ ok: true, id: ID, version: MANIFEST.version })
  })

  test('the document list says whether there is a project to look in', () => {
    /* Two fields, not one empty list. "No documents here" and "no project to
       look in" are different sentences and the page draws different screens
       for them. */
    const body = get('/api/documents')?.body as { nowhere: boolean; documents: { epic: string }[] }
    expect(body.nowhere).toBe(false)
    expect(body.documents.map((d) => d.epic)).toEqual(['thesis'])
  })

  test('with no project, the list says "nowhere" and a document read says why', () => {
    const body = get('/api/documents', '', null)?.body as { nowhere: boolean; documents: unknown[] }
    expect(body).toMatchObject({ nowhere: true, documents: [] })
    const reply = get('/api/citations', 'epic=thesis', null)
    expect(reply?.status).toBe(503)
    expect((reply?.body as { error: string }).error).toContain('.kehikot/paper/')
  })

  test('a relative project path is no project, not this program’s own folder', () => {
    const body = get('/api/documents', '', 'project')?.body as { nowhere: boolean }
    expect(body.nowhere).toBe(true)
  })

  test('one document comes back with its entries and its broken citations', () => {
    const body = get('/api/citations', 'epic=thesis')?.body as {
      citations: { bib: string; rows: { key: string; times: number }[]; broken: { key: string }[] }
    }
    expect(body.citations.bib).toBe('references.bib')
    expect(body.citations.rows.map((r) => [r.key, r.times])).toEqual([
      ['cited', 1],
      ['nevercited', 0],
    ])
    expect(body.citations.broken.map((b) => b.key)).toEqual(['ghost'])
  })

  test('an epic name that is not one is refused before any filesystem call', () => {
    /* Refused the same way whether or not the document exists. A refusal that
       distinguished the two would be a way to enumerate what is on this disk. */
    for (const attempt of ['../..', '/etc', 'Not A Slug', '']) {
      expect(get('/api/citations', `epic=${encodeURIComponent(attempt)}`)?.status).toBe(400)
    }
  })

  test('an unknown path under /api is ours to refuse rather than Vite’s to serve', () => {
    expect(get('/api/whatever')?.status).toBe(404)
    /* And anything else is not ours at all, so Vite still serves the page. */
    expect(get('/src/main.tsx')).toBeNull()
  })
})

describe('what an agent is told', () => {
  const call = (name: string, args: Record<string, unknown> = {}) => {
    const reply = post('/mcp', {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name, arguments: { project, ...args } },
    })
    return (reply?.body as { result: { content: { text: string }[] } }).result.content[0]!.text
  }

  test('the bibliography names the uncited entry as UNCITED rather than as a zero', () => {
    /* An agent scanning for a number will miss a `0`; it will not miss a word. */
    const text = call('bibliography', { epic: 'thesis' })
    expect(text).toContain('UNCITED\tnevercited')
    expect(text).toContain('x1\tcited')
  })

  test('problems leads with the broken citation and says what it compiles to', () => {
    const text = call('problems', { epic: 'thesis' })
    expect(text).toContain('BROKEN CITE\tghost')
    expect(text).toContain('UNCITED\tnevercited')
  })

  test('nothing wrong is a sentence, not an empty answer', () => {
    /*
     * "Nothing is wrong" and "this tool returned nothing" look identical to an
     * agent, and only one of them is a claim worth making.
     */
    const clean = join(project, '.kehikot', 'paper', 'clean')
    mkdirSync(clean, { recursive: true })
    writeFileSync(join(clean, 'main.tex'), '\\addbibresource{r.bib}\n\\begin{document}\\autocite{a}\\end{document}')
    writeFileSync(join(clean, 'r.bib'), '@misc{a, year = {2000}}')
    expect(call('problems', { epic: 'clean' })).toContain('Nothing wrong')
  })

  test('a tool with no project says where documents are expected, rather than guessing', () => {
    const text = call('bibliography', { project: undefined })
    expect(text).toContain('No project is open')
    expect(text).toContain('.kehikot/paper/')
  })

  test('an unknown tool is a JSON-RPC error rather than a thrown exception', () => {
    const reply = post('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'delete_everything' } })
    expect((reply?.body as { error?: { code: number } }).error?.code).toBe(-32602)
  })
})

describe('the manifest', () => {
  test('it parses against the protocol’s own schema, on import', () => {
    /* `manifest.ts` runs `manifestSchema.parse` at module load, so importing it
       at all is the check. A field that silently vanished here means a stale
       copy of the protocol package — `bun pm cache rm` then `bun update`. */
    expect(MANIFEST.id).toBe('kehikot.citations')
    expect(MANIFEST.entry).toBe('/app')
  })

  test('it declares storage, which is what makes the filter keepable', () => {
    /* Without it the page is framed on an opaque origin, where its own `/api`
       calls are cross-origin and `localStorage` THROWS rather than returning
       nothing. See the essay in `manifest.ts`. */
    expect(MANIFEST.declares.storage).toBe(true)
  })

  test('it does not ask to set the canvas selection', () => {
    /*
     * The refusal that took a decision, and it is here as a test because it is
     * the kind of thing somebody adds in a hurry. The protocol's `selection`
     * carries refs with no kinds, and every module reading it agrees what a ref
     * is; a citation key is not one. Putting `graesser2004autotutor` in there
     * would hand every module on the canvas a string it will look up in a
     * tracker and fail to find — a failure nobody sees as a failure.
     */
    expect(MANIFEST.declares.uses).not.toContain('selection:set')
    expect(MANIFEST.declares.uses).toEqual(['epics:read', 'state:keep'])
  })

  test('the guidance says what this module’s presence obliges, and fits', () => {
    expect(MANIFEST.guidance!.length).toBeLessThan(1024)
    expect(MANIFEST.guidance).toContain('never invent a bibliography entry')
  })
})
