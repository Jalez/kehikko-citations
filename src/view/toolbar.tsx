import { cn } from '@/lib/utils.ts'

import { EVERYTHING, narrowing, type Sifting } from '../live/sift.ts'

/**
 * The filter, and the count that has to be beside it.
 *
 * ## What is not here
 *
 * The standing (All / Cited / Uncited) and the order are switches in the container's header
 * (`header.ts`), so this page draws no row of pills and no select. What stays is the one thing the
 * header cannot carry — free text — and the count, on the same line.
 *
 * ## The count is not decoration
 *
 * `sift.ts` says the only place this app may hide a row is here, and only with the count of what is
 * hidden on screen. So the count always names BOTH numbers — "12 of 37" — and never just the one,
 * because "12" beside a filter is a number a reader cannot tell from "there are twelve". It is on
 * the search's own line, where a person who is narrowing is already looking.
 *
 * Sized to the PANE and never to the viewport (`@container`, declared in `app.tsx`): the line wraps
 * under the input at the narrow end and nothing is removed.
 */

export interface ToolbarProps {
  sifting: Sifting
  onSift: (sifting: Sifting) => void
  shown: number
  total: number
}

export function Toolbar({ sifting, onSift, shown, total }: ToolbarProps) {
  const narrowed = narrowing(sifting)
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-2 py-1.5">
      <input
        type="search"
        value={sifting.query}
        onChange={(e) => onSift({ ...sifting, query: e.target.value })}
        placeholder="author, title, key, year"
        aria-label="Filter the bibliography"
        className={cn(
          'min-w-[7rem] flex-1 rounded-md border border-input bg-background px-2 py-1 text-[0.75rem]',
          'placeholder:text-muted-foreground focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
        )}
      />
      <p className="flex shrink-0 items-baseline gap-x-2 text-[0.68rem] whitespace-nowrap text-muted-foreground">
        {/* Both numbers, always. See the header. */}
        <span>
          {shown} of {total}
        </span>
        {narrowed && (
          <button
            type="button"
            onClick={() => onSift(EVERYTHING)}
            className="underline underline-offset-2 hover:text-foreground focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"
          >
            show everything
          </button>
        )}
      </p>
    </div>
  )
}
