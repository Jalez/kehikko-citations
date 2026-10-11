import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, renderHook } from '@testing-library/react'

import { partsDeclaration, type EpicPart } from 'kehikot-module-protocol'
import { useFocus } from 'kehikot-module-protocol/client/react'

import { MANIFEST } from '../manifest.ts'
import { anchorOf, saidOfNone } from '../src/live/focus.ts'

/**
 * The parts focus: which entries a ticked part leaves, how many it does not,
 * and what the page says. The rule itself is the protocol's and is tested
 * there; this is what anchors an entry, and the line.
 */

afterEach(cleanup)

const at = (...files: string[]) => files.map((file, i) => ({ file, line: i + 1, command: 'cite' }))
const ROWS = [
  { key: 'intro-only', where: at('chapters/1_introduction.tex') },
  { key: 'both', where: at('chapters/1_introduction.tex', 'chapters/3_methods.tex') },
  { key: 'methods-only', where: at('chapters/3_methods.tex', 'chapters/3_methods.tex') },
  { key: 'main-only', where: at('main.tex') },
  { key: 'uncited', where: at() },
]
const BROKEN = [
  { key: 'typo', where: at('chapters/3_methods.tex') },
  { key: 'gone', where: at('main.tex') },
]

const parts = (...picked: string[]): EpicPart[] => [
  { id: 'intro', heading: 'Introduction', refs: [], picked: picked.includes('intro'), files: ['chapters/1_introduction.tex'] },
  { id: 'methods', heading: 'Methods', refs: [], picked: picked.includes('methods'), files: ['chapters/3_methods.tex'] },
]

function narrowed(picked: string[], open: string | null = null) {
  const { result } = renderHook(() => useFocus({ parts: parts(...picked), epic: 'thesis' }))
  return {
    entries: result.current.narrow(ROWS, anchorOf, { keep: (row) => row.key === open }),
    broken: result.current.narrow(BROKEN, anchorOf),
  }
}
const keys = (list: readonly { key: string }[]) => list.map((one) => one.key)

describe('which entries the ticked parts leave', () => {
  test('nothing ticked: every entry, every broken citation, and nothing to say', () => {
    const { entries, broken } = narrowed([])
    expect(entries.shown).toEqual(ROWS)
    expect(broken.shown).toEqual(BROKEN)
    expect(entries).toMatchObject({ outside: 0, kept: 0 })
  })

  test('one part: the entries ANY citing file of which is its own; the rest are put aside', () => {
    const { entries, broken } = narrowed(['intro'])
    expect(keys(entries.shown)).toEqual(['intro-only', 'both'])
    expect(entries.outside).toBe(3)
    expect(keys(broken.shown)).toEqual([])
    expect(broken.outside).toBe(2)
  })

  test('main.tex and an entry cited nowhere are outside every focus', () => {
    const { entries, broken } = narrowed(['intro', 'methods'])
    expect(keys(entries.shown)).toEqual(['intro-only', 'both', 'methods-only'])
    expect(keys(broken.shown)).toEqual(['typo'])
  })

  test('the open entry stays in its place, though its files are outside', () => {
    const { entries } = narrowed(['intro'], 'main-only')
    expect(keys(entries.shown)).toEqual(['intro-only', 'both', 'main-only'])
    expect(entries).toMatchObject({ outside: 3, kept: 1 })
  })
})

describe('the one sentence there is', () => {
  test('a list the ticks emptied says so, and that is all this module says about the ticks', () => {
    expect(saidOfNone(parts('intro'))).toBe('No entry here is cited in the picked part.')
    expect(saidOfNone(parts('intro', 'methods'))).toBe('No entry here is cited in the picked parts.')
  })
})

test('the manifest says the module follows the parts', () => {
  expect(MANIFEST.reacts).toContain('parts')
  expect(partsDeclaration(MANIFEST)).toEqual([])
})
