import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ASK, answer } from '../doors.ts'
import { DEFAULT_ASK } from './setup.ts'

const root = mkdtempSync(join(tmpdir(), 'kehikko-citations-moved-'))
const now = join(root, 'new')
const old = join(root, 'old')
const stranger = join(root, 'stranger')
const ID = 'proj-1234abcd'
const env = { KEHIKOT_ORIGINS: 'http://127.0.0.1:4170' }

beforeAll(() => {
  const thesis = join(now, '.kehikot', 'paper', 'thesis')
  mkdirSync(thesis, { recursive: true })
  writeFileSync(join(thesis, 'main.tex'), '\\addbibresource{r.bib}\n\\begin{document}\\autocite{a}\\end{document}')
  writeFileSync(join(thesis, 'r.bib'), '@misc{a, year = {2000}}')
  mkdirSync(stranger, { recursive: true })
})
afterEach(() => {
  ASK.options = DEFAULT_ASK
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

function host(table: Record<string, unknown>): typeof fetch {
  return (async (url: string) => {
    const path = new URL(url).searchParams.get('path') ?? ''
    return new Response(JSON.stringify(table[path] ?? { ok: true, project: false }), { status: 200 })
  }) as never
}
const tool = async (project: string) =>
  JSON.stringify(
    (await answer('POST', '/mcp', new URLSearchParams(), { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'bibliography', arguments: { project } } }))?.body,
  )

describe('a project that moved', () => {
  test('a former path is followed, and the answer says so', async () => {
    ASK.options = { env, fetch: host({ [old]: { ok: true, project: false, movedTo: now, id: ID }, [now]: { ok: true, project: true, id: ID } }) }
    const said = await tool(old)
    expect(said).toContain('thesis')
    expect(said).toContain(`has moved to ${now}`)
    const page = await answer('GET', '/api/documents', new URLSearchParams({ project: old }), null)
    expect((page?.body as { documents: unknown[] }).documents.length).toBe(1)
    expect((page?.body as { note: string }).note).toContain(`has moved to ${now}`)
  })

  test('an unrelated folder at the old path is refused with the host’s sentence, and read as nothing', async () => {
    writeFileSync(join(stranger, 'x'), '')
    ASK.options = { env, fetch: host({}) }
    expect(await tool(stranger)).toContain('is not a project open in Kehikot')
    const page = await answer('GET', '/api/documents', new URLSearchParams({ project: stranger }), null)
    expect(page?.body).toMatchObject({ nowhere: true, documents: [] })
    expect(existsSync(join(stranger, '.kehikot'))).toBe(false)
  })

  test('with no host answering, it is a refusal', async () => {
    ASK.options = {
      env,
      fetch: (async () => {
        throw new Error('ECONNREFUSED')
      }) as never,
    }
    expect(await tool(now)).toContain('is not a project open in Kehikot')
    const reply = await answer('GET', '/api/citations', new URLSearchParams({ project: now, epic: 'thesis' }), null)
    expect(reply?.status).toBe(503)
  })
})
