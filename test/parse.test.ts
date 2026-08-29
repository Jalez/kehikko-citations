import { describe, expect, test } from 'bun:test'

import { firstSurname, parseBib, view } from '../bib/parse.ts'

/**
 * The `.bib` reader, which is a pure function over a string.
 *
 * No filesystem, no DOM, no server. That is the point of the file being pure:
 * the two things this module claims — which entries exist, and which of them
 * nothing cites — are both decided here and in `cite.ts`, and both are decidable
 * in milliseconds without a browser.
 *
 * The cases below are the ones that were actually wrong in a hand-written
 * parser, in the order they were found.
 */

describe('reading entries', () => {
  test('a plain entry comes back with its key, type and fields', () => {
    const { entries } = parseBib(`
@article{graesser2004autotutor,
  author  = {Graesser, Arthur C. and Lu, Shulan},
  title   = {AutoTutor: A Tutor with Dialogue},
  journal = {Behavior Research Methods},
  year    = {2004}
}
`)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.key).toBe('graesser2004autotutor')
    expect(entries[0]!.type).toBe('article')
    expect(entries[0]!.fields.year).toBe('2004')
  })

  test('a braced group inside a value does not end the value', () => {
    /*
     * The bug a regex has and cannot not have. `title = {{AutoTutor}: A Tutor}`
     * ended at the first `}` and the page then showed `{AutoTutor` — half a
     * title with nothing on screen saying it was half of one.
     */
    const { entries } = parseBib('@article{k,\n title = {{AutoTutor}: A Tutor with Dialogue},\n year = {2004}\n}')
    expect(entries[0]!.fields.title).toBe('AutoTutor: A Tutor with Dialogue')
    expect(entries[0]!.fields.year).toBe('2004')
  })

  test('a comma inside a value does not split the fields', () => {
    const { entries } = parseBib('@book{k,\n author = {Lastname, Firstname and Other, Second},\n year = {1999}\n}')
    expect(entries[0]!.fields.author).toBe('Lastname, Firstname and Other, Second')
    expect(entries[0]!.fields.year).toBe('1999')
  })

  test('quoted values are read and their commas do not split either', () => {
    const { entries } = parseBib('@misc{k,\n title = "One, two, three",\n year = "2020"\n}')
    expect(entries[0]!.fields.title).toBe('One, two, three')
    expect(entries[0]!.fields.year).toBe('2020')
  })

  test('a value broken over lines becomes one line', () => {
    /* A `.bib` author wraps an author list over four lines. A table cell showing
       those breaks would be four rows tall for no reason. */
    const { entries } = parseBib('@article{k,\n  author = {One, A. and\n             Two, B. and\n             Three, C.}\n}')
    expect(entries[0]!.fields.author).toBe('One, A. and Two, B. and Three, C.')
  })

  test('an escaped brace inside a value does not close the entry', () => {
    const { entries } = parseBib('@misc{k,\n title = {A \\{ brace},\n year = {2001}\n}\n@misc{j, year = {2002}}')
    expect(entries.map((e) => e.key)).toEqual(['k', 'j'])
  })

  test('a % line and free text between entries are skipped without complaint', () => {
    const { entries, problems } = parseBib(`
% references.bib — written by hand
% ------------------------------------

@misc{a, year = {2000}}

Some stray prose nobody meant to leave here.

@misc{b, year = {2001}}
`)
    expect(entries.map((e) => e.key)).toEqual(['a', 'b'])
    expect(problems).toEqual([])
  })

  test('@comment and @preamble are not entries', () => {
    const { entries } = parseBib('@comment{ignore me}\n@preamble{"\\newcommand{\\x}{y}"}\n@misc{a, year={2000}}')
    expect(entries.map((e) => e.key)).toEqual(['a'])
  })

  test('@string is recorded and never expanded', () => {
    /* Expanding would make this a BibTeX interpreter, which is a thing with its
       own bugs. Recording what is written is a thing without them, and a venue
       showing `acm` is visibly a bare name rather than a wrong publisher. */
    const { entries, strings } = parseBib('@string{acm = {ACM Press}}\n@book{a, publisher = acm, year = {2000}}')
    expect(strings).toEqual(['acm'])
    expect(entries[0]!.fields.publisher).toBe('acm')
  })

  test('entries keep the order the file writes them in', () => {
    const { entries } = parseBib('@misc{c,year={1}}\n@misc{a,year={2}}\n@misc{b,year={3}}')
    expect(entries.map((e) => e.key)).toEqual(['c', 'a', 'b'])
  })

  test('the line number is the line the @ is on', () => {
    const { entries } = parseBib('\n\n\n@misc{a, year = {2000}}\n')
    expect(entries[0]!.line).toBe(4)
  })
})

describe('what cannot be read is said out loud', () => {
  test('an unclosed entry is a problem rather than a silent truncation', () => {
    /* A `.bib` with an unbalanced brace will also fail to compile. A page
       silently showing one of two entries would hide the thing the author most
       needs to know about their bibliography. */
    const { entries, problems } = parseBib('@misc{a, year = {2000}}\n@article{b,\n  title = {never closed\n')
    expect(entries.map((e) => e.key)).toEqual(['a'])
    expect(problems).toHaveLength(1)
    expect(problems[0]!.why).toContain('never closed')
  })

  test('a key no \\cite could ever name is refused rather than listed as uncited forever', () => {
    const { entries, problems } = parseBib('@misc{a key with spaces, year = {2000}}')
    expect(entries).toEqual([])
    expect(problems[0]!.why).toContain('not usable as a citation key')
  })

  test('an entry with no key at all is a problem', () => {
    const { problems } = parseBib('@misc{, year = {2000}}')
    expect(problems).toHaveLength(1)
  })
})

describe('the four things a reader wants, none of them invented', () => {
  test('year is the four digits in the field and null when there are none', () => {
    expect(view(parseBib('@misc{a, year = {2004}}').entries[0]!).year).toBe(2004)
    expect(view(parseBib('@misc{a, year = {in press}}').entries[0]!).year).toBeNull()
    expect(view(parseBib('@misc{a}').entries[0]!).year).toBeNull()
  })

  test('a date field answers when there is no year', () => {
    expect(view(parseBib('@misc{a, date = {2019-04-01}}').entries[0]!).year).toBe(2019)
  })

  test('editor answers when there is no author, and neither is invented', () => {
    expect(view(parseBib('@book{a, editor = {Someone}}').entries[0]!).author).toBe('Someone')
    expect(view(parseBib('@book{a}').entries[0]!).author).toBeNull()
  })

  test('the venue column names which field it read', () => {
    /* Six fields feed one column, and a school presented as a venue with no
       hint is a small lie the reader cannot check. */
    const journal = view(parseBib('@article{a, journal = {JAIED}, publisher = {Springer}}').entries[0]!)
    expect(journal.venue).toBe('JAIED')
    expect(journal.venueField).toBe('journal')
    const thesis = view(parseBib('@phdthesis{a, school = {Tampere University}}').entries[0]!)
    expect(thesis.venue).toBe('Tampere University')
    expect(thesis.venueField).toBe('school')
    const nothing = view(parseBib('@misc{a}').entries[0]!)
    expect(nothing.venue).toBeNull()
    expect(nothing.venueField).toBeNull()
  })
})

describe('the surname, for sorting', () => {
  test.each([
    ['Graesser, Arthur C.', 'Graesser'],
    ['Arthur C. Graesser', 'Graesser'],
    ['Graesser, Arthur C. and Lu, Shulan', 'Graesser'],
    ['Arthur C. Graesser and Shulan Lu', 'Graesser'],
  ])('%p sorts under %p', (author, surname) => {
    expect(firstSurname(author)).toBe(surname)
  })

  test('a corporate author sorts under its last word, and that is a known limit', () => {
    /*
     * `author = {{Association for Computing Machinery}}` is BibTeX's way of
     * saying "this is one name, do not split it", and by the time the value
     * reaches here `plain()` has taken the protecting braces off — so it sorts
     * under `Machinery`.
     *
     * Written down as a test rather than left to be discovered, because the
     * alternative is worse in both directions: keeping the braces would put
     * `{ACM}` on screen where the author meant `ACM`, and special-casing "looks
     * corporate" would be this file guessing at which strings are people. The
     * name is drawn in full and correctly; only its sort position is odd, and
     * the `key` order is one press away.
     */
    const [entry] = parseBib('@book{a, author = {{Association for Computing Machinery}}}').entries
    expect(view(entry!).author).toBe('Association for Computing Machinery')
    expect(firstSurname(view(entry!).author)).toBe('Machinery')
  })

  test('no author is an empty string rather than a guess', () => {
    expect(firstSurname(null)).toBe('')
  })
})
