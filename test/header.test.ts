import { describe, expect, test } from 'bun:test'
import { headerItemsSchema } from 'kehikot-module-protocol'

import { headerOf, type HeaderState } from '../src/header.ts'

const docs = [{ epic: 'thesis', title: null }, { epic: 'notes', title: null }]
const base: HeaderState = { documents: docs, showing: 'thesis', list: { standing: 'all', ordering: 'file' } }

describe('the header this page declares', () => {
  test('is a list the protocol reads, in every state', () => {
    for (const state of [base, { ...base, list: null }, { ...base, showing: null }, { ...base, documents: [] }]) {
      expect(() => headerItemsSchema.parse(headerOf(state))).not.toThrow()
    }
  })

  test('the documents, the standing and the order are switches; the search is not here', () => {
    const items = headerOf(base)
    expect(items.map((one) => `${one.kind}:${one.id}`)).toEqual(['switch:document', 'switch:standing', 'switch:order'])
    expect(items.every((one) => one.agents === true)).toBe(true)
    expect(items[0]).toMatchObject({ value: 'd0' })
    expect((items[2] as { options: { id: string }[] }).options.map((one) => one.id)).toEqual(['file', 'author', 'year', 'cited', 'key'])
  })

  test('one document is nothing to choose between, and no bibliography is nothing to filter', () => {
    expect(headerOf({ ...base, documents: docs.slice(0, 1) }).map((one) => one.id)).toEqual(['standing', 'order'])
    expect(headerOf({ ...base, list: null }).map((one) => one.id)).toEqual(['document'])
  })

  test('a document that is not among the listed ones leaves the picker a switch, resting on "No document open"', () => {
    const one = headerOf({ ...base, showing: 'elsewhere' })[0] as { kind: string; value: string; options: { id: string }[] }
    expect(one).toMatchObject({ kind: 'switch', id: 'document', value: 'none' })
    expect(one.options.map((o) => o.id)).toEqual(['none', ...docs.map((_, i) => `d${i}`)])
    expect(() => headerItemsSchema.parse([one])).not.toThrow()
  })

  test('is the same list whatever is typed: the query is not in it', () => {
    const one = JSON.stringify(headerOf(base))
    expect(JSON.stringify(headerOf({ ...base }))).toBe(one)
    expect(JSON.stringify(headerOf({ ...base, list: { standing: 'cited', ordering: 'file' } }))).not.toBe(one)
  })
})
