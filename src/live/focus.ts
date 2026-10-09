import type { Anchors, Narrowed } from 'kehikot-module-protocol'

/**
 * The parts of the epic a person ticked in the host's bar, as this list
 * follows them.
 *
 * The rule, the count and the sentence are the protocol's (`useFocus`). What
 * is here is the two things only this module knows: what anchors an entry,
 * and that the page holds two lists — the bibliography and the citations that
 * name nothing — which are narrowed alike and said in one line.
 *
 * It narrows what the page DRAWS. What the page asks its server for is
 * unchanged, and so is the MCP door: an agent has no canvas and reads every
 * entry.
 */

/**
 * What ties an entry to a part: every file of the paper that cites it.
 *
 * `where[].file` is the name `store.ts` read the file by — `main.tex`, or an
 * `\input` target with its extension — which is relative to the paper's
 * folder, the name a part's `files` holds. An entry is in front when ANY file
 * citing it is. One cited nowhere answers `[]`: no anchor, outside every
 * focus, and counted there. A broken citation has the same `where` and gets
 * the same answer.
 */
export function anchorOf(row: { where: readonly { file: string }[] }): Anchors {
  return row.where.map((w) => ({ file: w.file }))
}

type Said = Narrowed<unknown> & { sentence: string }

/**
 * The one line under the toolbar, or `''` when nothing is ticked.
 *
 * The protocol's sentence about the entries; that the open entry is being held
 * though it is outside; and the protocol's sentence again about the broken
 * citations, only when the document has any (`anyBroken`) — "0 broken
 * citations outside" under a document with none would be a line about nothing.
 */
export function focusNote(entries: Said, broken: Said, anyBroken: boolean): string {
  if (!entries.sentence) return ''
  return [
    entries.sentence,
    entries.kept ? 'The one you have open is among them, and stays until you close it.' : '',
    anyBroken ? broken.sentence : '',
  ]
    .filter(Boolean)
    .join(' ')
}
