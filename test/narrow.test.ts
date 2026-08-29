import { describe, expect, test } from 'bun:test'

import type { CitationRow } from '../store.ts'
import { reading, writing } from '../src/live/keep.ts'
import { DEFAULT_ORDER, order, type Ordering } from '../src/live/order.ts'
import { EVERYTHING, narrowing, sift } from '../src/live/sift.ts'

/**
 * The filter, the order and what survives a reload — all three pure.
 *
 * The rule under test throughout is the one `sift.ts` states: the only place
 * this app may hide a row is a filter somebody asked for, and an order never
 * removes one. Both halves are easy to break by accident and neither breaks
 * loudly.
 */

const row = (over: Partial<CitationRow>): CitationRow => ({
  key: 'k',
  type: 'article',
  line: 1,
  times: 0,
  where: [],
  author: null,
  year: null,
  title: null,
  venue: null,
  venueField: null,
  ...over,
})

const ROWS: CitationRow[] = [
  row({ key: 'graesser2004', author: 'Graesser, Arthur C.', year: 2004, title: 'AutoTutor', times: 3 }),
  row({ key: 'nye2014', author: 'Nye, Benjamin D.', year: 2014, title: 'AutoTutor and Family', times: 1 }),
  row({ key: 'zeroed', author: 'Aardvark, A.', year: 1999, title: 'Never named', times: 0 }),
  row({ key: 'undated', author: null, title: 'No year and no author', times: 2 }),
]

describe('narrowing', () => {
  test('nothing is hidden by default', () => {
    expect(sift(ROWS, EVERYTHING)).toHaveLength(4)
    expect(narrowing(EVERYTHING)).toBe(false)
  })

  test('cited and uncited are complements, and together they are everything', () => {
    const cited = sift(ROWS, { ...EVERYTHING, standing: 'cited' })
    const uncited = sift(ROWS, { ...EVERYTHING, standing: 'uncited' })
    expect(cited.map((r) => r.key)).toEqual(['graesser2004', 'nye2014', 'undated'])
    expect(uncited.map((r) => r.key)).toEqual(['zeroed'])
    expect(cited.length + uncited.length).toBe(ROWS.length)
  })

  test('every word must match something and they need not match the same thing', () => {
    /* `graesser autotutor` finds the entry Graesser wrote about AutoTutor — one
       word from the author, one from the title — which is how somebody looking
       for a half-remembered reference types. */
    expect(sift(ROWS, { ...EVERYTHING, query: 'graesser autotutor' }).map((r) => r.key)).toEqual(['graesser2004'])
    expect(sift(ROWS, { ...EVERYTHING, query: 'autotutor' })).toHaveLength(2)
  })

  test('the key is searchable, so a \\cite in the other hand finds its entry', () => {
    expect(sift(ROWS, { ...EVERYTHING, query: 'nye2014' }).map((r) => r.key)).toEqual(['nye2014'])
  })

  test('the filter never reorders', () => {
    /* A filter that also moved things means pressing "uncited" shifts every
       remaining row and the reader loses the place they had just found. */
    const filtered = sift(ROWS, { ...EVERYTHING, query: 'a' })
    const positions = filtered.map((r) => ROWS.indexOf(r))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })
})

describe('ordering', () => {
  const orders: Ordering[] = ['file', 'author', 'year', 'cited', 'key']

  test.each(orders)('%p keeps every row', (ordering) => {
    /* An ordering is the kind of code that grows a `filter` by accident: a
       comparator that cannot place a value invites somebody to drop it. */
    expect(order(ROWS, ordering).map((r) => r.key).sort()).toEqual(ROWS.map((r) => r.key).sort())
  })

  test('the default is the order the .bib writes them in', () => {
    expect(DEFAULT_ORDER).toBe('file')
    expect(order(ROWS, 'file').map((r) => r.key)).toEqual(ROWS.map((r) => r.key))
  })

  test('`file` hands back a copy, so a caller cannot sort the store’s rows in place', () => {
    expect(order(ROWS, 'file')).not.toBe(ROWS)
  })

  test('a row with no author sorts last in author order rather than first', () => {
    /* Not the extreme. An entry with no author is not alphabetically first; it
       is unknown, and putting it at the top would be answering a question the
       file did not answer. */
    expect(order(ROWS, 'author').map((r) => r.key)).toEqual(['zeroed', 'graesser2004', 'nye2014', 'undated'])
  })

  test('a row with no year sorts last in year order rather than as the oldest', () => {
    expect(order(ROWS, 'year').map((r) => r.key)).toEqual(['nye2014', 'graesser2004', 'zeroed', 'undated'])
  })

  test('most cited first puts everything nothing names together at the bottom', () => {
    expect(order(ROWS, 'cited').map((r) => r.times)).toEqual([3, 2, 1, 0])
  })

  test('every order is total, so two reads of one file agree', () => {
    const tied = [row({ key: 'b', times: 1 }), row({ key: 'a', times: 1 }), row({ key: 'c', times: 1 })]
    for (const ordering of orders.filter((o) => o !== 'file')) {
      expect(order(tied, ordering).map((r) => r.key)).toEqual(order([...tied].reverse(), ordering).map((r) => r.key))
    }
  })
})

describe('what survives a reload', () => {
  test('a round trip comes back unchanged', () => {
    const kept = { sifting: { query: 'graesser', standing: 'uncited' as const }, ordering: 'year' as const }
    expect(reading(writing(kept))).toEqual(kept)
  })

  test('anything that cannot be vouched for is null, and never a broken control', () => {
    /* The string is as trustworthy as anything else off the wire: written by an
       older version of this app, possibly on another machine. A remembered
       filter that half-applies is worse than one that was forgotten. */
    for (const bad of [null, undefined, '', 'not json', '[]', '"a string"', '{"v":99}', '{}']) {
      expect(reading(bad)).toBeNull()
    }
  })

  test('a field naming a filter that no longer exists becomes the default', () => {
    const held = reading(JSON.stringify({ v: 1, q: 'x', s: 'retired-filter', o: 'retired-order' }))!
    expect(held.sifting.standing).toBe('all')
    expect(held.ordering).toBe(DEFAULT_ORDER)
    /* And the fields it COULD vouch for survive, rather than the whole thing
       being dropped for one bad neighbour. */
    expect(held.sifting.query).toBe('x')
  })

  test('a query is clipped rather than refused', () => {
    /* Nobody types four thousand characters into a filter on purpose, but a
       page that could be made unable to save its settings by a paste is a page
       with a strange bug in it. */
    const long = 'a'.repeat(4000)
    const back = reading(writing({ sifting: { query: long, standing: 'all' }, ordering: 'file' }))!
    expect(back.sifting.query).toHaveLength(500)
  })

  test('the version is checked, so an old shape is dropped whole', () => {
    expect(reading(JSON.stringify({ v: 0, q: 'x', s: 'cited', o: 'key' }))).toBeNull()
  })
})
