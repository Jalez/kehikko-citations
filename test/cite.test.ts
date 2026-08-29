import { describe, expect, test } from 'bun:test'

import { crossReference, findCites } from '../bib/cite.ts'

/**
 * The cite scanner and the cross-reference, both pure functions of two strings.
 *
 * The two claims this whole module makes are decided here: which entries
 * nothing cites, and which citations name nothing. Neither needs a browser and
 * neither needs a filesystem, so both are under test in milliseconds.
 */

describe('finding citations in prose', () => {
  test('every biblatex and BibTeX spelling is counted', () => {
    const source = '\\cite{a} \\autocite{b} \\parencite{c} \\textcite{d} \\citep{e} \\citet{f} \\footcite{g}'
    expect(findCites(source, 'main.tex').map((c) => c.key)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
  })

  test('several keys in one command are several citations', () => {
    const cites = findCites('\\autocite{woolf2009building,vanlehn2011relative}', 'main.tex')
    expect(cites.map((c) => c.key)).toEqual(['woolf2009building', 'vanlehn2011relative'])
  })

  test('an optional argument is not read as a key', () => {
    /*
     * `\autocite[see][12]{key}` is ordinary biblatex and compiles perfectly. A
     * scan taking the first braced group after the command would report `12` as
     * a citation key on a document with nothing wrong with it.
     */
    expect(findCites('\\autocite[see][12]{real}', 'main.tex').map((c) => c.key)).toEqual(['real'])
    expect(findCites('\\textcite[p.~4]{real}', 'main.tex').map((c) => c.key)).toEqual(['real'])
  })

  test('a commented-out citation is not a citation', () => {
    /*
     * The one that matters most. Counting it would report a key as cited that
     * does not appear in the PDF — the exact opposite of what this page is for.
     */
    const source = ['A real one \\autocite{real}.', '% An old one \\autocite{ghost}.', 'Trailing % \\cite{ghost2}'].join(
      '\n',
    )
    expect(findCites(source, 'main.tex').map((c) => c.key)).toEqual(['real'])
  })

  test('an escaped percent does not start a comment', () => {
    expect(findCites('100\\% of them \\autocite{real}.', 'main.tex').map((c) => c.key)).toEqual(['real'])
  })

  test('the line number is the line in the author’s own file', () => {
    /* Comments are blanked rather than removed for exactly this: every offset
       after a comment is still an offset into the original file. */
    const source = ['% a comment', '% another', '', 'Text \\autocite{real}.'].join('\n')
    expect(findCites(source, 'chapters/2.tex')[0]).toMatchObject({ key: 'real', line: 4, file: 'chapters/2.tex' })
  })

  test('a command that merely starts with a cite name is not one', () => {
    expect(findCites('\\citeXYZ{a} \\notacite{b}', 'main.tex')).toEqual([])
  })

  test('the command that was used is kept', () => {
    /* `\nocite` is a citation for the bibliography's purposes and is not a
       citation in the prose, and a reader has to be able to tell. */
    expect(findCites('\\nocite{a}', 'main.tex')[0]!.command).toBe('nocite')
    expect(findCites('\\textcite{a}', 'main.tex')[0]!.command).toBe('textcite')
  })
})

describe('the cross-reference, which is the whole point', () => {
  test('an entry nothing names is reported with a count of zero', () => {
    const crossed = crossReference(['used', 'unused'], findCites('\\autocite{used}', 'main.tex'))
    expect(crossed.cited.get('used')!.times).toBe(1)
    expect(crossed.cited.get('unused')!.times).toBe(0)
    expect(crossed.broken).toEqual([])
  })

  test('a cite naming nothing is broken, and says where it was written', () => {
    /* Biblatex prints a `?` here and buries the warning in a log nobody reads
       until the PDF is printed. */
    const crossed = crossReference(['real'], findCites('Text \\autocite{ghost}.', 'chapters/1.tex'))
    expect(crossed.broken).toHaveLength(1)
    expect(crossed.broken[0]).toMatchObject({ key: 'ghost', times: 1 })
    expect(crossed.broken[0]!.where[0]).toMatchObject({ file: 'chapters/1.tex', line: 1 })
  })

  test('one broken key named three times is one row counted three', () => {
    const source = '\\autocite{ghost} \\autocite{ghost}\n\\textcite{ghost}'
    const crossed = crossReference([], findCites(source, 'main.tex'))
    expect(crossed.broken).toHaveLength(1)
    expect(crossed.broken[0]!.times).toBe(3)
  })

  test('every place an entry is named is kept, in document order', () => {
    const cites = [...findCites('\\autocite{a}', 'main.tex'), ...findCites('\\autocite{a}\n\\autocite{a}', 'ch.tex')]
    const row = crossReference(['a'], cites).cited.get('a')!
    expect(row.times).toBe(3)
    expect(row.where.map((w) => `${w.file}:${w.line}`)).toEqual(['main.tex:1', 'ch.tex:1', 'ch.tex:2'])
  })

  test('keys are compared exactly, so a near miss is a legible pair', () => {
    /*
     * Guessing at case in either direction produces the failure this page
     * exists to prevent — a broken citation reported as fine, or a fine one
     * reported as broken. Exact comparison agrees with biber, and a near miss
     * shows up as a broken cite beside an uncited entry with almost the same
     * name, which a person can read.
     */
    const crossed = crossReference(['Graesser2004'], findCites('\\autocite{graesser2004}', 'main.tex'))
    expect(crossed.broken.map((b) => b.key)).toEqual(['graesser2004'])
    expect(crossed.cited.get('Graesser2004')!.times).toBe(0)
  })

  test('\\nocite{*} is reported and NOT obeyed', () => {
    /*
     * Marking every entry cited here would mean a page reporting thirty-seven
     * citations where the prose contains none, with the reader unable to tell
     * that from a document that really cites them all. So the flag is carried,
     * the counts stay true to the prose, and the page says the sentence.
     */
    const crossed = crossReference(['a', 'b'], findCites('\\nocite{*}', 'main.tex'))
    expect(crossed.citesEverything).toBe(true)
    expect(crossed.cited.get('a')!.times).toBe(0)
    expect(crossed.broken).toEqual([])
  })

  test('every key in the bibliography gets a row, cited or not', () => {
    /* The list is the bibliography. A cross-reference that only returned the
       cited ones would have quietly become a filter. */
    const crossed = crossReference(['a', 'b', 'c'], [])
    expect([...crossed.cited.keys()]).toEqual(['a', 'b', 'c'])
  })
})
