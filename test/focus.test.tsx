import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, renderHook } from '@testing-library/react'

import { partsDeclaration, type EpicPart } from 'kehikot-module-protocol'
import { useFocus } from 'kehikot-module-protocol/client/react'

import { MANIFEST } from '../manifest.ts'
import { NOUN, anchorOf, inHand } from '../src/live/focus.ts'

/**
 * The parts focus: what ties an entry to a part, for both of the shapes a host
 * sends a part in, what is kept in hand on each of the two lists, and the one
 * sentence. The rule itself is the protocol's and is tested there.
 */

afterEach(cleanup)

const DIR = '.kehikot/paper/thesis'
const PROJECT = '/tmp/p'
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

const CHAPTER: Record<string, string> = { intro: 'chapters/1_introduction.tex', methods: 'chapters/3_methods.tex' }
/** Parts as a host with documents sends them: project-relative, and `files` still filled. */
const withDocuments = (...picked: string[]): EpicPart[] =>
  Object.entries(CHAPTER).map(([id, file]) => ({ id, heading: id, refs: [], picked: picked.includes(id), documents: [`${DIR}/${file}`], files: [file] }))
/** Parts as a host from before documents sends them: names relative to the document's folder. */
const withFiles = (...picked: string[]): EpicPart[] =>
  Object.entries(CHAPTER).map(([id, file]) => ({ id, heading: id, refs: [], picked: picked.includes(id), files: [file] }))

function narrowed(parts: EpicPart[], open: string | null = null, dir: string | null = DIR) {
  const { result } = renderHook(() => useFocus({ parts, epic: 'thesis', projectPath: PROJECT }))
  const options = { noun: NOUN, keep: (row: { key: string }) => inHand(row, open) }
  return {
    entries: result.current.narrow(ROWS, (row) => anchorOf(row, dir), options),
    broken: result.current.narrow(BROKEN, (row) => anchorOf(row, dir), options),
  }
}
const keys = (list: readonly { key: string }[]) => list.map((one) => one.key)

describe('anchorOf', () => {
  test('an entry is about every file that cites it, by the name the project knows the file by', () => {
    expect(anchorOf(ROWS[1]!, DIR)).toEqual([
      { file: '.kehikot/paper/thesis/chapters/1_introduction.tex' },
      { file: '.kehikot/paper/thesis/chapters/3_methods.tex' },
    ])
  })

  test('the folder is whatever the document is kept in: nothing here names one', () => {
    expect(anchorOf(ROWS[0]!, '.kehikot/writing/essay')).toEqual([{ file: '.kehikot/writing/essay/chapters/1_introduction.tex' }])
  })

  test('an entry cited nowhere has no anchor', () => {
    expect(anchorOf(ROWS[4]!, DIR)).toEqual([])
  })

  test('a server that does not say the folder: the file’s own name, as before', () => {
    expect(anchorOf(ROWS[0]!)).toEqual([{ file: 'chapters/1_introduction.tex' }])
  })
})

for (const [shape, parts] of [['documents', withDocuments], ['only files', withFiles]] as const) {
  describe(`which entries the picked parts leave — a context that carries ${shape}`, () => {
    test('nothing picked: every entry, every broken citation, and nothing to say', () => {
      const { entries, broken } = narrowed(parts())
      expect(entries.shown).toEqual(ROWS)
      expect(broken.shown).toEqual(BROKEN)
      expect(entries).toMatchObject({ outside: 0, kept: 0, empty: '' })
    })

    test('one part: the entries ANY citing file of which is its own', () => {
      const { entries, broken } = narrowed(parts('intro'))
      expect(keys(entries.shown)).toEqual(['intro-only', 'both'])
      expect(keys(broken.shown)).toEqual([])
    })

    test('main.tex and an entry cited nowhere are in no part', () => {
      const { entries, broken } = narrowed(parts('intro', 'methods'))
      expect(keys(entries.shown)).toEqual(['intro-only', 'both', 'methods-only'])
      expect(keys(broken.shown)).toEqual(['typo'])
    })

    test('keep: the open entry stays in its place, though no picked part has its files', () => {
      const { entries } = narrowed(parts('intro'), 'main-only')
      expect(keys(entries.shown)).toEqual(['intro-only', 'both', 'main-only'])
      expect(entries).toMatchObject({ kept: 1, empty: '' })
    })

    test('keep is passed on both lists: a broken citation in hand would stay too', () => {
      const { broken } = narrowed(parts('intro'), 'gone')
      expect(keys(broken.shown)).toEqual(['gone'])
    })
  })
}

test('a server older than the folder still narrows a host that sends only files', () => {
  const { entries } = narrowed(withFiles('intro'), null, null)
  expect(keys(entries.shown)).toEqual(['intro-only', 'both'])
})

describe('the one sentence there is', () => {
  test('a list the pick emptied says the protocol’s sentence, and that is all this module says about the pick', () => {
    const none = (id: string): EpicPart => ({ id, heading: id, refs: [], picked: true, documents: ['docs/other.md'] })
    expect(narrowed([none('a')]).entries.empty).toBe('No entry is in the picked part.')
    expect(narrowed([none('a'), none('b')]).entries.empty).toBe('No entry is in the picked parts.')
  })
})

test('the manifest says the module follows the parts', () => {
  expect(MANIFEST.reacts).toContain('parts')
  expect(partsDeclaration(MANIFEST)).toEqual([])
})
