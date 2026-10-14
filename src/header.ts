import { type HeaderItemInput, LIMITS } from 'kehikot-module-protocol'

import type { Brief } from '../store.ts'
import { ORDER_LABELS, type Ordering } from './live/order.ts'
import { type Standing } from './live/sift.ts'

/**
 * What this page declares for the container's header (`kehikot.header`).
 *
 * The host draws these in its View menu, so the page spends no row on the standing pills, the
 * order select or the document picker. The search stays in the page: the header carries no free
 * text. The count ("12 of 37") stays beside it, because a filter is only allowed to hide a row
 * with the count of what it hid on screen (`live/sift.ts`).
 *
 * A pure function of what the page has read. It is declared again only when its JSON differs: the
 * query is not in it, so typing in the search declares nothing.
 *
 * Ids: `document`, `standing`, `order`. A document's option is `d<n>` by its place in the list —
 * an epic's name could be longer than an id may be.
 */
export const STANDING_LABELS: Record<Standing, string> = { all: 'All', cited: 'Cited', uncited: 'Uncited' }

export interface HeaderState {
  documents: readonly Pick<Brief, 'epic' | 'title'>[]
  /** Which document is on screen. */
  showing: string | null
  /** The filter and the order are drawn only while a bibliography is. */
  list: { standing: Standing; ordering: Ordering } | null
}

const cut = (text: string, max: number = LIMITS.HEADER_LABEL) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

export function headerOf(state: HeaderState): HeaderItemInput[] {
  const items: HeaderItemInput[] = []
  const docs = state.documents.slice(0, LIMITS.HEADER_OPTIONS)
  if (docs.length > 1) {
    const at = docs.findIndex((one) => one.epic === state.showing)
    const options = docs.map((one, i) => ({ id: `d${i}`, label: cut(one.epic) }))
    /* A switch has a value that is one of its options; where none is on screen, it is a jump. */
    items.push(
      at >= 0
        ? { kind: 'switch', id: 'document', label: 'Document', icon: 'library', agents: true, value: `d${at}`, options }
        : { kind: 'go', id: 'document', label: 'Document', icon: 'library', agents: true, options },
    )
  }
  if (state.list) {
    items.push({
      kind: 'switch',
      id: 'standing',
      label: 'Show',
      icon: 'filter',
      agents: true,
      value: state.list.standing,
      options: (Object.keys(STANDING_LABELS) as Standing[]).map((id) => ({ id, label: STANDING_LABELS[id] })),
    })
    items.push({
      kind: 'switch',
      id: 'order',
      label: 'Order',
      icon: 'arrow-down-up',
      agents: true,
      value: state.list.ordering,
      options: (Object.keys(ORDER_LABELS) as Ordering[]).map((id) => ({ id, label: cut(ORDER_LABELS[id]) })),
    })
  }
  return items
}
