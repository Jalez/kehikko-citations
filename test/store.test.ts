import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { bibTargets, isEpic, list, papersDir, projectOf, readCitations, roots } from '../store.ts'

/**
 * The store, which is a reader over somebody else's directory.
 *
 * Two things are worth a test here and the rest is `bib/`'s business: that
 * nothing can be talked into reading a file outside a document's own root, and
 * that the two kinds of emptiness stay apart — "this document names no
 * bibliography" and "there is no project to look in" are different sentences
 * and the page draws different screens for them.
 *
 * The confinement is a copy of the paper module's, deliberately (see the essay
 * at the top of `store.ts`), and it is tested here rather than assumed sound
 * because a copied fence with nobody's tests on it is a fence that quietly
 * stops matching the one it was copied from.
 */

const root = realpathSync(mkdtempSync(join(tmpdir(), 'kehikko-citations-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))

/* Something outside every root, for the confinement tests to fail to reach. */
writeFileSync(join(root, 'secret.bib'), '@misc{leaked, title = {this must never be served}}')
writeFileSync(join(root, 'secret.tex'), 'this must never be served either')

/**
 * A project, with its papers where the paper module keeps them:
 * `<project>/.kehikot/paper/<epic>/main.tex`.
 */
const paperIn = (project: string, epic: string) => {
  const dir = join(project, '.kehikot', 'paper', epic)
  mkdirSync(dir, { recursive: true })
  return dir
}

/* A project of the ordinary shape. Its paper names no bibliography, which is
   what every Kehikot paper is like, and an epic folder with no main.tex. */
const project = join(root, 'project')
writeFileSync(
  join(paperIn(project, 'plain-paper'), 'main.tex'),
  ['\\title{A paper with no bibliography}', '\\begin{document}', 'It cites nothing.', '\\end{document}'].join('\n'),
)
paperIn(project, 'empty-epic')

/* A thesis in the same project: one document with a `.bib` and chapters. */
const thesis = paperIn(project, 'thesis')
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

/* A second project with nothing in it, so "two projects are two sets of documents" can be said. */
const other = join(root, 'other')
mkdirSync(other)

describe('where the documents come from', () => {
  test('no project is not an empty project', () => {
    /* An app that says "no documents" and quietly means "I had nowhere to
       look" has told somebody the opposite of the truth. */
    expect(projectOf(null)).toBeNull()
    expect(projectOf('')).toBeNull()
    expect(roots(null)).toEqual([])
    expect(list(null)).toEqual([])
    expect(readCitations('thesis', null)).toBeNull()
  })

  test('a relative or missing project path is refused, never resolved against this program', () => {
    expect(projectOf('project')).toBeNull()
    expect(projectOf(join(root, 'nope'))).toBeNull()
  })

  test('papers are read from <project>/.kehikot/paper/, where the paper module keeps them', () => {
    expect(papersDir(project)).toBe(join(project, '.kehikot', 'paper'))
    expect(roots(project).map((r) => r.epic)).toEqual(['plain-paper', 'thesis'])
  })

  test('the environment variables this used to read do nothing now', () => {
    const before = { ...process.env }
    process.env.KEHIKKO_PAPERS_DIR = join(project, '.kehikot', 'paper')
    process.env.KEHIKKO_THESIS_DIR = thesis
    try {
      expect(list(other)).toEqual([])
      expect(list(null)).toEqual([])
    } finally {
      delete process.env.KEHIKKO_PAPERS_DIR
      delete process.env.KEHIKKO_THESIS_DIR
      Object.assign(process.env, before)
    }
  })

  test('two projects are two sets of documents', () => {
    expect(readCitations('thesis', other)).toBeNull()
    expect(readCitations('thesis', project)!.bib).toBe('references.bib')
  })

  test('a folder with no main.tex is not a document', () => {
    expect(roots(project).map((r) => r.epic)).not.toContain('empty-epic')
  })

  test('a .kehikot/paper that points out of the project is refused, not followed', () => {
    const escaper = join(root, 'escaper')
    mkdirSync(join(escaper, '.kehikot'), { recursive: true })
    symlinkSync(join(project, '.kehikot', 'paper'), join(escaper, '.kehikot', 'paper'))
    expect(papersDir(escaper)).toBeNull()
    expect(roots(escaper)).toEqual([])
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
    const found = readCitations('plain-paper', project)!
    expect(found.bib).toBeNull()
    expect(found.rows).toEqual([])
    expect(list(project)[0]!.entries).toBeNull()
  })

  test('every entry comes back with what the prose does about it', () => {
    const found = readCitations('thesis', project)!
    expect(found.bib).toBe('references.bib')
    expect(found.rows.map((r) => [r.key, r.times])).toEqual([
      ['cited', 1],
      ['alsocited', 1],
      ['nevercited', 0],
    ])
  })

  test('a cite naming nothing is reported with the file and line it was written on', () => {
    const found = readCitations('thesis', project)!
    expect(found.broken.map((b) => b.key)).toEqual(['nosuchentry'])
    expect(found.broken[0]!.where[0]).toMatchObject({ file: 'chapters/one.tex', line: 3 })
  })

  test('a commented-out citation is not counted', () => {
    const found = readCitations('thesis', project)!
    expect(JSON.stringify(found)).not.toContain('commented')
  })

  test('a .tex the document does not include is not read', () => {
    /*
     * "What does this document cite" must not become "what is lying around next
     * to it". A key cited only in a scratch file does not appear in the PDF, so
     * counting it would report a citation that is not there.
     */
    const found = readCitations('thesis', project)!
    expect(JSON.stringify(found)).not.toContain('scratchonly')
    expect(found.files).toEqual(['main.tex', 'chapters/one.tex'])
  })

  test('an \\include naming a file that is not there does not stop the read', () => {
    /* `chapters/missing` is named by the document and is not on disk. The rest
       of the document still has to be readable. */
    expect(readCitations('thesis', project)!.rows).toHaveLength(3)
  })

  test('the picker counts the entries without reading the whole cross-reference', () => {
    expect(list(project)).toEqual([
      { epic: 'plain-paper', title: 'A paper with no bibliography', entries: null },
      { epic: 'thesis', title: 'A thesis', entries: 3 },
    ])
  })
})

describe('the two fences', () => {
  test.each(['../secret', '..', '/etc', 'A-Thesis', 'a thesis', 'a/thesis', '.', ''])(
    '%p is not an epic name',
    (attempt) => {
      expect(isEpic(attempt)).toBe(false)
      expect(readCitations(attempt, project)).toBeNull()
    },
  )

  test('an \\addbibresource that climbs out of the root reads nothing', () => {
    /*
     * The shape check cannot help here: the target is inside a `.tex` the
     * author wrote, and a bibliography path legitimately contains slashes. So
     * the second fence resolves the path and refuses anything that did not land
     * under the document's own root.
     */
    const climbing = join(root, 'bib-climber')
    const climber = paperIn(climbing, 'thesis')
    /* Right there one level up, so the refusal is the fence and not a missing file. */
    writeFileSync(join(climber, '..', 'secret.bib'), '@misc{leaked, title = {this must never be served}}')
    writeFileSync(
      join(climber, 'main.tex'),
      '\\addbibresource{../secret.bib}\n\\begin{document}\\end{document}',
    )
    const found = readCitations('thesis', climbing)!
    expect(found.rows).toEqual([])
    expect(JSON.stringify(found)).not.toContain('this must never be served')
    /* And it says so, rather than showing an empty bibliography as a complete one. */
    expect(found.problems[0]!.why).toContain('could not be read here')
  })

  test('a symlinked bibliography pointing out of the root is refused', () => {
    const linking = join(root, 'bib-linker')
    const linker = paperIn(linking, 'thesis')
    writeFileSync(join(linker, 'main.tex'), '\\addbibresource{away.bib}\n\\begin{document}\\end{document}')
    symlinkSync(join(root, 'secret.bib'), join(linker, 'away.bib'))
    const found = readCitations('thesis', linking)!
    expect(JSON.stringify(found)).not.toContain('this must never be served')
  })

  test('an \\include that climbs out of the root reads nothing', () => {
    const climbing = join(root, 'inc-climber')
    const climber = paperIn(climbing, 'thesis')
    writeFileSync(join(climber, '..', 'secret.tex'), 'this must never be served either')
    writeFileSync(join(climber, 'main.tex'), '\\begin{document}\n\\include{../secret}\n\\end{document}')
    const found = readCitations('thesis', climbing)!
    expect(found.files).toEqual(['main.tex'])
    expect(JSON.stringify(found)).not.toContain('must never be served')
  })

  test('each document is confined to itself, so one cannot reach into another', () => {
    /* The plain paper's root is a sibling of the thesis's; nothing it names
       resolves into the thesis. */
    expect(readCitations('plain-paper', project)!.bib).toBeNull()
    expect(readCitations('thesis', project)!.bib).toBe('references.bib')
  })

  test('a project path that is a symlink is followed once and then held to', () => {
    const link = join(root, 'project-link')
    symlinkSync(project, link)
    expect(readCitations('thesis', projectOf(link))!.rows).toHaveLength(3)
  })
})
