import type { CitationRow } from '../../store.ts'

/**
 * Narrowing the list, which is the only place this app is allowed to hide a
 * row — and only because somebody asked it to, in the current second, with the
 * count of what is hidden on screen.
 *
 * That is the whole rule this file exists to keep, and it is References'. The
 * store never drops anything; a filter drops things by definition, so every
 * part of the design here is about making the dropping visible: the count of
 * what matched out of what exists is always drawn, a narrowed list that matches
 * nothing says so in its own words rather than in the words used for a document
 * with no bibliography, and one press puts everything back.
 *
 * ## The one filter that is not a filter
 *
 * `broken` is not a value of `Standing`, and that is deliberate. A broken
 * citation is not a row in the bibliography — it is a key in the PROSE with no
 * row behind it, which is a different list of a different kind of thing. It is
 * drawn above the list rather than inside it, and a filter that pretended the
 * two lists were one would mean pressing "uncited" hid the broken citations,
 * which are the most urgent thing on the page.
 */

export type Standing = 'all' | 'cited' | 'uncited'

export interface Sifting {
  query: string
  standing: Standing
}

export const EVERYTHING: Sifting = { query: '', standing: 'all' }

/** Whether anything is being hidden by choice. Drives the "clear" affordance and the count. */
export function narrowing(sifting: Sifting): boolean {
  return sifting.query.trim() !== '' || sifting.standing !== 'all'
}

/**
 * Every word has to match something; the words do not have to match the same
 * thing.
 *
 * `graesser tutor` finds the entry Graesser wrote about tutoring — one word
 * from the author, one from the title — which is how somebody looking for a
 * reference they half remember actually types. An implementation that required
 * the whole phrase in one field would find nothing and give no reason for it.
 *
 * The haystack is the key, the title, the author, the venue and the year. The
 * key matters most and is cheapest: typing `graesser2004` finds it whether or
 * not the author field parsed.
 */
function matches(row: CitationRow, terms: string[]): boolean {
  if (!terms.length) return true
  const hay = [row.key, row.title ?? '', row.author ?? '', row.venue ?? '', row.year ?? '', row.type]
    .join(' ')
    .toLowerCase()
  return terms.every((term) => hay.includes(term))
}

/**
 * The rows to draw, in the order they were given.
 *
 * Order is never changed here. A filter that also reordered would mean pressing
 * "uncited" moves every remaining row, and the reader loses the place they had
 * just found. Reordering is `order.ts`, and it happens when somebody asks.
 */
export function sift(rows: readonly CitationRow[], sifting: Sifting): CitationRow[] {
  const terms = sifting.query.toLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter((row) => {
    if (sifting.standing === 'cited' && row.times === 0) return false
    if (sifting.standing === 'uncited' && row.times > 0) return false
    return matches(row, terms)
  })
}
