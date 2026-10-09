import { useEffect, useMemo, useState } from 'react'

import { FOCUS_WHERE } from 'kehikot-module-protocol'
import { useFocus } from 'kehikot-module-protocol/client/react'

import type { Brief, BrokenRow, CitationRow, Citations } from '../store.ts'
import { anchorOf, focusNote } from './live/focus.ts'
import { reading, writing } from './live/keep.ts'
import { DEFAULT_ORDER, order, type Ordering } from './live/order.ts'
import { EVERYTHING, narrowing, sift, type Sifting } from './live/sift.ts'
import { BrokenList, Row } from './view/citation-row.tsx'
import { Toolbar } from './view/toolbar.tsx'
import { useKehikot } from './wire/use-kehikot.ts'
import { cn } from '@/lib/utils.ts'

/**
 * The whole page.
 *
 * ## Every state is a sentence, and there are six of them
 *
 * `waiting`, `nowhere`, `no such document`, `no bibliography`, `empty
 * bibliography`, and the list. They are enumerated rather than folded into "the
 * list is empty", because the folded version is the failure this workspace has
 * spent the most time on: an app that says "no entries" and quietly means "I
 * had no project to look in" has told somebody the opposite of the truth.
 *
 * In particular `no bibliography` and `empty bibliography` stay apart. The
 * first is a document with no `\addbibresource` and no `\bibliography` — every
 * roadmap paper here is one, and it is not a fault. The second is a document
 * that names a `.bib` holding nothing, which is a file somebody should look at.
 *
 * ## What is fetched, and when
 *
 * `/api/documents` whenever the project changes, and `/api/citations` whenever
 * the epic or the project changes. Both name the project the host said is open
 * (`kehikot.context.projectPath`): documents are read from
 * `<project>/.kehikot/paper/`, exactly where the paper module reads them. No
 * polling and no cache: the `.bib` is being edited while this is running, and
 * the whole value of the page is that a reload shows the entry the author just
 * added. A cache here would show the bibliography from before lunch with every
 * symptom of a working app.
 */

const NO_ROWS: CitationRow[] = []
const NO_BROKEN: BrokenRow[] = []

type Sight =
  | { at: 'waiting' }
  | { at: 'idle' }
  | { at: 'nowhere'; why: string }
  | { at: 'missing'; epic: string }
  | { at: 'unreachable'; why: string }
  | { at: 'read'; citations: Citations }

export function App() {
  const { epic, parts, project, kept, framed, epics, keep } = useKehikot()
  const [documents, setDocuments] = useState<Brief[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [sight, setSight] = useState<Sight>({ at: 'waiting' })
  const [sifting, setSifting] = useState<Sifting>(EVERYTHING)
  const [ordering, setOrdering] = useState<Ordering>(DEFAULT_ORDER)
  const [openKey, setOpenKey] = useState<string | null>(null)
  /*
   * Whether the kept string has been applied yet.
   *
   * Without this the page writes its own defaults back to the host on the first
   * render — before the greeting has arrived with what was saved — and a
   * setting is lost every single time the container loads. `kept` being `undefined`
   * rather than `null` is what makes the distinction possible; see `Kehikot`.
   */
  const [restored, setRestored] = useState(false)

  /*
   * A pick holds only until the canvas moves: another epic, or another project.
   * Cleared while rendering rather than in an effect, so the render that sees
   * the new epic never fetches the old pick under the new project.
   */
  const [moved, setMoved] = useState({ epic, project })
  if (moved.epic !== epic || moved.project !== project) {
    setMoved({ epic, project })
    setPicked(null)
  }

  /** Which document is on screen: what the host says, unless somebody picked. */
  const showing = picked ?? epic

  useEffect(() => {
    if (kept === undefined) return
    const held = reading(kept)
    if (held) {
      setSifting(held.sifting)
      setOrdering(held.ordering)
    }
    setRestored(true)
  }, [kept])

  /* Written back only after the restore, and only when framed — an unframed
     page has nobody to ask, and calling anyway would be a request into a window
     that is not there. */
  useEffect(() => {
    if (!restored || !framed) return
    keep(writing({ sifting, ordering }))
  }, [restored, framed, sifting, ordering, keep])

  /** `&project=…`, or nothing — the server then answers that there is nowhere to look. */
  const scoped = project === null ? '' : `project=${encodeURIComponent(project)}`

  useEffect(() => {
    let live = true
    fetch(`./api/documents?${scoped}`)
      .then((r) => r.json())
      .then((body: { nowhere?: boolean; documents?: Brief[] }) => {
        if (!live) return
        setDocuments(Array.isArray(body.documents) ? body.documents : [])
        if (body.nowhere === true) {
          setSight({
            at: 'nowhere',
            why:
              'This app reads a .bib and the .tex beside it out of the open project, at ' +
              '.kehikot/paper/<epic>/ — the same place the paper module reads a paper — and no project is open ' +
              'on this canvas.',
          })
        }
      })
      .catch((e: unknown) => {
        if (!live) return
        setSight({ at: 'unreachable', why: String(e) })
      })
    return () => {
      live = false
    }
  }, [scoped])

  useEffect(() => {
    setOpenKey(null)
    if (!showing) {
      /* Nothing to read: drop the last document's rows rather than leave them drawn. */
      setSight({ at: 'idle' })
      return
    }
    let live = true
    setSight({ at: 'waiting' })
    fetch(`./api/citations?epic=${encodeURIComponent(showing)}&${scoped}`)
      .then(async (r) => ({ status: r.status, body: (await r.json()) as { citations?: Citations; error?: string } }))
      .then(({ status, body }) => {
        if (!live) return
        if (status === 200 && body.citations) setSight({ at: 'read', citations: body.citations })
        else if (status === 404) setSight({ at: 'missing', epic: showing })
        else setSight({ at: 'nowhere', why: body.error ?? 'there is no project open to look in' })
      })
      .catch((e: unknown) => {
        if (!live) return
        setSight({ at: 'unreachable', why: String(e) })
      })
    return () => {
      live = false
    }
  }, [showing, scoped])

  const rows = sight.at === 'read' ? sight.citations.rows : NO_ROWS
  const brokenRows = sight.at === 'read' ? sight.citations.broken : NO_BROKEN
  /*
   * The parts ticked in the host's bar, which belong to the OPEN epic: a
   * document of another epic picked by hand is shown whole. Narrowed before
   * the filter, so the filter's own count and empty state are about what the
   * ticks left. The open entry is held though its files are outside — a tick
   * takes nothing out of somebody's hands. See `live/focus.ts`.
   */
  const focus = useFocus({ parts: showing === epic ? parts : [], epic })
  const inParts = useMemo(
    () => focus.narrow(rows, anchorOf, { noun: ['entry', 'entries'], keep: (row) => row.key === openKey }),
    [focus, rows, openKey],
  )
  const broken = useMemo(
    () => focus.narrow(brokenRows, anchorOf, { noun: ['broken citation', 'broken citations'] }),
    [focus, brokenRows],
  )
  const note = focusNote(inParts, broken, brokenRows.length > 0)
  const shown = useMemo(() => order(sift(inParts.shown, sifting), ordering), [inParts, sifting, ordering])

  return (
    /*
     * `@container` here and container queries everywhere below.
     *
     * This element is the container every `@[…]` in the toolbar measures
     * against, and it is the container rather than the window. A viewport breakpoint
     * would decide this column's layout from the size of the host's browser
     * window, which says nothing at all about how wide this container is.
     */
    <div className="@container flex h-full min-w-0 flex-col bg-background text-foreground">
      <Head sight={sight} documents={documents} showing={showing} onPick={setPicked} epics={epics} />
      {sight.at === 'read' && sight.citations.bib !== null && (
        <Toolbar
          sifting={sifting}
          ordering={ordering}
          onSift={setSifting}
          onOrder={setOrdering}
          shown={shown.length}
          total={rows.length}
        />
      )}
      {note && sight.at === 'read' && sight.citations.rows.length > 0 && (
        <p
          data-testid="focus"
          title={FOCUS_WHERE}
          className="border-b border-border px-2 py-1 text-[0.68rem] leading-snug break-words text-muted-foreground"
        >
          {note}
        </p>
      )}
      <div className="min-w-0 flex-1 overflow-y-auto">
        <Body
          sight={sight}
          shown={shown}
          inParts={inParts.shown.length}
          broken={broken.shown}
          sifting={sifting}
          onClear={() => setSifting(EVERYTHING)}
          openKey={openKey}
          onToggle={(key) => setOpenKey(openKey === key ? null : key)}
        />
      </div>
    </div>
  )
}

function Head({
  sight,
  documents,
  showing,
  onPick,
  epics,
}: {
  sight: Sight
  documents: Brief[]
  showing: string | null
  onPick: (epic: string) => void
  epics: string[] | null
}) {
  const bib = sight.at === 'read' ? sight.citations.bib : null
  return (
    <header className="min-w-0 border-b border-border px-2 py-2">
      <h1 className="text-[0.8rem] leading-tight font-semibold break-words">
        {showing ?? 'Citations'}
        {bib && <span className="ml-1 font-mono text-[0.68rem] font-normal text-muted-foreground">{bib}</span>}
      </h1>
      {/*
        * The picker, which is what stands where a canvas would be.
        *
        * Drawn whenever there is more than one document or nothing has said
        * which — never hidden because a host happens to be framing this, since
        * a reader looking at a bibliography beside one paper may perfectly well
        * want another. `documents` is the open project's own folder and needs nobody.
        */}
      {documents.length > 1 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {documents.map((d) => (
            <button
              key={d.epic}
              type="button"
              onClick={() => onPick(d.epic)}
              title={d.title ?? d.epic}
              aria-pressed={showing === d.epic}
              className={cn(
                'max-w-full rounded-md border px-1.5 py-0.5 text-[0.66rem] break-all',
                showing === d.epic
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input text-muted-foreground hover:bg-accent',
              )}
            >
              {d.epic}
              <span className="ml-1 opacity-70">{d.entries === null ? '·' : d.entries}</span>
            </button>
          ))}
        </div>
      )}
      {/* Enrichment, drawn as enrichment: one muted line when a host answered,
          and nothing at all when it did not. */}
      {epics && epics.length > documents.length && (
        <p className="mt-1 text-[0.66rem] text-muted-foreground">
          {epics.length - documents.length} epic(s) on this canvas have no document on this machine.
        </p>
      )}
    </header>
  )
}

function Body({
  sight,
  shown,
  inParts,
  broken,
  sifting,
  onClear,
  openKey,
  onToggle,
}: {
  sight: Sight
  shown: ReturnType<typeof order>
  /** How many entries the ticked parts left, before the filter. Every entry when nothing is ticked. */
  inParts: number
  /** The citations naming nothing, narrowed likewise. */
  broken: BrokenRow[]
  sifting: Sifting
  onClear: () => void
  openKey: string | null
  onToggle: (key: string) => void
}) {
  const say = (title: string, ...lines: string[]) => (
    <div className="px-2 py-4 text-[0.75rem] leading-relaxed">
      <p className="font-medium break-words">{title}</p>
      {lines.filter(Boolean).map((line) => (
        <p key={line} className="mt-1 break-words text-muted-foreground">
          {line}
        </p>
      ))}
    </div>
  )

  switch (sight.at) {
    case 'waiting':
      return say('Reading…')
    case 'idle':
      return say('No epic is open', 'Open an epic on this canvas, or pick one of the documents above, to see its citations.')
    case 'nowhere':
      return say(
        'No project is open, so there are no documents to read',
        sight.why,
        'Open a project on this canvas and this page fills in from its .kehikot/paper/ folder.',
      )
    case 'unreachable':
      return say('This page could not reach its own server', sight.why)
    case 'missing':
      return say(
        `Nothing in this project holds a document for “${sight.epic}”`,
        `That is not a failure to read one — there is no .kehikot/paper/${sight.epic}/ in the project, or it has no main.tex in it.`,
      )
    case 'read':
      break
  }

  const { citations } = sight
  if (citations.bib === null) {
    return say(
      'This document names no bibliography',
      'It has no \\addbibresource and no \\bibliography, so there is nothing for this page to cross-reference ' +
        'its citations against. That is an ordinary state for a document that does not cite anything.',
    )
  }
  if (citations.rows.length === 0) {
    return (
      <div>
        <div className="px-2 py-4 text-[0.75rem] leading-relaxed">
          <p className="font-medium break-words">
            {citations.bib} is named by this document and holds no entries this app could read
          </p>
          <p className="mt-1 break-words text-muted-foreground">
            Either the file is empty, or it is not where the document says it is. The two are different and this
            page cannot tell them apart from here; the problems below say which, when there are any.
          </p>
        </div>
        <Problems citations={citations} />
      </div>
    )
  }

  return (
    <div className="px-1 py-1">
      <Problems citations={citations} />
      <BrokenList broken={broken} />
      {citations.citesEverything && (
        <p className="mb-2 rounded-md border border-border px-2 py-1.5 text-[0.68rem] leading-snug text-muted-foreground">
          {/* Reported, not obeyed. The essay is on `crossReference` in
              `bib/cite.ts`: marking every entry cited would mean this page
              reporting thirty-seven citations where the prose contains none. */}
          This document contains <code className="font-mono">\nocite{'{*}'}</code>, so every entry is printed
          whether or not the prose names it. The counts below are still what the prose says.
        </p>
      )}
      {inParts === 0 ? (
        /* The ticks left nothing, which is not the filter's doing and must not
           be said in the filter's words. The count is in the line above. */
        <div data-testid="unfocused" className="px-1 py-4 text-[0.75rem] leading-relaxed">
          <p className="font-medium">No entry here is cited in the picked parts</p>
          <p className="mt-1 text-muted-foreground">{FOCUS_WHERE}</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="px-1 py-4 text-[0.75rem] leading-relaxed">
          <p className="font-medium">The filter is hiding every entry</p>
          <p className="mt-1 text-muted-foreground">
            {inParts} entries are here and none of them match{' '}
            {sifting.query.trim() ? `“${sifting.query.trim()}”` : 'that filter'}.
          </p>
          {narrowing(sifting) && (
            <button
              type="button"
              onClick={onClear}
              className="mt-2 underline underline-offset-2 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"
            >
              show everything
            </button>
          )}
        </div>
      ) : (
        <ul className="min-w-0">
          {shown.map((row) => (
            <Row key={row.key} row={row} open={openKey === row.key} onToggle={() => onToggle(row.key)} />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * What could not be read, said out loud.
 *
 * A `.bib` with an unbalanced brace is a file that will also fail to compile,
 * and a page that silently showed thirty-six of thirty-seven entries would be
 * hiding the one thing the author most needs to know about their bibliography.
 */
function Problems({ citations }: { citations: Citations }) {
  if (!citations.problems.length) return null
  return (
    <section className="mb-2 rounded-md border border-destructive/50 bg-destructive/5 px-2 py-1.5">
      <p className="text-[0.72rem] font-medium text-destructive">
        {citations.problems.length} thing(s) in {citations.bib} could not be read
      </p>
      <ul className="mt-1 space-y-0.5">
        {citations.problems.map((p) => (
          <li key={`${p.line}:${p.why}`} className="text-[0.68rem] leading-snug break-words text-muted-foreground">
            {p.line > 0 && <span className="font-mono">line {p.line}: </span>}
            {p.why}
          </li>
        ))}
      </ul>
    </section>
  )
}
