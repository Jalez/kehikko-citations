/**
 * Which keys the prose actually names, and how that lines up with the file.
 *
 * ## The two questions this file exists for
 *
 * A bibliography and a document are two files, and neither one can answer a
 * question about the other. So:
 *
 *  - **An entry nobody cites.** It compiles, it is invisible in the PDF under
 *    most styles, and it is either a reading the author decided against or a
 *    citation they meant to make and did not. Both are worth seeing and neither
 *    is visible without holding the two files up against each other.
 *  - **A `\cite` naming an entry that is not there.** This one is a defect
 *    rather than a judgement: biblatex prints `?` where the citation should be
 *    and buries a warning in a log nobody reads until the PDF is already
 *    printed.
 *
 * Both are cross-references, both are pure functions of two strings, and both
 * are under test without a browser or a filesystem.
 *
 * ## Why this scans rather than parses
 *
 * The paper module has a real LaTeX parser and this deliberately does not reuse
 * it. Two reasons, and the second is the load-bearing one. First, that parser
 * lives in another repository and importing across module repositories is the
 * coupling these modules exist to avoid. Second, a parser reads a document into
 * BLOCKS, and this needs the opposite — every `\cite` anywhere, including ones
 * inside a table, a caption, a footnote and a `\todo` note the parser would
 * fold away. A scan sees all of them; a reading view is entitled not to.
 *
 * What the scan does have to get right is comments. `% \autocite{ghost}` is not
 * a citation, and counting it would report a key as cited that does not appear
 * in the PDF — the exact opposite of what this page is for.
 */

/** Every citation command this counts, biblatex's and BibTeX's together. */
export const CITE_COMMANDS = [
  'cite',
  'Cite',
  'autocite',
  'Autocite',
  'autocites',
  'parencite',
  'Parencite',
  'parencites',
  'textcite',
  'Textcite',
  'textcites',
  'citep',
  'citet',
  'citeal',
  'citealp',
  'citealt',
  'citeauthor',
  'Citeauthor',
  'citeyear',
  'citeyearpar',
  'citetitle',
  'footcite',
  'footcites',
  'footcitetext',
  'supercite',
  'fullcite',
  'smartcite',
  'nocite',
] as const

/** One key, named once, somewhere. */
export interface Cite {
  key: string
  /** The file it was written in, as the document names it. */
  file: string
  /** 1-based line, so a person can go and look. */
  line: number
  /** The command it was written with — `autocite`, `textcite`, `nocite`… */
  command: string
}

/**
 * Every citation key named in one `.tex` source.
 *
 * `\nocite{*}` is recognised and reported under the key `*`, because it is the
 * one command that means "cite everything" and a page that quietly counted it
 * as a citation of a key literally called `*` would report every entry as
 * uncited beside a document where none of them are. The caller decides what to
 * do with it; see `crossReference`.
 */
export function findCites(source: string, file: string): Cite[] {
  const stripped = withoutComments(source)
  const out: Cite[] = []
  const names = new Set<string>(CITE_COMMANDS)

  for (let i = 0; i < stripped.length; i += 1) {
    if (stripped[i] !== '\\') continue
    let j = i + 1
    while (j < stripped.length && /[a-zA-Z*]/.test(stripped[j]!)) j += 1
    const command = stripped.slice(i + 1, j)
    if (!names.has(command)) {
      /* Skip the whole command name either way, so `\citeauthor` is not then
         re-examined from its second character as `\citea…`. */
      i = j - 1
      continue
    }
    /* Optional arguments first: `\autocite[see][12]{key}` puts two of them
       between the command and the keys, and a scan that took the first braced
       group after the command would read `12` as a citation key on a document
       that compiles perfectly. */
    let k = j
    while (k < stripped.length) {
      while (k < stripped.length && /\s/.test(stripped[k]!)) k += 1
      if (stripped[k] !== '[') break
      const end = stripped.indexOf(']', k)
      if (end === -1) break
      k = end + 1
    }
    if (stripped[k] !== '{') {
      i = j - 1
      continue
    }
    const close = closingBrace(stripped, k)
    if (close === -1) {
      i = j - 1
      continue
    }
    const line = lineOf(stripped, i)
    for (const key of stripped.slice(k + 1, close).split(',')) {
      const trimmed = key.trim()
      if (trimmed) out.push({ key: trimmed, file, line, command })
    }
    i = close
  }
  return out
}

/**
 * The source with its comments blanked out, character for character.
 *
 * Blanked rather than removed, so every offset after this point is still an
 * offset into the original file and the line numbers this reports are the line
 * numbers in the author's editor. Deleting the comments would be simpler and
 * would make every reported line wrong by however many comment characters
 * preceded it — a page that sent somebody to the wrong line is worse than one
 * that sent them to no line at all.
 *
 * `\%` is an escaped percent sign and starts nothing.
 */
function withoutComments(source: string): string {
  const out = source.split('')
  for (let i = 0; i < out.length; i += 1) {
    if (out[i] === '\\') {
      i += 1
      continue
    }
    if (out[i] !== '%') continue
    while (i < out.length && out[i] !== '\n') {
      out[i] = ' '
      i += 1
    }
  }
  return out.join('')
}

function closingBrace(source: string, open: number): number {
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '\\') {
      i += 1
      continue
    }
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function lineOf(source: string, index: number): number {
  let n = 1
  for (let i = 0; i < index; i += 1) if (source[i] === '\n') n += 1
  return n
}

/** One place a key was named, condensed for the page. */
export interface Where {
  file: string
  line: number
  command: string
}

/** An entry in the file, with what the prose does about it. */
export interface Cited {
  key: string
  /** How many `\cite`s name it. Zero is the interesting number. */
  times: number
  /** Every place it is named, in document order. */
  where: Where[]
}

/** A `\cite` naming nothing. */
export interface Broken {
  key: string
  times: number
  where: Where[]
}

export interface CrossReference {
  /** Keyed by citation key, for every entry the bibliography holds. */
  cited: Map<string, Cited>
  /** Every key the prose names that the bibliography does not hold. */
  broken: Broken[]
  /** Whether the document contains a `\nocite{*}`. See below. */
  citesEverything: boolean
}

/**
 * The bibliography's keys against the document's, both ways.
 *
 * ## `\nocite{*}` is reported and not obeyed
 *
 * `\nocite{*}` puts every entry in the bibliography into the printed list. So
 * under a document that has one, "uncited" is not a defect and arguably not
 * even a fact — every entry appears. It would be easy to mark every entry cited
 * when this is seen, and that is the wrong call: it would mean a page that
 * silently reports thirty-seven citations where the prose contains none, and
 * the reader has no way to tell that from a document that really cites them
 * all. So the flag is carried, the counts stay true to the prose, and the page
 * says the sentence.
 *
 * ## Case
 *
 * Keys are compared exactly. BibTeX itself is case-insensitive about keys in
 * some implementations and biber is not, and guessing wrong in either direction
 * produces the failure this page exists to prevent — a broken citation reported
 * as fine, or a fine one reported as broken. Exact comparison agrees with biber,
 * which is what the corpus this was written against compiles with, and a
 * near-miss shows up as a broken cite beside an uncited entry with almost the
 * same name, which is a legible pair.
 */
export function crossReference(keys: readonly string[], cites: readonly Cite[]): CrossReference {
  const held = new Set(keys)
  const cited = new Map<string, Cited>()
  for (const key of keys) cited.set(key, { key, times: 0, where: [] })

  const brokenBy = new Map<string, Broken>()
  let citesEverything = false

  for (const cite of cites) {
    if (cite.key === '*') {
      citesEverything = true
      continue
    }
    const where: Where = { file: cite.file, line: cite.line, command: cite.command }
    if (held.has(cite.key)) {
      const row = cited.get(cite.key)!
      row.times += 1
      row.where.push(where)
      continue
    }
    const row = brokenBy.get(cite.key) ?? { key: cite.key, times: 0, where: [] }
    row.times += 1
    row.where.push(where)
    brokenBy.set(cite.key, row)
  }

  return { cited, broken: [...brokenBy.values()], citesEverything }
}
