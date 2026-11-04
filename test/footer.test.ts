import { describe, expect, test } from 'bun:test'
import { footerItemsSchema, LIMITS } from 'kehikot-module-protocol'

import { footerItems, type FooterState } from '../src/live/footer.ts'

const base: FooterState = { document: 'thesis', bib: 'refs.bib', sift: null, broken: 0, problems: 0, unlisted: 0 }
const ids = (state: FooterState) => footerItems(state).map((one) => one.id)
const item = (state: FooterState, id: string) => footerItems(state).find((one) => one.id === id) as Record<string, unknown> | undefined

describe('the footer this page declares', () => {
  test('is a list the protocol reads, in every state, however long the words', () => {
    const long = 'x'.repeat(900)
    const states: FooterState[] = [
      base,
      { ...base, document: null, bib: null },
      { ...base, bib: null },
      { document: long, bib: long, sift: { query: 'q'.repeat(5000), shown: 3, total: 40, narrowed: true }, broken: 2, problems: 1, unlisted: 3 },
    ]
    for (const state of states) expect(footerItemsSchema.safeParse(footerItems(state)).success).toBe(true)
    expect((item(states[3]!, 'document')!.text as string).length).toBe(LIMITS.FOOTER_TEXT)
  })

  test('the document and its .bib; nothing at all with no document on screen', () => {
    expect(item(base, 'document')!.text).toBe('thesis · refs.bib')
    expect(item({ ...base, bib: null }, 'document')!.text).toBe('thesis')
    expect(footerItems({ ...base, document: null, bib: null })).toEqual([])
  })

  test('the search with both numbers beside it, and Show everything only while something is hidden', () => {
    const sift = { query: '', shown: 37, total: 37, narrowed: false }
    expect(ids({ ...base, sift })).toEqual(['document', 'search', 'count'])
    expect(item({ ...base, sift }, 'search')).toMatchObject({ kind: 'input', value: '', grow: true })
    expect(item({ ...base, sift }, 'count')!.text).toBe('37 of 37')
    const narrowed = { ...base, sift: { query: 'graesser', shown: 2, total: 37, narrowed: true } }
    expect(ids(narrowed)).toEqual(['document', 'search', 'count', 'everything'])
    expect(item(narrowed, 'search')!.value).toBe('graesser')
  })

  test('what is wrong, said with how worried to be; the epics without a document go first', () => {
    const state = { ...base, broken: 1, problems: 2, unlisted: 3 }
    expect(item(state, 'broken')).toMatchObject({ text: '1 citation names nothing', level: 'critical' })
    expect(item({ ...state, broken: 2 }, 'broken')!.text).toBe('2 citations name nothing')
    expect(item(state, 'problems')).toMatchObject({ text: '2 things unreadable', level: 'warn' })
    expect(item(state, 'unlisted')).toMatchObject({ text: '3 epics without a document', optional: true })
  })
})
