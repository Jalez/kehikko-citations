import type { Anchors } from 'kehikot-module-protocol'

/**
 * The parts of the epic a person picked out in the host's bar, as this page
 * follows them.
 *
 * The rule is the protocol's (`useFocus().narrow`). What is here is what only
 * this module knows: what ties an entry to a part, and what is in hand. The
 * page holds two lists — the bibliography and the citations that name nothing
 * — and both are narrowed alike, with the same anchor and the same thing kept.
 *
 * Nothing is said about what a pick puts aside. The one sentence there is, is
 * the protocol's, for a list the pick EMPTIED, in the place the list would be
 * (`narrow(...).empty`: `No entry is in the picked part.`), because an empty
 * pane with no reason reads as broken.
 *
 * It narrows what the page DRAWS. What the page asks its server for is
 * unchanged, and so is the MCP door: an agent has no canvas and reads every
 * entry.
 */

/** What one item is called in the protocol's sentence for an empty view. */
export const NOUN = 'entry'

/**
 * What ties an entry to a part: every file of the document that cites it.
 *
 * `where[].file` is the name `store.ts` read the file by — `main.tex`, or an
 * `\input` target with its extension — relative to the document's own folder.
 * `dir` is that folder, relative to the project, so `<dir>/<file>` is the name
 * a part lists a document by, whoever keeps the document. An entry is in front
 * when ANY file citing it is. One cited nowhere answers `[]`: no anchor, in no
 * part. A broken citation has the same `where` and gets the same answer.
 *
 * A server older than `dir` does not say it. The file's own name is answered
 * then, which is how a part named its files before documents.
 */
export function anchorOf(row: { where: readonly { file: string }[] }, dir?: string | null): Anchors {
  return row.where.map((w) => ({ file: dir ? `${dir}/${w.file}` : w.file }))
}

/** What is in hand on either list: the entry a person has open. A tick elsewhere does not close it. */
export const inHand = (row: { key: string }, open: string | null): boolean => row.key === open
