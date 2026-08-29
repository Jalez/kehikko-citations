/**
 * A BibTeX bibliography, read.
 *
 * ## Why this is hand-written and not a library
 *
 * BibTeX's grammar is small and its edge cases are all about BRACES, which is
 * the one thing a regular expression cannot do. `title = {{AutoTutor}: A Tutor
 * with Dialogue}` has a braced group inside a braced value; a regex ending at
 * the first `}` cuts the title to `{AutoTutor` and the page then shows half a
 * title with nothing on screen saying it is half of one. So the value scanner
 * below counts depth, the way `store.ts` in the paper module counts it for
 * `\title{}`, and for the same reason.
 *
 * The other half of the answer is that this file has to be a PURE function over
 * a string with no filesystem and no browser in it. It is the thing the tests
 * are about and it is imported by the server; the page never runs it. Keeping
 * it dependency-free is what makes `bun test` able to cover the whole of it in
 * milliseconds without a DOM.
 *
 * ## What is deliberately not done here
 *
 * - **No `@string` expansion.** A `@string{acm = {ACM Press}}` followed by
 *   `publisher = acm` is legal BibTeX. It is not expanded; the value is
 *   recorded as the bare word `acm`, and `@string` definitions are collected so
 *   a caller could say so. Expanding them would be easy and would make this
 *   file a BibTeX INTERPRETER, which is a thing with its own bugs; recording
 *   what is written is a thing without them. No entry in the corpus this was
 *   written against uses one, and if one appears the venue column shows `acm`
 *   rather than a wrong publisher.
 * - **No LaTeX in values is rendered.** `{\"o}` stays `{\"o}` except for the
 *   brace-stripping in `plain()`, because this list sits beside a document
 *   whose own reader renders LaTeX and two renderers disagreeing about one
 *   author's name is worse than one that visibly does not try.
 * - **No sorting and no filtering.** Entries come back in the order they are
 *   written in the file, because that is a fact about the file. Ordering is
 *   `src/live/order.ts` and it happens when somebody asks.
 */

/** One `@type{key, …}` record, exactly as the file writes it. */
export interface BibEntry {
  /** The citation key: what a `\cite{…}` names. */
  key: string
  /** `article`, `inproceedings`, `misc`… lower-cased. */
  type: string
  /** Every field, lower-cased name to brace-stripped value. */
  fields: Record<string, string>
  /** 1-based line the `@` sits on, so a person can find it in their editor. */
  line: number
}

/** What a whole `.bib` file turned out to hold. */
export interface Bibliography {
  entries: BibEntry[]
  /** `@string{…}` names defined in the file. Recorded, never expanded. */
  strings: string[]
  /**
   * Things this file could not read, each with the line it gave up on.
   *
   * Surfaced rather than swallowed. A `.bib` with an unbalanced brace is a file
   * that will also fail to compile, and a page that silently showed thirty-six
   * of thirty-seven entries would be hiding the one thing the author most needs
   * to know about their bibliography.
   */
  problems: { line: number; why: string }[]
}

/** Where an entry sorts and what it is called, for a reader rather than for BibTeX. */
export interface BibView {
  /** `author`, or `editor` when there is no author, or null. Never invented. */
  author: string | null
  /** The four-digit year, if the entry gives one that looks like one. */
  year: number | null
  /** `title`, brace-stripped. */
  title: string | null
  /**
   * Where it appeared: `journal`, else `booktitle`, else `publisher`, else
   * `school`, else `institution`, else `howpublished`.
   *
   * One column for six fields because a reader scanning a bibliography wants
   * "where was this" and does not care which BibTeX field the author reached
   * for. The order is by specificity — a journal article's journal beats its
   * publisher — and the field that answered is kept so the page can say which
   * one it read rather than presenting a school as a venue with no hint.
   */
  venue: string | null
  venueField: string | null
}

const OPENERS: Record<string, string> = { '{': '}', '(': ')' }

/**
 * Read a whole `.bib` file.
 *
 * Scans for `@` at the start of an entry and walks each one; anything between
 * entries is a comment as far as BibTeX is concerned and is skipped without
 * complaint. A `%` at the start of a line is skipped too — it is not BibTeX's
 * comment character, strictly, but every `.bib` in the wild uses it and the
 * corpus this was written against opens with four lines of it.
 */
export function parseBib(source: string): Bibliography {
  const entries: BibEntry[] = []
  const strings: string[] = []
  const problems: { line: number; why: string }[] = []

  /* Line numbers are computed from an offset rather than tracked in the scan,
     because the scan skips around and a counter that was incremented in some
     branches and not others reports the wrong line in exactly the case a person
     is using it: a file with a problem in it. */
  const lineAt = (index: number) => {
    let n = 1
    for (let i = 0; i < index && i < source.length; i += 1) if (source[i] === '\n') n += 1
    return n
  }

  let i = 0
  while (i < source.length) {
    const at = source.indexOf('@', i)
    if (at === -1) break
    /* `@` inside an e-mail address in a comment, or inside a value this scan
       has already walked past, is not an entry. An entry's `@` is followed by
       letters and then an opening delimiter. */
    let j = at + 1
    while (j < source.length && /[a-zA-Z]/.test(source[j]!)) j += 1
    const type = source.slice(at + 1, j).toLowerCase()
    let k = j
    while (k < source.length && /\s/.test(source[k]!)) k += 1
    const open = source[k]
    if (!type || !open || !(open in OPENERS)) {
      i = at + 1
      continue
    }
    const close = matching(source, k)
    if (close === -1) {
      problems.push({ line: lineAt(at), why: `@${type} is never closed` })
      break
    }
    const body = source.slice(k + 1, close)
    i = close + 1

    if (type === 'comment' || type === 'preamble') continue
    if (type === 'string') {
      const name = body.split('=')[0]?.trim()
      if (name) strings.push(name)
      continue
    }

    const entry = readEntry(type, body, lineAt(at))
    if ('why' in entry) problems.push({ line: lineAt(at), why: entry.why })
    else entries.push(entry)
  }

  return { entries, strings, problems }
}

/** The index of the delimiter matching the one at `open`, or -1. */
function matching(source: string, open: number): number {
  const opener = source[open]!
  const closer = OPENERS[opener]!
  let depth = 0
  let inQuotes = false
  for (let i = open; i < source.length; i += 1) {
    const c = source[i]
    /* An escaped character never opens or closes anything. `{\}}` is a literal
       brace in a value and a naive depth count reads it as the end of the
       entry, taking the rest of the bibliography with it. */
    if (c === '\\') {
      i += 1
      continue
    }
    if (c === '"' && depth === 1) inQuotes = !inQuotes
    if (inQuotes) continue
    if (c === opener) depth += 1
    else if (c === closer) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** The inside of one `@type{…}`, split into a key and fields. */
function readEntry(type: string, body: string, line: number): BibEntry | { why: string } {
  const comma = firstTopLevelComma(body)
  const key = (comma === -1 ? body : body.slice(0, comma)).trim()
  if (!key) return { why: `@${type} has no citation key` }
  /* A key with whitespace or a brace in it is not a key any `\cite` can name,
     and treating it as one would put a row on the page that no citation could
     ever match — reported for ever as uncited, with no way to fix it that is
     visible from the page. */
  if (/[\s{}(),]/.test(key)) return { why: `"${key}" is not usable as a citation key` }

  const fields: Record<string, string> = {}
  if (comma !== -1) {
    for (const chunk of splitTopLevel(body.slice(comma + 1))) {
      const eq = chunk.indexOf('=')
      if (eq === -1) continue
      const name = chunk.slice(0, eq).trim().toLowerCase()
      if (!name) continue
      /* Last one wins, which is BibTeX's own rule and also the only one that
         does not require deciding which of two `year` fields the author meant. */
      fields[name] = plain(chunk.slice(eq + 1).trim())
    }
  }
  return { key, type, fields, line }
}

/** The first comma not inside braces or quotes, or -1. */
function firstTopLevelComma(body: string): number {
  let depth = 0
  let inQuotes = false
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i]
    if (c === '\\') {
      i += 1
      continue
    }
    if (c === '"' && depth === 0) inQuotes = !inQuotes
    if (inQuotes) continue
    if (c === '{') depth += 1
    else if (c === '}') depth -= 1
    else if (c === ',' && depth === 0) return i
  }
  return -1
}

/** Field chunks, split on commas that are not inside braces or quotes. */
function splitTopLevel(body: string): string[] {
  const out: string[] = []
  let start = 0
  let depth = 0
  let inQuotes = false
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i]
    if (c === '\\') {
      i += 1
      continue
    }
    if (c === '"' && depth === 0) inQuotes = !inQuotes
    if (inQuotes) continue
    if (c === '{') depth += 1
    else if (c === '}') depth -= 1
    else if (c === ',' && depth === 0) {
      out.push(body.slice(start, i))
      start = i + 1
    }
  }
  out.push(body.slice(start))
  return out.map((s) => s.trim()).filter(Boolean)
}

/**
 * A field value with its delimiters and its line breaks taken off.
 *
 * BibTeX values are wrapped in braces or quotes, wrap across lines with
 * whatever indentation the author used, and carry braces inside them to protect
 * capitalisation. The wrapper comes off, the inner braces come off, and runs of
 * whitespace become one space — because a `.bib` author breaks an author list
 * over four lines and a table cell showing those breaks would be four lines
 * tall for no reason.
 *
 * The inner braces are stripped rather than kept, which loses the "do not
 * lowercase this" information they carry. That information is for BibTeX's
 * style processor; nothing here lowercases anything, so keeping the braces would
 * only put `{AutoTutor}` on screen where the author meant `AutoTutor`.
 */
function plain(raw: string): string {
  let value = raw.trim()
  /* A trailing comma from the last field before `}` is common and harmless. */
  if (value.endsWith(',')) value = value.slice(0, -1).trim()
  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('"') && value.endsWith('"'))) {
    value = value.slice(1, -1)
  }
  return value.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * The four things a reader wants off an entry, and nothing invented.
 *
 * Every one of them can be null, and each null means the same thing: the entry
 * does not say. A bibliography with an entry missing a year is a real state of
 * a real file — it is the state most `.bib` files are in halfway through — and
 * a page that filled the gap with "n.d." would be writing into somebody's
 * bibliography rather than reading it.
 */
export function view(entry: BibEntry): BibView {
  const year = entry.fields.year ?? entry.fields.date ?? ''
  const match = /\b(1[0-9]{3}|2[0-9]{3})\b/.exec(year)
  const venueOrder = ['journal', 'booktitle', 'publisher', 'school', 'institution', 'howpublished'] as const
  let venue: string | null = null
  let venueField: string | null = null
  for (const field of venueOrder) {
    const value = entry.fields[field]
    if (value) {
      venue = value
      venueField = field
      break
    }
  }
  return {
    author: entry.fields.author ?? entry.fields.editor ?? null,
    year: match ? Number(match[1]) : null,
    title: entry.fields.title ?? null,
    venue,
    venueField,
  }
}

/**
 * The surname of the first author, for sorting and for a short label.
 *
 * Handles the two forms BibTeX allows — `Graesser, Arthur C.` and `Arthur C.
 * Graesser` — and nothing else, because there is no third form and a fallback
 * that guessed at one would sort somebody under their middle initial. When it
 * cannot tell, it returns the whole string, which sorts somewhere defensible
 * and is visibly the author's name rather than a wrong piece of it.
 */
export function firstSurname(author: string | null): string {
  if (!author) return ''
  const first = author.split(/\s+and\s+/i)[0]?.trim() ?? ''
  if (!first) return ''
  if (first.includes(',')) return first.split(',')[0]!.trim()
  const words = first.split(/\s+/)
  return words[words.length - 1] ?? first
}
