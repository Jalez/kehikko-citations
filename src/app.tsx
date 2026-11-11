import { useEffect, useMemo, useRef, useState } from 'react'

import { footerDraws } from 'kehikot-module-protocol'
import { ask } from 'kehikot-module-protocol/client'
import {
  Cover,
  coverFor,
  useFocus,
  useHost,
  useServerStanding,
  KEEP_AFTER_MS,
  type CoverState,
  type KeptCodec,
} from 'kehikot-module-protocol/client/react'

import { ID } from '../manifest.ts'
import type { Brief, BrokenRow, CitationRow, Citations } from '../store.ts'
import { NOUN, anchorOf, inHand } from './live/focus.ts'
import { FOOT, footerItems } from './live/footer.ts'
import { reading, writing, type Kept } from './live/keep.ts'
import { DEFAULT_ORDER, ORDER_LABELS, order, type Ordering } from './live/order.ts'
import { EVERYTHING, narrowing, sift, type Sifting } from './live/sift.ts'
import { BrokenList, Row } from './view/citation-row.tsx'
import { fallbackShows, HeaderFallback, headerDrawn, rememberHeaderDrawn } from './view/header-fallback.tsx'
import { headerOf, NO_DOCUMENT } from './header.ts'
import { Toolbar } from './view/toolbar.tsx'
import { cn } from '@/lib/utils.ts'

/**
 * The whole page.
 *
 * ## Every state is a sentence
 *
 * The not-ready ones are the protocol's one cover — waiting for the greeting, nothing framing the
 * page, no project, no epic, loading, this app's own server not answering, a page older than its
 * server — and the rest are this app's own: `no such document`, `no bibliography`, `empty
 * bibliography`, and the list. They are enumerated rather than folded into "the list is empty",
 * because the folded version is the failure this workspace has spent the most time on: an app that
 * says "no entries" and quietly means "I had no project to look in" has told somebody the opposite
 * of the truth.
 *
 * In particular `no bibliography` and `empty bibliography` stay apart. The
 * first is a document with no `\addbibresource` and no `\bibliography` — every
 * draft paper here is one, and it is not a fault. The second is a document
 * that names a `.bib` holding nothing, which is a file somebody should look at.
 *
 * ## What it takes from a host
 *
 * The open project and epic, the epic's parts, the theme, and the filter it asked the host to
 * keep — all through the protocol's `useHost`. The filter is kept for this container (this module
 * on this kehikko) and read from `kept` on every render, never copied into state: the same page
 * serves every kehikko, and moving to another one brings that one's filter. It asks the host for the epic list once, on the
 * greeting, and draws one extra line with the answer. Documents are read from the project the host
 * names, so with no host there is nothing to read and the page says that nothing is framing it.
 *
 * ## What is fetched, and when
 *
 * `/api/documents` whenever the project changes, and `/api/citations` whenever
 * the epic or the project changes. Both name the project the host said is open
 * (`kehikot.context.projectPath`): documents are read from
 * a folder under `<project>/.kehikot/`, wherever it is kept (`store.ts`). No
 * polling and no cache: the `.bib` is being edited while this is running, and
 * the whole value of the page is that a reload shows the entry the author just
 * added. A cache here would show the bibliography from before lunch with every
 * symptom of a working app.
 */

/** The second line under "No project is open": what this app would read if one were. */
const NO_PROJECT = 'Citations reads a document’s .bib and the .tex beside it out of the open project.'

const NO_ROWS: CitationRow[] = []
const NO_BROKEN: BrokenRow[] = []

/** The filter and the order, as the string the host keeps. `live/keep.ts` owns the format. */
export const KEPT: KeptCodec<Kept> = { read: reading, write: writing }

type Sight =
  | { at: 'waiting' }
  | { at: 'idle' }
  | { at: 'nowhere'; why: string }
  | { at: 'missing'; epic: string }
  | { at: 'unreachable' }
  | { at: 'refused'; why: string }
  | { at: 'read'; citations: Citations }

export function App() {
  /* Counts the presses a host sent: a host that sends one draws the header, and this page need not. */
  const [pressed, setPressed] = useState(headerDrawn)
  const press = useRef<(press: { item: string; value?: string | boolean; place?: 'header' | 'footer'; text?: string }) => string | void>(() => 'Nothing is open here.')
  const [epics, setEpics] = useState<string[] | null>(null)
  const host = useHost<Kept>(
    ID,
    {
      /*
       * The epic list is enrichment, asked for on the greeting. Refused, unanswered, or asked of
       * a host that has never heard of the method, the page is unchanged but for one muted line.
       */
      onPress: (pressing) => {
        rememberHeaderDrawn()
        setPressed(true)
        return press.current(pressing)
      },
      onHello: () => {
        void host
          .request('epics.list')
          .then((answer) => {
            const list = (answer as { epics?: { slug?: unknown }[] } | null)?.epics
            if (!Array.isArray(list)) return
            setEpics(list.map((e) => String(e?.slug ?? '')).filter(Boolean))
          })
          .catch(() => {
            /* A refusal is an ordinary answer here. */
          })
      },
    },
    /* The kept view (protocol 2.70.0) keeps the filter and the order; not the document, which is a pick that holds only until the canvas moves. */
    { kept: KEPT, keepView: { except: ['document'] } },
  )
  const { where, epic, parts, kept, remember, projectPath: project, header, drawsHeader, footer, drawsFooter, footerKinds, ready } = host
  /* How this page's own server last answered: `down` when nothing did, `stale` when it is another process now. */
  const server = useServerStanding()
  const [documents, setDocuments] = useState<Brief[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [sight, setSight] = useState<Sight>({ at: 'waiting' })
  /* The filter and the order are what the host keeps for this kehikko, read on every render. */
  const sifting = kept?.sifting ?? EVERYTHING
  const ordering = kept?.ordering ?? DEFAULT_ORDER
  /*
   * Written over the newest kept value, after a short pause so typing a query sends one write.
   * Nothing is written until somebody changes something: the defaults are never written over
   * what a kehikko kept, because nothing here writes on arrival.
   */
  const keep = (change: (was: Kept) => Kept) =>
    remember(change(host.read().kept ?? { sifting: EVERYTHING, ordering: DEFAULT_ORDER }), KEEP_AFTER_MS)
  const setSifting = (next: Sifting | ((was: Sifting) => Sifting)) =>
    keep((was) => ({ ...was, sifting: typeof next === 'function' ? next(was.sifting) : next }))
  const setOrdering = (next: Ordering) => keep((was) => ({ ...was, ordering: next }))
  const [openKey, setOpenKey] = useState<string | null>(null)
  /** Bumped by Try again: both reads are asked again. */
  const [again, setAgain] = useState(0)

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
    /* No project, no documents — and nothing to ask: the cover says which of the reasons it is. */
    if (project === null) return void setDocuments([])
    let live = true
    void ask<{ nowhere?: boolean; documents?: Brief[] }>('./api/documents', { query: { project } }).then((asked) => {
      /* Not answered at all is `down`, which `useServerStanding` already knows and the cover draws. */
      if (!live || !asked.ok) return
      setDocuments(Array.isArray(asked.body?.documents) ? asked.body.documents : [])
      /* A project the server will not look in: its own sentence is in the read below. */
    })
    return () => {
      live = false
    }
  }, [project, again])

  useEffect(() => {
    setOpenKey(null)
    if (!showing || project === null) {
      /* Nothing to read: drop the last document's rows rather than leave them drawn. */
      setSight({ at: 'idle' })
      return
    }
    let live = true
    setSight({ at: 'waiting' })
    void ask<{ citations?: Citations }>('./api/citations', { query: { epic: showing, project } }).then((asked) => {
      if (!live) return
      if (asked.ok && asked.body?.citations) return setSight({ at: 'read', citations: asked.body.citations })
      if (asked.ok) return setSight({ at: 'refused', why: 'This app’s own server answered without the citations.' })
      if (asked.kind === 'down') return setSight({ at: 'unreachable' })
      /* `missing` is the server's own word for "no document for this epic", answered under 200; the 404
         is kept for a server that predates it. */
      if (asked.status === 404 || (asked.body as { missing?: unknown } | null)?.missing === true)
        return setSight({ at: 'missing', epic: showing })
      if ((asked.body as { nowhere?: unknown } | null)?.nowhere === true) return setSight({ at: 'nowhere', why: asked.error })
      setSight({ at: 'refused', why: asked.error })
    })
    return () => {
      live = false
    }
  }, [showing, project, again])

  /*
   * Every not-ready moment is the protocol's one cover, and the order is what makes it true: a
   * page that has not been greeted is `waiting`, never "no project".
   */
  const hosted = { where, projectPath: project }
  const whole: CoverState | null = coverFor(hosted)
  /* Under the head, so the picker stays where it was: a document can still be picked while one is not ready. */
  const part: CoverState | null =
    coverFor({ ...hosted, server }) ??
    (sight.at === 'unreachable'
      ? 'down'
      : sight.at === 'waiting'
        ? 'loading'
        : sight.at === 'idle'
          ? 'no-epic'
          : sight.at === 'nowhere'
            ? 'no-project'
            : null)

  /* The host's cover is held until this page is drawn (protocol 2.70.0): once the first read has come back, or
     there is nothing to read and a cover says why. */
  const drawn = whole === null ? sight.at !== 'waiting' : whole !== 'waiting'
  useEffect(() => {
    if (drawn) ready()
  }, [drawn, ready])

  const rows = sight.at === 'read' ? sight.citations.rows : NO_ROWS
  const brokenRows = sight.at === 'read' ? sight.citations.broken : NO_BROKEN
  /*
   * The parts ticked in the host's bar, which belong to the OPEN epic: a
   * document of another epic picked by hand is shown whole. Narrowed before
   * the filter, so the filter's own count and empty state are about what the
   * ticks left. The open entry is held though its files are outside — a tick
   * takes nothing out of somebody's hands. No line says any of this: see
   * `live/focus.ts`.
   */
  const focus = useFocus({ parts: showing === epic ? parts : [], epic, projectPath: project })
  const dir = sight.at === 'read' ? sight.citations.dir : null
  const inParts = useMemo(
    () => focus.narrow(rows, (row) => anchorOf(row, dir), { noun: NOUN, keep: (row) => inHand(row, openKey) }),
    [focus, rows, dir, openKey],
  )
  const broken = useMemo(
    () => focus.narrow(brokenRows, (row) => anchorOf(row, dir), { noun: NOUN, keep: (row) => inHand(row, openKey) }),
    [focus, brokenRows, dir, openKey],
  )
  const shown = useMemo(() => order(sift(inParts.shown, sifting), ordering), [inParts, sifting, ordering])

  /* ---- The header: what the host draws in the container's own row ------- */
  const items = headerOf({
    documents,
    showing,
    list: sight.at === 'read' && sight.citations.bib !== null ? { standing: sifting.standing, ordering } : null,
  })
  /* Declared again when the list is a different list, and never otherwise: the query is not in it. */
  const itemsKey = JSON.stringify(items)
  useEffect(() => {
    header(items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header, itemsKey])
  useEffect(() => () => header([]), [header])

  /* ---- The footer: what is going on now, in the container's bottom row --- */
  /*
   * Declared only to a host that draws it; to any other host nothing, and the page draws its own
   * lines as before. The search and its count move into it only where the host draws a field.
   */
  const footed = where === 'hosted' && drawsFooter === true
  const searchFooted = footed && footerDraws({ footer: drawsFooter, footerKinds }, 'input')
  const listed = sight.at === 'read' && sight.citations.bib !== null
  const footerKey = footed
    ? JSON.stringify(
        footerItems({
          document: sight.at === 'read' ? showing : null,
          bib: sight.at === 'read' ? sight.citations.bib : null,
          sift: searchFooted && listed ? { query: sifting.query, shown: shown.length, total: rows.length, narrowed: narrowing(sifting) } : null,
          broken: sight.at === 'read' ? broken.shown.length : 0,
          problems: sight.at === 'read' ? sight.citations.problems.length : 0,
          unlisted: epics && epics.length > documents.length ? epics.length - documents.length : 0,
        }),
      )
    : null
  useEffect(() => {
    if (footerKey !== null) footer(JSON.parse(footerKey))
  }, [footer, footerKey])
  /* A footer this page declared is taken away with it, and when the host stops drawing one. */
  useEffect(() => {
    if (footed) return () => footer([])
  }, [footer, footed])

  press.current = ({ item, value, place, text }) => {
    if (place === 'footer') {
      if (item === FOOT.SEARCH && text !== undefined) return void setSifting((was) => ({ ...was, query: text }))
      if (item === FOOT.EVERYTHING) return void setSifting(EVERYTHING)
      return `Nothing in this footer is called ${item}.`
    }
    if (typeof value !== 'string') return `${item} takes one of its options.`
    if (item === 'document') {
      if (value === NO_DOCUMENT) return 'No document is open; pick one of the others.'
      const at = value.startsWith('d') ? Number(value.slice(1)) : -1
      const one = documents[at]
      if (!one) return 'That document is not among the ones listed.'
      setPicked(one.epic)
      return
    }
    if (item === 'standing') {
      if (value !== 'all' && value !== 'cited' && value !== 'uncited') return 'Show is All, Cited or Uncited.'
      setSifting((was) => ({ ...was, standing: value }))
      return
    }
    if (item === 'order') {
      if (!(value in ORDER_LABELS)) return 'That is not an order.'
      setOrdering(value as Ordering)
      return
    }
    return `Nothing here is called ${item}.`
  }
  /* Drawn by the page itself where nobody frames it, or no host has pressed one of these items yet. */
  const fallback = fallbackShows(where, drawsHeader, pressed)

  if (whole) {
    return (
      <div data-kehikot-page className="flex h-full min-w-0 flex-col text-foreground">
        <Cover state={whole} name="Citations" detail={whole === 'no-project' ? NO_PROJECT : null} />
      </div>
    )
  }

  return (
    /*
     * `@container` here and container queries everywhere below.
     *
     * This element is the container every `@[…]` in the toolbar measures
     * against, and it is the container rather than the window. A viewport breakpoint
     * would decide this column's layout from the size of the host's browser
     * window, which says nothing at all about how wide this container is.
     */
    <div data-kehikot-page className="@container relative flex h-full min-w-0 flex-col text-foreground">
      {fallback && items.length ? <HeaderFallback items={items} onPress={(p) => void press.current(p)} className="absolute top-1 right-1" /> : null}
      {/* With a footer, the footer names the document and the .bib, and the epics without one. */}
      {!footed && <Head sight={sight} epics={epics} documents={documents} showing={showing} padded={fallback && items.length > 0} />}
      {listed && !searchFooted && (
        <Toolbar
          sifting={sifting}
          onSift={setSifting}
          shown={shown.length}
          total={rows.length}
        />
      )}
      <div data-kehikot-scroll className={cn('min-w-0 flex-1 overflow-y-auto', part && 'flex flex-col')}>
        {part ? (
          <Cover
            state={part}
            name="Citations"
            onRetry={() => setAgain((n) => n + 1)}
            detail={
              part === 'no-epic' && documents.length > 1
                ? 'Or pick one of the documents in the Document menu to see its citations.'
                : part === 'no-project' && sight.at === 'nowhere'
                  ? sight.why
                  : null
            }
          />
        ) : (
        <Body
          sight={sight}
          shown={shown}
          inParts={inParts.shown.length}
          none={inParts.empty}
          broken={broken.shown}
          sifting={sifting}
          onClear={() => setSifting(EVERYTHING)}
          openKey={openKey}
          onToggle={(key) => setOpenKey(openKey === key ? null : key)}
        />
        )}
      </div>
    </div>
  )
}

function Head({
  sight,
  epics,
  documents,
  showing,
  padded,
}: {
  sight: Sight
  epics: string[] | null
  documents: Brief[]
  showing: string | null
  /** The page's own "⋯" is laid over the corner: keep the title out from under it. */
  padded: boolean
}) {
  const bib = sight.at === 'read' ? sight.citations.bib : null
  return (
    <header className={cn('min-w-0 border-b border-border px-2 py-1.5', padded && 'pr-8')}>
      <h1 className="text-[0.8rem] leading-tight font-semibold break-words">
        {showing ?? 'Citations'}
        {bib && <span className="ml-1 font-mono text-[0.68rem] font-normal text-muted-foreground">{bib}</span>}
      </h1>
      {/* The documents of the project are the header's Document switch (`header.ts`): no row of pills here. */}
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
  none,
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
  /** The protocol’s one sentence for a list the picked parts emptied. See `live/focus.ts`. */
  none: string
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

  /* The not-ready sights are the shared cover, drawn by `App`; what is left is this app's own. */
  if (sight.at === 'missing') {
    return say(
      `Nothing in this project holds a document for “${sight.epic}”`,
      `That is not a failure to read one — no folder under the project’s .kehikot/ has a ${sight.epic}/ with a main.tex in it.`,
    )
  }
  if (sight.at === 'refused') return say('This document could not be read', sight.why)
  if (sight.at !== 'read') return null

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
           be said in the filter's words. One sentence, and the only thing this
           page says about the ticks. */
        <p data-testid="unfocused" className="px-1 py-4 text-[0.75rem] leading-relaxed text-muted-foreground">
          {none}
        </p>
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
