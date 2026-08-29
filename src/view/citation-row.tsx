import { useState } from 'react'

import type { BrokenRow, CitationRow } from '../../store.ts'
import { cn } from '@/lib/utils.ts'

/**
 * One entry in the bibliography, drawn.
 *
 * ## The `whitespace-nowrap` trap, and why there is no Badge here
 *
 * shadcn's `Badge` carries `whitespace-nowrap` in its base class. A sibling
 * module in this workspace put a four-hundred-character string in one and gave
 * the pane a twelve-hundred-pixel min-content floor under a two-hundred-and-
 * twenty-pixel pane: the whole list scrolled sideways and nothing on screen
 * looked wrong. A paper title is exactly that kind of string — the corpus this
 * was written against has titles over a hundred and forty characters — and so
 * is a venue, and so is an author list with nine names in it.
 *
 * So the long strings on this row are never in a badge. They are in plain
 * elements with `break-words`, and the only nowrap thing here is the count,
 * which is at most four characters. The rule to keep: a badge is for a word you
 * chose, never for a string a file gave you.
 *
 * ## Why the whole row is a button and the selection stays here
 *
 * Pressing a row expands it in place and nothing leaves this pane. The
 * manifest's essay says why at length: the protocol's `selection` carries refs
 * with no kinds, every module that reads it agrees what a ref is, and a
 * citation key is not one. Putting `graesser2004autotutor` into the canvas
 * selection would hand every other module a string it will look up in a tracker
 * and fail to find — a failure nobody sees as a failure.
 */
export function Row({ row, open, onToggle }: { row: CitationRow; open: boolean; onToggle: () => void }) {
  const uncited = row.times === 0
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          'flex w-full items-start gap-2 px-2 py-2 text-left',
          'hover:bg-accent focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
        )}
      >
        {/*
          * The count, which is the column this page exists for.
          *
          * Fixed width so the titles beside it line up, `tabular-nums` so 1 and
          * 11 sit in the same place, and the ONE nowrap thing on the row — it
          * is never longer than `x99+`, so it cannot be the element that sets a
          * min-content floor.
          */}
        <span
          className={cn(
            'mt-[0.15rem] w-9 shrink-0 text-center font-mono text-[0.7rem] tabular-nums whitespace-nowrap',
            uncited ? 'text-destructive' : 'text-muted-foreground',
          )}
          title={uncited ? 'Nothing in the prose cites this entry' : `Cited ${row.times}×`}
        >
          {uncited ? '—' : `×${row.times}`}
        </span>
        <span className="min-w-0 flex-1">
          {/* `break-words` and `min-w-0` together. Either alone leaves a long
              title able to set the flex item's min-content width, which is the
              trap this file's header is about. */}
          <span className="block text-[0.82rem] leading-snug font-medium break-words">
            {row.title ?? <span className="text-muted-foreground italic">no title in the .bib</span>}
          </span>
          <span className="mt-0.5 block text-[0.72rem] leading-snug break-words text-muted-foreground">
            {row.author ?? 'no author'}
            {row.year !== null && ` · ${row.year}`}
          </span>
          {open && (
            <span className="mt-2 block space-y-1 text-[0.7rem] leading-relaxed text-muted-foreground">
              <span className="block font-mono break-all">{row.key}</span>
              {row.venue && (
                <span className="block break-words">
                  {row.venue}
                  {/* Which field answered, because six fields feed one column
                      and a school presented as a venue with no hint is a small
                      lie the reader cannot check. */}
                  <span className="opacity-60"> ({row.venueField})</span>
                </span>
              )}
              <span className="block">
                @{row.type} · line {row.line} of the .bib
              </span>
              {uncited ? (
                <span className="block text-destructive">
                  No \cite anywhere in this document names it. That is either a reading decided against or a
                  citation that was meant to be made.
                </span>
              ) : (
                <span className="block">
                  {row.where.slice(0, 8).map((w) => (
                    <span key={`${w.file}:${w.line}:${w.command}`} className="block font-mono break-all">
                      {w.file}:{w.line} \{w.command}
                    </span>
                  ))}
                  {/* The count is already on the row, so a truncated list has to
                      say it is truncated rather than quietly disagreeing with
                      the number beside it. */}
                  {row.where.length > 8 && <span className="block italic">and {row.where.length - 8} more</span>}
                </span>
              )}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

/**
 * A `\cite` naming nothing, which is a defect rather than a judgement.
 *
 * Drawn above the list rather than in it, because it is not an entry — it is a
 * key in the prose with no row behind it. Folding the two lists together would
 * mean pressing "uncited" hid the broken citations, which are the most urgent
 * thing on this page: biblatex prints a `?` where the citation should be, and
 * buries the warning in a log nobody reads until the PDF is already printed.
 */
export function BrokenList({ broken }: { broken: BrokenRow[] }) {
  const [open, setOpen] = useState(true)
  if (!broken.length) return null
  return (
    <section className="mb-2 rounded-md border border-destructive/50 bg-destructive/5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[0.75rem] font-medium text-destructive focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"
      >
        <span aria-hidden className="w-9 shrink-0 text-center font-mono">
          {open ? '▾' : '▸'}
        </span>
        <span className="min-w-0 flex-1 break-words">
          {broken.length} citation{broken.length === 1 ? '' : 's'} name nothing in the .bib
        </span>
      </button>
      {open && (
        <ul className="px-2 pb-2">
          {broken.map((b) => (
            <li key={b.key} className="flex items-start gap-2 py-1 text-[0.72rem] leading-snug">
              <span className="w-9 shrink-0 text-center font-mono tabular-nums whitespace-nowrap text-destructive">
                ×{b.times}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono break-all text-destructive">{b.key}</span>
                <span className="block break-all text-muted-foreground">
                  {b.where[0]?.file}:{b.where[0]?.line}
                  {b.where.length > 1 && ` and ${b.where.length - 1} more`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
