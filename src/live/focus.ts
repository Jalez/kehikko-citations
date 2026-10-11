import { pickedParts, type Anchors, type EpicPart } from 'kehikot-module-protocol'

/**
 * The parts of the epic a person ticked in the host's bar, as this list
 * follows them.
 *
 * The rule is the protocol's (`useFocus`). What is here is what only this
 * module knows: what anchors an entry. The page holds two lists — the
 * bibliography and the citations that name nothing — which are narrowed alike.
 *
 * Nothing is said about what the ticks put aside. A line under the toolbar
 * used to count it (`3 entries outside the picked part (Introduction).`) and
 * to say that the open entry was being held; it cost a row, the host's bar
 * already shows the ticks, and the entries drawn are the message. The one
 * sentence left is for a list the ticks EMPTIED, in the place the list would
 * be (`saidOfNone`), because an empty pane with no reason reads as broken.
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
 * focus. A broken citation has the same `where` and gets
 * the same answer.
 */
export function anchorOf(row: { where: readonly { file: string }[] }): Anchors {
  return row.where.map((w) => ({ file: w.file }))
}

/** The one sentence for a list the ticks emptied, drawn where the entries would have been. */
export function saidOfNone(parts: readonly EpicPart[]): string {
  return `No entry here is cited in the picked ${pickedParts(parts).length === 1 ? 'part' : 'parts'}.`
}
