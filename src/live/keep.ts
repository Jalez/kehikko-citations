import { DEFAULT_ORDER, ORDER_LABELS, type Ordering } from './order.ts'
import { EVERYTHING, type Sifting, type Standing } from './sift.ts'

/**
 * What this page asks the host to remember for it, and how it reads it back.
 *
 * ## Why the host holds it and this app does not
 *
 * A module framed without `allow-same-origin` runs on an opaque origin, where
 * `localStorage` does not return nothing — it THROWS. That is worth saying
 * twice, because the failure is not a forgotten filter: it is an exception on
 * the first render inside a frame, and a page that works perfectly when opened
 * directly and is blank in the host. This module declares `storage: true` and
 * so does have an origin of its own — but the argument is not about what this
 * module could get away with. A setting kept in browser storage is kept
 * per-browser, per-profile, and is invisible to the host that is showing this
 * pane; `state.set` is the protocol's answer and is the one that keeps working
 * whatever the framing turns out to be.
 *
 * The host keeps one string for one module and hands the same string back in
 * the greeting, having never looked inside it. That it never looks inside is
 * the part this file has to honour. The string is JSON because JSON is what a
 * program reads, not because the host knows it is JSON — nothing on the other
 * side parses this, validates it, or would notice if it changed shape tomorrow.
 * Which means every guarantee about what comes back has to be made here.
 *
 * ## So it is read the way a wire message is read
 *
 * The value in the greeting is a string this app wrote, on an older version of
 * itself, possibly months ago, possibly on a different machine. It is exactly
 * as trustworthy as anything else arriving over the wire, and `reading()`
 * treats it that way: it never throws, it checks every field against the values
 * that exist today, and anything it cannot vouch for becomes the default rather
 * than a broken control. A remembered filter that half-applies is worse than
 * one that was forgotten, because the second is a fresh start and the first is
 * a page in a state no code path meant to produce.
 *
 * `v` is a version and it is checked. When the shape changes the number goes
 * up, and every string written before that is dropped whole rather than being
 * half-read into the new shape.
 *
 * ## What is kept, including the query, which is arguable
 *
 * The standing filter, the order, and the text query. The first two are
 * uncontroversial: they are settings, and a setting that forgets itself on
 * every reload is a setting people stop using.
 *
 * The query is arguable, because it is the strongest filter here and the state
 * is kept per MODULE rather than per document: a phrase typed while reading one
 * document comes back over another, where it may match nothing, and the reader
 * sees a bibliography that looks empty. It is kept anyway, for References'
 * reason — this page already carries the two things that make that survivable
 * and carries them for exactly this failure: the count that always names both
 * numbers, and the sentence that says the filter is hiding all of them and
 * offers to clear it.
 *
 * Nothing about which row is EXPANDED is kept. That is where the reader's eye
 * is in this second, it is not a setting, and a page that reopened somebody's
 * last-expanded row a week later would be re-answering a question nobody asked.
 */

/** The shape written today. Bumped when the fields change, never reused. */
const VERSION = 1

export interface Kept {
  sifting: Sifting
  ordering: Ordering
}

const STANDINGS: Standing[] = ['all', 'cited', 'uncited']

/**
 * The string to hand the host.
 *
 * Short field names because the protocol bounds this at four kilobytes and,
 * more to the point, because a person reading a host's database should see at a
 * glance that this is a filter and not a document. The query is clipped rather
 * than refused: a query is not an identifier, a clipped one is still a query,
 * and nobody types four thousand characters into a filter by accident — but a
 * page that could be made unable to save its settings by a paste is a page with
 * a strange bug in it.
 */
export function writing(kept: Kept): string {
  return JSON.stringify({
    v: VERSION,
    q: kept.sifting.query.slice(0, 500),
    s: kept.sifting.standing,
    o: kept.ordering,
  })
}

/**
 * What the host handed back, as far as it can be believed.
 *
 * Null for anything this app cannot use — no string, not JSON, a version it
 * does not write any more, a field naming a filter that no longer exists. The
 * caller draws its defaults, which is the same thing it does on a first run and
 * is a state the page is already correct in.
 */
export function reading(state: string | null | undefined): Kept | null {
  if (typeof state !== 'string' || state === '') return null
  let raw: unknown
  try {
    raw = JSON.parse(state)
  } catch {
    /* Not a surprise and not an error worth reporting. A host may hand back
       something written by a version of this app that predates JSON here, or by
       a hand-edited database. Either way the answer is the same. */
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const held = raw as Record<string, unknown>
  if (held.v !== VERSION) return null

  const standing = STANDINGS.find((value) => value === held.s) ?? EVERYTHING.standing
  const ordering = (Object.keys(ORDER_LABELS) as Ordering[]).find((value) => value === held.o) ?? DEFAULT_ORDER
  return {
    sifting: {
      query: typeof held.q === 'string' ? held.q.slice(0, 500) : '',
      standing,
    },
    ordering,
  }
}
