import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { bibTargets, isEpic, list, papersDir, readCitations, roots, thesisRoot } from '../store.ts'

/**
 * The store, which is a reader over somebody else's directory.
 *
 * Two things are worth a test here and the rest is `bib/`'s business: that
 * nothing can be talked into reading a file outside a document's own root, and
 * that the two kinds of emptiness stay apart — "this document names no
 * bibliography" and "nobody said where to look" are different sentences and the
 * page draws different screens for them.
 *
 * The confinement is a copy of the paper module's, deliberately (see the essay
 * at the top of `store.ts`), and it is tested here rather than assumed sound
 * because a copied fence with nobody's tests on it is a fence that quietly
 * stops matching the one it was copied from.
 */

const root = mkdtempSync(join(tmpdir(), 'kehikko-citations-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

/* Something outside every root, for the confinement tests to fail to reach. */
writeFileSync(join(root, 'secret.bib'), '@misc{leaked, title = {this must never be served}}')
writeFileSync(join(root, 'secret.tex'), 'this must never be served either')

/* A papers directory of the ordinary shape. Its paper names no bibliography,
   which is what every roadmap paper on this machine is like. */
const papers = join(root, 'papers')
mkdirSync(join(papers, 'plain-paper'), { recursive: true })
writeFileSync(
  join(papers, 'plain-paper', 'main.tex'),
  ['\\title{A paper with no bibliography}', '\\begin{document}', 'It cites nothing.', '\\end{document}'].join('\n'),
)
mkdirSync(join(papers, 'empty-epic'), { recursive: true })

/* A thesis: one document, its own root, with a `.bib` and chapters. */
const thesis = join(root, 'a-thesis')
mkdirSync(join(thesis, 'chapters'), { recursive: true })
writeFileSync(
  join(thesis, 'main.tex'),
  [
    '\\documentclass{tauthesis}',
    '\\addbibresource{references.bib}',
    '\\title{A thesis}',
    '\\begin{document}',
    '\\include{chapters/one}',
    '\\include{chapters/missing}',
    '\\printbibliography',
    '\\end{document}',
  ].join('\n'),
)
writeFileSync(
  join(thesis, 'chapters', 'one.tex'),
  [
    'A claim \\autocite{cited,alsocited}.',
    '% An old one \\autocite{commented}.',
    'And a ghost \\autocite{nosuchentry}.',
  ].join('\n'),
)
/* A file the document does NOT include, naming a key nothing else names. */
writeFileSync(join(thesis, 'chapters', 'scratch.tex'), 'Notes \\autocite{scratchonly}.')
writeFileSync(
  join(thesis, 'references.bib'),
  [
    '@article{cited, author = {A, One}, title = {First}, journal = {J}, year = {2001}}',
    '@article{alsocited, author = {B, Two}, title = {Second}, journal = {J}, year = {2002}}',
    '@misc{nevercited, author = {C, Three}, title = {Third}, year = {2003}}',
  ].join('\n'),
)

const asThesis = { KEHIKKO_THESIS_DIR: thesis }

describe('where the documents come from', () => {
  test('an unset environment is not an empty directory', () => {
    /* An app that says "no documents" and quietly means "I was not configured"
       has told somebody the opposite of the truth. */
    expect(papersDir({})).toBeNull()
    expect(thesisRoot({})).toBeNull()
    expect(list(null, null)).toEqual([])
  })

  test('the same variables the paper module reads, and no third set', () => {
    expect(papersDir({ KEHIKKO_PAPERS_DIR: papers })).toBe(papers)
    const roadmap = join(root, 'roadmap')
    mkdirSync(join(roadmap, 'data', 'papers'), { recursive: true })
    expect(papersDir({ KEHIKKO_ROADMAP_DIR: roadmap })).toBe(join(roadmap, 'data', 'papers'))
    expect(thesisRoot(asThesis)?.epic).toBe('thesis')
  })

  test('a slug from the environment passes the same shape check as one from a URL', () => {
    expect(thesisRoot({ ...asThesis, KEHIKKO_THESIS_EPIC: '../..' })).toBeNull()
    expect(thesisRoot({ ...asThesis, KEHIKKO_THESIS_EPIC: 'Not A Slug' })).toBeNull()
    expect(thesisRoot({ ...asThesis, KEHIKKO_THESIS_EPIC: 'educhat' })?.epic).toBe('educhat')
  })

  test('a folder with no main.tex is not a document', () => {
    expect(roots(papers, null).map((r) => r.epic)).toEqual(['plain-paper'])
  })

  test('a slug collision leaves the document that was already there alone', () => {
    const both = roots(papers, { epic: 'plain-paper', dir: thesis })
    expect(both.filter((r) => r.epic === 'plain-paper')).toHaveLength(1)
    expect(readCitations('plain-paper', papers, { epic: 'plain-paper', dir: thesis })!.bib).toBeNull()
  })
})

describe('finding the bibliography a document names', () => {
  test.each([
    ['\\addbibresource{references.bib}', ['references.bib']],
    ['\\bibliography{refs}', ['refs.bib']],
    ['\\bibliography{one,two}', ['one.bib', 'two.bib']],
    ['\\addbibresource[label=x]{a.bib}', ['a.bib']],
    ['nothing at all', []],
  ])('%p names %p', (source, expected) => {
    /* Both spellings, because biblatex uses the first and BibTeX the second. A
       document using the one this did not know about would be reported as
       having no bibliography while sitting next to a `references.bib` in plain
       sight — a page saying the opposite of the truth about a file it can see. */
    expect(bibTargets(source)).toEqual(expected)
  })
})

describe('reading one document', () => {
  test('a document naming no bibliography says so, rather than showing nothing', () => {
    /* Null and zero are different sentences and both are drawn: null is "names
       none", zero is "names one and it is empty or missing". */
    const found = readCitations('plain-paper', papers, null)!
    expect(found.bib).toBeNull()
    expect(found.rows).toEqual([])
    expect(list(papers, null)[0]!.entries).toBeNull()
  })

  test('every entry comes back with what the prose does about it', () => {
    const found = readCitations('thesis', null, thesisRoot(asThesis))!
    expect(found.bib).toBe('references.bib')
    expect(found.rows.map((r) => [r.key, r.times])).toEqual([
      ['cited', 1],
      ['alsocited', 1],
      ['nevercited', 0],
    ])
  })

  test('a cite naming nothing is reported with the file and line it was written on', () => {
    const found = readCitations('thesis', null, thesisRoot(asThesis))!
    expect(found.broken.map((b) => b.key)).toEqual(['nosuchentry'])
    expect(found.broken[0]!.where[0]).toMatchObject({ file: 'chapters/one.tex', line: 3 })
  })

  test('a commented-out citation is not counted', () => {
    const found = readCitations('thesis', null, thesisRoot(asThesis))!
    expect(JSON.stringify(found)).not.toContain('commented')
  })

  test('a .tex the document does not include is not read', () => {
    /*
     * "What does this document cite" must not become "what is lying around next
     * to it". A key cited only in a scratch file does not appear in the PDF, so
     * counting it would report a citation that is not there.
     */
    const found = readCitations('thesis', null, thesisRoot(asThesis))!
    expect(JSON.stringify(found)).not.toContain('scratchonly')
    expect(found.files).toEqual(['main.tex', 'chapters/one.tex'])
  })

  test('an \\include naming a file that is not there does not stop the read', () => {
    /* `chapters/missing` is named by the document and is not on disk. The rest
       of the document still has to be readable. */
    expect(readCitations('thesis', null, thesisRoot(asThesis))!.rows).toHaveLength(3)
  })

  test('the picker counts the entries without reading the whole cross-reference', () => {
    expect(list(null, thesisRoot(asThesis))).toEqual([
      { epic: 'thesis', title: 'A thesis', entries: 3 },
    ])
  })
})

describe('the two fences', () => {
  test.each(['../secret', '..', '/etc', 'A-Thesis', 'a thesis', 'a/thesis', '.', ''])(
    '%p is not an epic name',
    (attempt) => {
      expect(isEpic(attempt)).toBe(false)
      expect(readCitations(attempt, papers, thesisRoot(asThesis))).toBeNull()
    },
  )

  test('an \\addbibresource that climbs out of the root reads nothing', () => {
    /*
     * The shape check cannot help here: the target is inside a `.tex` the
     * author wrote, and a bibliography path legitimately contains slashes. So
     * the second fence resolves the path and refuses anything that did not land
     * under the document's own root.
     */
    const climber = join(root, 'bib-climber')
    mkdirSync(climber, { recursive: true })
    writeFileSync(
      join(climber, 'main.tex'),
      '\\addbibresource{../secret.bib}\n\\begin{document}\\end{document}',
    )
    const found = readCitations('thesis', null, thesisRoot({ KEHIKKO_THESIS_DIR: climber }))!
    expect(found.rows).toEqual([])
    expect(JSON.stringify(found)).not.toContain('this must never be served')
    /* And it says so, rather than showing an empty bibliography as a complete one. */
    expect(found.problems[0]!.why).toContain('could not be read here')
  })

  test('a symlinked bibliography pointing out of the root is refused', () => {
    const linker = join(root, 'bib-linker')
    mkdirSync(linker, { recursive: true })
    writeFileSync(join(linker, 'main.tex'), '\\addbibresource{away.bib}\n\\begin{document}\\end{document}')
    symlinkSync(join(root, 'secret.bib'), join(linker, 'away.bib'))
    const found = readCitations('thesis', null, thesisRoot({ KEHIKKO_THESIS_DIR: linker }))!
    expect(JSON.stringify(found)).not.toContain('this must never be served')
  })

  test('an \\include that climbs out of the root reads nothing', () => {
    const climber = join(root, 'inc-climber')
    mkdirSync(climber, { recursive: true })
    writeFileSync(join(climber, 'main.tex'), '\\begin{document}\n\\include{../secret}\n\\end{document}')
    const found = readCitations('thesis', null, thesisRoot({ KEHIKKO_THESIS_DIR: climber }))!
    expect(found.files).toEqual(['main.tex'])
    expect(JSON.stringify(found)).not.toContain('must never be served')
  })

  test('each root is confined to itself, so one cannot reach into the other', () => {
    /* The property a second root must not cost. Neither resolves a path against
       the other's root. */
    expect(readCitations('plain-paper', null, thesisRoot(asThesis))).toBeNull()
    expect(readCitations('thesis', papers, null)).toBeNull()
    expect(readCitations('thesis', papers, thesisRoot(asThesis))!.bib).toBe('references.bib')
  })

  test('a root that is itself a symlink is followed once and then held to', () => {
    const link = join(root, 'thesis-link')
    symlinkSync(thesis, link)
    const as = thesisRoot({ KEHIKKO_THESIS_DIR: link })
    expect(readCitations('thesis', null, as)!.rows).toHaveLength(3)
  })
})
