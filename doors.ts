import { establishBuild, type Reply } from 'kehikot-module-protocol/serve'

import { ID, MANIFEST, VERSION } from './manifest.ts'
import { isEpic, list, projectOf, readCitations } from './store.ts'

/**
 * Every door this app answers on that is not the page itself.
 *
 * ## Why this is a file of functions rather than a server
 *
 * The argument is the paper module's and it is not about papers. A module is
 * ONE ORIGIN or it is nothing: the protocol refuses a manifest whose `entry`
 * points anywhere but the origin that served the manifest, and it is right to.
 * So the manifest, the health check, the MCP door and this app's own `/api` are
 * middleware in front of the one server that serves the page, and this file
 * holds the deciding without holding a socket. `answer()` takes a method, a
 * path, a query and a body and returns a status and a document;
 * `vite.config.ts` adapts a node request to it in a dozen lines.
 *
 * ## There is no write path here
 *
 * Nothing in this repository has a `writeFileSync` in it. A bibliography is
 * edited in an editor, in a repository with a history — not through an HTTP
 * door on loopback that keeps its own undo table. There is therefore no ticket
 * either: a ticket protects a write, and a ticket in front of a read would be a
 * secret printed into a page for decoration.
 *
 * If a write is ever wanted here it must arrive with a ticket minted per
 * process and printed into the page, `storage: true` kept so that ticket is not
 * readable cross-origin, and a comment saying plainly that the ticket separates
 * "this app's own page" from "something else on this machine that guessed the
 * port", and separates nothing else.
 *
 * ## Reads are not gated
 *
 * `/api/citations` answers anybody who asks on loopback, because a bibliography
 * is a document its author is publishing and gating it would mean an agent's
 * `curl` needed a credential for a page it can already open in a browser. What
 * IS guarded is the shape of the epic name and the resolved path under it — see
 * the two fences in `store.ts`.
 */

const MAX_SLUG = 80
/** As long as a path may be, matching the protocol's own `LIMITS.PATH`. */
const MAX_PROJECT = 4096

function str(value: unknown, max: number): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).slice(0, max)
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

/**
 * What this process is built from, said in the manifest, the health check, the page and a header
 * on every answer — which is how the page's own `ask()` notices that the server answering it is no
 * longer the one that served it. There is no write ticket beside it: this app takes no writes.
 */
export const BUILD = establishBuild({ version: VERSION, dir: import.meta.dirname })

const ok = (body: unknown): Reply => ({ status: 200, body })
const bad = (why: string, status = 400): Reply => ({ status, body: { ok: false, error: why } })

/**
 * The sentence this app says when there is no project to look in.
 *
 * One string, used by the page and by every MCP tool, because a person reading
 * it in a terminal and a person reading it in a container are looking at the
 * same problem. It says where the documents are expected rather than that
 * something is missing: "no project" is a fact somebody can do nothing with.
 *
 * The same answer for no project and for a project path this app will not use
 * (relative, or not a folder) — see `projectOf` on why the two are not told
 * apart.
 */
export const NOWHERE =
  'No project is open, so there is nowhere to look for documents. Papers live in the project, at ' +
  '<project>/.kehikot/paper/<epic>/main.tex — the same place the paper module reads them — and this app reads ' +
  'them there and nowhere else. Open a project on this canvas, or pass `project` as the absolute path of the ' +
  'project folder. (KEHIKKO_PAPERS_DIR, KEHIKKO_ROADMAP_DIR and KEHIKKO_THESIS_DIR are no longer read.)'

/** The project a caller named, resolved, or null. */
function projectIn(value: unknown): string | null {
  return projectOf(str(value, MAX_PROJECT))
}

/** The `project` argument both tools take, described once. */
const PROJECT = {
  type: 'string',
  description:
    'Absolute path of the project folder — the same path a host puts in kehikot.context.projectPath. Papers are read ' +
    'from <project>/.kehikot/paper/<epic>/.',
} as const

/* ------------------------------------------------------------------ *
 * The MCP door
 * ------------------------------------------------------------------ */

interface ToolCall {
  (args: Record<string, unknown>): string
}

/**
 * What an agent can do to a bibliography, which is read it.
 *
 * Two tools and no third. `bibliography` is the whole list; `problems` is the
 * short answer to the only question an agent asked to check a document actually
 * has — what is wrong here. They are separate because an agent handed a
 * thirty-seven-row list to find two broken citations in has been handed a
 * needle in a haystack it has to pay for by the token, and the failure mode of
 * that is the agent summarising the haystack.
 */
const TOOLS: Record<string, { description: string; schema: object; run: ToolCall }> = {
  bibliography: {
    description:
      'Every entry in one document’s .bib, with how many times the prose cites it. A count of 0 means the ' +
      'entry is in the bibliography and no \\cite names it. Omit "epic" to list the documents in the project.',
    schema: {
      type: 'object',
      properties: { project: PROJECT, epic: { type: 'string', description: 'e.g. thesis' } },
      required: ['project'],
    },
    run(args) {
      const project = projectIn(args.project)
      if (project === null) return NOWHERE
      const epic = str(args.epic, MAX_SLUG)
      if (!epic) {
        const all = list(project)
        if (!all.length) return 'No documents in this project — nothing under .kehikot/paper/ has a main.tex.'
        return all
          .map((d) => `${d.epic}\t${d.entries === null ? 'no bibliography' : `${d.entries} entries`}\t${d.title ?? ''}`)
          .join('\n')
      }
      if (!isEpic(epic)) return 'that is not an epic name'
      const found = readCitations(epic, project)
      if (!found) return `no document for "${epic}" in this project`
      if (found.bib === null) return `"${epic}" names no bibliography (no \\addbibresource or \\bibliography).`
      const lines = found.rows.map(
        (r) =>
          `${r.times === 0 ? 'UNCITED' : `x${r.times}`}\t${r.key}\t${r.year ?? '----'}\t${r.author ?? '(no author)'}\t${
            r.title ?? '(no title)'
          }`,
      )
      return [`${found.bib} — ${found.rows.length} entries, ${found.rows.filter((r) => r.times === 0).length} uncited`, ...lines].join(
        '\n',
      )
    },
  },

  problems: {
    description:
      'What is wrong with one document’s citations: every \\cite naming a key the .bib does not hold (these ' +
      'compile to a "?" in the PDF), every entry nothing cites, and anything in the .bib that could not be ' +
      'parsed. Read this before claiming a document’s references are in order.',
    schema: {
      type: 'object',
      properties: { project: PROJECT, epic: { type: 'string' } },
      required: ['project', 'epic'],
    },
    run(args) {
      const project = projectIn(args.project)
      if (project === null) return NOWHERE
      const epic = str(args.epic, MAX_SLUG)
      if (!isEpic(epic)) return 'that is not an epic name'
      const found = readCitations(epic, project)
      if (!found) return `no document for "${epic}" in this project`
      const lines: string[] = []
      for (const b of found.broken) {
        lines.push(
          `BROKEN CITE\t${b.key}\tnamed ${b.times}x, first at ${b.where[0]?.file}:${b.where[0]?.line} — the .bib has no such entry`,
        )
      }
      for (const p of found.problems) lines.push(`UNPARSED\t${found.bib}:${p.line}\t${p.why}`)
      const uncited = found.rows.filter((r) => r.times === 0)
      for (const u of uncited) lines.push(`UNCITED\t${u.key}\tin ${found.bib}:${u.line}, no \\cite names it`)
      if (found.citesEverything) {
        lines.push(
          'NOTE\tthis document contains \\nocite{*}, so every entry is printed whether or not the prose names it. ' +
            'The UNCITED lines above are still true of the prose.',
        )
      }
      /* An explicit sentence rather than an empty string. "Nothing is wrong" and
         "this tool returned nothing" look identical to an agent, and one of them
         is a claim worth making. */
      if (!lines.length) return `Nothing wrong: ${found.rows.length} entries, every one cited, no cite names a missing key.`
      return lines.join('\n')
    },
  },
}

interface Rpc {
  jsonrpc?: string
  id?: unknown
  method: string
  params?: Record<string, unknown>
}

function mcp(request: Rpc): Reply {
  const { id, method } = request
  /* A notification has no id and gets no answer, which is what the spec says
     and what a client that sent one is waiting for — which is nothing. */
  if (id === undefined || id === null) return { status: 202, body: null }

  const result = (value: unknown): Reply => ({ status: 200, body: { jsonrpc: '2.0', id, result: value } })

  if (method === 'initialize') {
    return result({
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: ID, version: VERSION },
    })
  }

  if (method === 'tools/list') {
    return result({
      tools: Object.entries(TOOLS).map(([name, tool]) => ({
        name,
        description: tool.description,
        inputSchema: tool.schema,
      })),
    })
  }

  if (method === 'tools/call') {
    const name = str(request.params?.name, 64)
    const tool = TOOLS[name]
    if (!tool) {
      return { status: 200, body: { jsonrpc: '2.0', id, error: { code: -32602, message: `no tool "${name}"` } } }
    }
    const args = (request.params?.arguments as Record<string, unknown> | undefined) ?? {}
    return result({ content: [{ type: 'text', text: tool.run(args) }] })
  }

  return { status: 200, body: { jsonrpc: '2.0', id, error: { code: -32601, message: `no method "${method}"` } } }
}

/**
 * Every door but the page, as one function.
 *
 * `null` means "this path is not ours", and the caller passes it on to Vite —
 * which is how the page, the client module and Vite's own hot-reload socket
 * keep working without being enumerated here.
 */
export function answer(
  method: string,
  path: string,
  query: URLSearchParams,
  body: Record<string, unknown> | null,
): Reply | null {
  if (path === '/healthz') return ok({ ok: true, id: ID, version: VERSION })

  if (path === '/mcp') {
    if (method !== 'POST') return bad('the MCP door takes POST', 405)
    if (!body || typeof body.method !== 'string') {
      return { status: 400, body: { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'not a request' } } }
    }
    return mcp(body as unknown as Rpc)
  }

  if (path === '/api/documents' && method === 'GET') {
    const project = projectIn(query.get('project'))
    /*
     * `nowhere` and `documents` are separate fields rather than one empty
     * list, because "there are no documents in this project" and "there is no
     * project to look in" are two different sentences and the page shows
     * different screens for them. An app that says "none" and quietly means "I
     * had nowhere to look" has told somebody the opposite of the truth.
     */
    return ok({
      ok: true,
      nowhere: project === null,
      documents: list(project),
    })
  }

  if (path === '/api/citations' && method === 'GET') {
    const epic = str(query.get('epic'), MAX_SLUG)
    /* Refused the same way whether or not the document exists. A refusal that
       distinguished "no such document" from "not an epic name" would be a way
       to enumerate what is on this disk. */
    if (!isEpic(epic)) return bad('that is not an epic name')
    const project = projectIn(query.get('project'))
    if (project === null) return { status: 503, body: { ok: false, error: NOWHERE, nowhere: true } }
    const found = readCitations(epic, project)
    if (!found) return bad(`no document for "${epic}" in this project`, 404)
    return ok({ ok: true, citations: found })
  }

  /* An unknown path under `/api/` is ours to refuse rather than Vite's to try
     and serve as a source file. Anything else is not ours at all. */
  if (path.startsWith('/api/')) return bad('not here', 404)
  return null
}

export { MANIFEST }
