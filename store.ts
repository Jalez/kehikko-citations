import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

import { moduleDir } from 'roadmap-module-protocol'

import { findCites, crossReference, type Cite, type CrossReference } from './bib/cite.ts'
import { parseBib, view, type BibEntry, type BibView } from './bib/parse.ts'

/**
 * The documents in the open project, and the one rule about where they come from.
 *
 * ## This app owns no data
 *
 * The argument is the paper module's, unchanged, because it is the same
 * argument about the same files: a bibliography is a `.bib` somebody is editing
 * in a repository with its own history, and the worst thing this app could do
 * is become a second place where one lives. There is no store, no seed, no copy
 * and no cache. Every read opens the file, because the whole value of the page
 * is that a reload shows the entry the author just added.
 *
 * ## The same place as the paper module, deliberately
 *
 * A paper lives at `<project>/.kehikot/paper/<epic>/main.tex`, in the project
 * the host says is open (`roadmap.context.projectPath`). That is
 * `kehikko-paper`'s rule — see the essay at the top of its `store.ts` — and this
 * app finds documents by exactly the same rule, through the same protocol
 * helper (`moduleDir(project, 'roadmap.paper')`), so the two can never disagree
 * about where a paper is.
 *
 * This used to be three environment variables — `KEHIKKO_PAPERS_DIR`,
 * `KEHIKKO_ROADMAP_DIR` and `KEHIKKO_THESIS_DIR` — read because the paper
 * module read them. The paper module dropped them for reasons that apply here
 * word for word: they were one restart from gone, they were per-machine where
 * the fact is per-project, and they let a container on a canvas show another
 * project's material with no way to know. They are ignored now if still set.
 *
 * Finding the folder the same way is not the same as depending on the paper
 * module. Nothing here calls it, imports from it, or needs it to be running;
 * the two are independent programs that happen to look in the same directory
 * the way two editors open the same file.
 *
 * ## No project, no documents
 *
 * `null` in, nothing out. No `process.cwd()`, which is this module's own
 * directory; no "the only project that has papers"; no compiled-in path. A page
 * with no project open has nowhere to read, which is an ordinary state with a
 * screen of its own, and an MCP call that names none is told to.
 *
 * ## The confinement is copied, not shared, and that is the point
 *
 * `confine` below is character for character the paper module's, and it is
 * duplicated on purpose. A shared fence would be a dependency between two
 * modules on the security-critical path; a copied one is a fence each module
 * owns, tests, and can be audited without reading the other repository. Both
 * copies are covered by their own tests. If one is ever changed, the other has
 * to be changed deliberately, which is exactly the review this code deserves.
 */

/**
 * The module whose folder papers live in. Not this module's id: a paper is the
 * paper module's material, and this app reads it where that module keeps it.
 */
export const PAPER_MODULE = 'roadmap.paper'

/** A directory holding one document: a `main.tex` and whatever it includes. */
export interface DocumentRoot {
  epic: string
  dir: string
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/

export function isEpic(value: unknown): value is string {
  return typeof value === 'string' && SLUG.test(value)
}

/**
 * The project as this app names it to itself: absolute, real, a directory — or
 * `null`, which is the ordinary state of no project being open.
 *
 * The paper module's function, for the paper module's reasons: realpath'd
 * because every fence downstream compares resolved paths, and `null` for every
 * refusal without saying which — this app is read-only and answers on
 * loopback, and a caller who could tell "not absolute" from "nothing there"
 * could ask it which directories exist on the disk, one question at a time.
 */
export function projectOf(projectPath: string | null | undefined): string | null {
  if (typeof projectPath !== 'string') return null
  const raw = projectPath.trim()
  if (!raw || !isAbsolute(raw)) return null
  try {
    const real = realpathSync(raw)
    return statSync(real).isDirectory() ? real : null
  } catch {
    return null
  }
}

/**
 * Where a project keeps its papers — `<project>/.kehikot/paper` — confined to
 * the project, or null when that folder is not really inside it.
 *
 * `moduleDir` knows the folder's name; this only refuses a `.kehikot` or a
 * `paper/` that is a symlink out of the project, which a string join would
 * walk straight through.
 */
export function papersDir(project: string): string | null {
  const dir = moduleDir(project, PAPER_MODULE)
  if (dir === null) return null
  return confine(project, relative(project, dir))
}

/**
 * Resolve a path inside one root, or refuse.
 *
 * `realpathSync` on the root and on the target, because a symlink inside the
 * tree pointing out of it resolves after a plain `resolve()` has already
 * declared the string safe. The include targets and `\addbibresource` arguments
 * inside a `.tex` do NOT go through `isEpic` — `\addbibresource{../shared.bib}`
 * legitimately contains a slash, and an author can write
 * `\addbibresource{../../../../etc/passwd}` as easily as anything else. That is
 * a typo threat model more than a hostile one. Either way the answer is the
 * same: resolve, and refuse anything that did not land underneath the root.
 */
function confine(root: string, relative: string): string | null {
  const target = resolve(root, relative)
  let realRoot: string
  try {
    realRoot = realpathSync(root)
  } catch {
    return null
  }
  let realTarget: string
  try {
    realTarget = realpathSync(target)
  } catch {
    return target.startsWith(`${realRoot}/`) ? target : null
  }
  return realTarget === realRoot || realTarget.startsWith(`${realRoot}/`) ? realTarget : null
}

const MAIN = 'main.tex'
const MAX_BYTES = 4_000_000

/**
 * Every paper this project holds, by the paper module's rule.
 *
 * One directory read, and the folder's name is the epic. A directory with no
 * `main.tex` is not a paper — that is what keeps an abandoned folder from
 * putting a document in the picker that could only ever say "nothing here".
 * Every root is confined and resolved before it is a root.
 */
export function roots(project: string | null): DocumentRoot[] {
  if (project === null) return []
  const dir = papersDir(project)
  if (dir === null) return []
  let entries: string[] = []
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  const out: DocumentRoot[] = []
  for (const entry of entries.sort()) {
    if (!isEpic(entry)) continue
    const root = confine(dir, entry)
    if (!root || !existsSync(join(root, MAIN))) continue
    out.push({ epic: entry, dir: root })
  }
  return out
}

/** One document's bibliography, cross-referenced against its own prose. */
export interface Citations {
  epic: string
  /** The `.bib` the document names, as it names it. Null when it names none. */
  bib: string | null
  /** Every `.tex` that was read, main first. */
  files: string[]
  rows: CitationRow[]
  /** `\cite`s naming an entry that is not in the bibliography. */
  broken: BrokenRow[]
  /** Whether the document says `\nocite{*}`. */
  citesEverything: boolean
  /** Anything the `.bib` could not be read as. */
  problems: { line: number; why: string }[]
}

export interface CitationRow extends BibView {
  key: string
  type: string
  line: number
  times: number
  where: { file: string; line: number; command: string }[]
}

export interface BrokenRow {
  key: string
  times: number
  where: { file: string; line: number; command: string }[]
}

/** As little as a picker needs to name one document. */
export interface Brief {
  epic: string
  title: string | null
  /** How many entries its bibliography holds, or null when it names none. */
  entries: number | null
}

/**
 * Every `\addbibresource{…}` and `\bibliography{…}` target a source names.
 *
 * Both spellings, because biblatex uses the first and BibTeX the second, and a
 * document that uses the one this did not know about would be reported as
 * having no bibliography while sitting next to a `references.bib` in plain
 * sight — a page saying the opposite of the truth about a file it can see.
 *
 * `\bibliography{refs}` names `refs.bib` with the extension left off, which is
 * BibTeX's convention; `\addbibresource` requires the extension. Handled by
 * appending `.bib` when there is not one, which is right for both.
 */
export function bibTargets(source: string): string[] {
  const out: string[] = []
  const re = /\\(?:addbibresource|bibliography)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g
  for (let m = re.exec(source); m; m = re.exec(source)) {
    for (const raw of m[1]!.split(',')) {
      const name = raw.trim()
      if (!name) continue
      out.push(name.toLowerCase().endsWith('.bib') ? name : `${name}.bib`)
    }
  }
  return out
}

/** Every `\include{…}` / `\input{…}` target, in the order written. */
function includeTargets(source: string): string[] {
  const out: string[] = []
  const re = /\\(?:include|input)\s*\{([^}]*)\}/g
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const name = m[1]!.trim()
    if (name) out.push(name.endsWith('.tex') ? name : `${name}.tex`)
  }
  return out
}

/** `\title{…}`, brace-matched, for the picker. */
function braced(source: string, command: string): string | null {
  const at = source.indexOf(`\\${command}{`)
  if (at === -1) return null
  let depth = 0
  for (let i = at + command.length + 1; i < source.length; i += 1) {
    const c = source[i]
    if (c === '\\') {
      i += 1
      continue
    }
    if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) {
        const text = source
          .slice(at + command.length + 2, i)
          .replace(/\\\\/g, ' ')
          .replace(/\\[a-zA-Z]+\s*/g, '')
          .replace(/[{}]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
        return text || null
      }
    }
  }
  return null
}

function read(path: string): string | null {
  try {
    if (statSync(path).size > MAX_BYTES) return null
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * Every document with a `main.tex`, and how big its bibliography is.
 *
 * `entries: null` and `entries: 0` are different sentences and both are drawn:
 * null is "this document names no bibliography at all", zero is "it names one
 * and the file is empty or missing". A picker that showed a dash for both would
 * hide the more actionable of the two.
 */
export function list(project: string | null): Brief[] {
  const out: Brief[] = []
  for (const root of roots(project)) {
    const main = confine(root.dir, MAIN)
    const source = main ? read(main) : null
    if (source === null) continue
    const targets = bibTargets(source)
    let entries: number | null = null
    if (targets.length) {
      entries = 0
      for (const target of targets) {
        const path = confine(root.dir, target)
        const bib = path ? read(path) : null
        if (bib !== null) entries += parseBib(bib).entries.length
      }
    }
    out.push({ epic: root.epic, title: braced(source, 'title'), entries })
  }
  return out
}

/**
 * One document's bibliography, read, with every entry cross-referenced.
 *
 * The `.tex` files are the ones the document itself names — `main.tex` plus one
 * level of `\include` — for the same reason the paper module reads them: the
 * document order is a fact about the source, and a scratch `.tex` lying beside
 * the paper is not part of it. A key cited only in a file the document does not
 * include is a key that does not appear in the PDF, so counting it would be
 * reporting a citation that is not there.
 *
 * One level deep, deliberately, matching LaTeX's own rule that `\include`
 * cannot nest — and making a cycle impossible rather than merely unlikely.
 */
export function readCitations(epic: string, project: string | null): Citations | null {
  if (!isEpic(epic)) return null
  const root = roots(project).find((r) => r.epic === epic)?.dir
  if (!root) return null
  const main = confine(root, MAIN)
  const source = main ? read(main) : null
  if (source === null) return null

  /* The prose: main plus one level of includes, each confined separately. */
  const files: string[] = [MAIN]
  const cites: Cite[] = findCites(source, MAIN)
  for (const target of includeTargets(source)) {
    const path = confine(root, target)
    const chapter = path ? read(path) : null
    if (chapter === null) continue
    files.push(target)
    cites.push(...findCites(chapter, target))
  }

  /* The bibliography. Only files the document names, and only the first that
     reads — a document naming two resources gets both, concatenated in the
     order it named them, because that is what biber does. */
  const targets = bibTargets(source)
  const entries: BibEntry[] = []
  const problems: { line: number; why: string }[] = []
  let bib: string | null = null
  for (const target of targets) {
    if (bib === null) bib = target
    const path = confine(root, target)
    const text = path ? read(path) : null
    if (text === null) {
      problems.push({ line: 0, why: `${target} is named by the document and could not be read here` })
      continue
    }
    const parsed = parseBib(text)
    entries.push(...parsed.entries)
    problems.push(...parsed.problems)
  }

  const crossed: CrossReference = crossReference(
    entries.map((e) => e.key),
    cites,
  )

  const rows: CitationRow[] = entries.map((entry) => {
    const found = crossed.cited.get(entry.key)
    return {
      key: entry.key,
      type: entry.type,
      line: entry.line,
      times: found?.times ?? 0,
      where: found?.where ?? [],
      ...view(entry),
    }
  })

  return {
    epic,
    bib,
    files,
    rows,
    broken: crossed.broken,
    citesEverything: crossed.citesEverything,
    problems,
  }
}
