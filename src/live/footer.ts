import { LIMITS, type FooterItemInput } from 'kehikot-module-protocol'

/**
 * What this page declares for the container's footer (`kehikot.footer`, protocol 2.38.0).
 *
 * The rule the two rows follow: the header is how the list is set up — which document, which
 * entries, in which order — and the footer is what is going on now. So the footer is the lines the
 * page used to draw above the list: which document and which .bib are on screen, how many entries
 * the filter left of how many there are, and how many citations name nothing or could not be read.
 * Folded to two rows, a container shows its header and this footer, so this is what a person
 * reads there.
 *
 * ## The search comes with the count
 *
 * `sift.ts` lets a filter hide a row only with the count of what it hid beside it. The header
 * carries no free text, so the search was the one thing left on the page; a host that draws a
 * footer field (2.46.0) takes it, and the count, and "Show everything" beside them, into this row.
 * A host that draws a footer but no field gets neither: the page keeps its search line with the
 * count on it, and the footer says the rest.
 *
 * Declared only when the host says it draws a footer (`drawsFooter === true`); with any other host
 * the page draws its own lines exactly as before. Pure, so what is declared is what is tested.
 */

export interface FooterState {
  /** The document on screen, and the .bib it names, or null. */
  document: string | null
  bib: string | null
  /** The filter and its count, when the host draws the field and a bibliography is on screen; null otherwise. */
  sift: { query: string; shown: number; total: number; narrowed: boolean } | null
  /** Citations in the prose that name nothing in the .bib. */
  broken: number
  /** Things in the .bib that could not be read. */
  problems: number
  /** Epics on the canvas with no document on this machine, when a host said. */
  unlisted: number
}

/** The ids of what can be pressed in the footer. */
export const FOOT = {
  SEARCH: 'search',
  EVERYTHING: 'everything',
} as const

/** One line cut to fit with an ellipsis. */
export function clip(text: string, most: number): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length <= most ? one : `${one.slice(0, most - 1)}…`
}
const text = (words: string) => clip(words, LIMITS.FOOTER_TEXT)
const tip = (words: string) => clip(words, LIMITS.FOOTER_TOOLTIP)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The footer's items for a state; `[]` when there is nothing on screen to say anything about. */
export function footerItems(state: FooterState): FooterItemInput[] {
  const items: FooterItemInput[] = []
  if (state.document) {
    const said = state.bib ? `${state.document} · ${state.bib}` : state.document
    items.push({ kind: 'text', id: 'document', text: text(said), tooltip: tip(state.bib ? `${state.document}, citing from ${state.bib}` : `${state.document}, which names no bibliography`) })
  }
  if (state.sift) {
    const { query, shown, total, narrowed } = state.sift
    items.push({
      kind: 'input',
      id: FOOT.SEARCH,
      label: 'Filter the bibliography',
      value: query.slice(0, LIMITS.FOOTER_INPUT),
      placeholder: 'author, title, key, year',
      grow: true,
    })
    /* Both numbers, always: "12" beside a filter cannot be told from "there are twelve". */
    items.push({ kind: 'text', id: 'count', text: `${shown} of ${total}`, tooltip: `${shown} of the ${plural(total, 'entry', 'entries')} shown` })
    if (narrowed) items.push({ kind: 'run', id: FOOT.EVERYTHING, label: 'Show everything', icon: 'x', tooltip: 'Clear the filter and show every entry' })
  }
  if (state.broken) {
    const said = `${plural(state.broken, 'citation')} name${state.broken === 1 ? 's' : ''} nothing`
    items.push({ kind: 'text', id: 'broken', text: said, level: 'critical', align: 'end', tooltip: tip(`${said} in the .bib: listed above the entries.`) })
  }
  if (state.problems) {
    const said = `${plural(state.problems, 'thing')} unreadable`
    items.push({ kind: 'text', id: 'problems', text: said, level: 'warn', align: 'end', tooltip: tip(`${plural(state.problems, 'thing')} in ${state.bib ?? 'the .bib'} could not be read: listed above the entries.`) })
  }
  if (state.unlisted) {
    items.push({
      kind: 'text',
      id: 'unlisted',
      text: `${plural(state.unlisted, 'epic')} without a document`,
      align: 'end',
      optional: true,
      tooltip: tip(`${plural(state.unlisted, 'epic')} on this canvas ${state.unlisted === 1 ? 'has' : 'have'} no document on this machine.`),
    })
  }
  return items
}
