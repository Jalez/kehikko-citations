import { firstSurname } from '../../bib/parse.ts'
import type { CitationRow } from '../../store.ts'

/**
 * Putting the rows in an order somebody asked for.
 *
 * ## Separate from the filter, on purpose
 *
 * `sift.ts` says in as many words that it never reorders, and the reason is
 * good: a filter that also moved things means pressing `Uncited` shifts every
 * remaining row and the reader loses the place they had just found. This file
 * is the other half of that sentence rather than a contradiction of it.
 *
 * Nothing here removes a row. That has to be said out loud in a file that
 * touches the list, because an ordering is the kind of code that grows a
 * `filter` by accident: a comparator that cannot place a value invites somebody
 * to drop it instead. Every order below is total, every row has a place in
 * every one of them, and the rows with nothing to sort by have a place that is
 * defined rather than incidental.
 *
 * ## Only orders the file can honestly produce
 *
 * A row carries a key, a type, an author, a year, a title, a venue, a line in
 * the `.bib` and a count of how often the prose names it — each of them either
 * read out of a file or an honest blank. So those are the only things an order
 * may be built from. "By importance" and "by relevance" are the tempting ones
 * and they are not here, because nothing in the reading says either, and an
 * order that quietly stood something else in for them would be this page
 * inventing a ranking and presenting it as the bibliography's.
 *
 * Five orders, and what each is for:
 *
 * - `file` — the order the `.bib` writes them in. The default, and the one that
 *   matches what the author sees in their editor: press this and the third row
 *   here is the third entry there.
 * - `author` — by first author's surname, then year. The order a printed
 *   bibliography is in, which is the order somebody has in their head when they
 *   are looking for a name.
 * - `year` — newest first. Answers "how current is this reading".
 * - `cited` — most-cited first, so the spine of the argument is at the top and,
 *   read from the bottom, every entry nothing names is together.
 * - `key` — alphabetical by citation key. The order for somebody holding a
 *   `\cite{…}` in the other hand.
 *
 * ## Where a missing value goes, and why it is not the extreme
 *
 * **A row with no year sorts last in `year`**, rather than sorting as year zero
 * and becoming the oldest reading in the bibliography. An entry whose year is
 * missing is not old; it is unknown, and putting it where the oldest work goes
 * would be answering a question the file did not answer. The same applies to a
 * missing author in `author`. Both are stable ties broken by key, so the order
 * is total and two reads of the same file agree.
 */

export type Ordering = 'file' | 'author' | 'year' | 'cited' | 'key'

export const DEFAULT_ORDER: Ordering = 'file'

export const ORDER_LABELS: Record<Ordering, string> = {
  file: 'In the .bib',
  author: 'Author',
  year: 'Newest',
  cited: 'Most cited',
  key: 'Key',
}

/** Every order, described in the words the toolbar puts in a title attribute. */
export const ORDER_MEANING: Record<Ordering, string> = {
  file: 'The order the .bib file writes them in.',
  author: 'By first author’s surname, then year. Entries with no author last.',
  year: 'Newest first. Entries with no year last.',
  cited: 'Most cited first, so everything nothing names is together at the bottom.',
  key: 'Alphabetical by citation key.',
}

/** A total comparison, ties broken by key so two reads of one file agree. */
function by(rows: readonly CitationRow[], score: (row: CitationRow) => [number, string]): CitationRow[] {
  return [...rows].sort((a, b) => {
    const [an, as] = score(a)
    const [bn, bs] = score(b)
    if (an !== bn) return an - bn
    if (as !== bs) return as < bs ? -1 : 1
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  })
}

export function order(rows: readonly CitationRow[], ordering: Ordering): CitationRow[] {
  switch (ordering) {
    case 'file':
      /* A copy rather than the array itself, so a caller cannot sort the store's
         own rows in place through a return value it thinks is a new list. */
      return [...rows]
    case 'author':
      return by(rows, (r) => {
        const surname = firstSurname(r.author).toLowerCase()
        /* 1 rather than a large year: the group with no author goes after the
           group with one, and inside each group the sort is by name. */
        return [surname ? 0 : 1, surname || r.key.toLowerCase()]
      })
    case 'year':
      return by(rows, (r) => [r.year === null ? 1 : 0, r.year === null ? r.key : String(9999 - r.year).padStart(4, '0')])
    case 'cited':
      return by(rows, (r) => [-r.times, (r.author ?? r.key).toLowerCase()])
    case 'key':
      return by(rows, (r) => [0, r.key.toLowerCase()])
  }
}
