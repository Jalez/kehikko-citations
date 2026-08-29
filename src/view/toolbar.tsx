import { DEFAULT_ORDER, ORDER_LABELS, ORDER_MEANING, type Ordering } from '../live/order.ts'
import { EVERYTHING, narrowing, type Sifting, type Standing } from '../live/sift.ts'
import { cn } from '@/lib/utils.ts'

/**
 * The filter and the order, and the count that has to be beside them.
 *
 * ## Sized to the PANE and never to the viewport
 *
 * Every width decision here is a `@container` query — `@[22rem]:` and friends —
 * because this page is drawn inside somebody else's pane and the viewport is
 * the host's window, which says nothing about how wide this column is. A
 * `md:` breakpoint here would put a three-across toolbar in a 220px pane
 * whenever the reader's monitor was large, which is the failure the container
 * queries exist to make impossible. The container is declared on the wrapper in
 * `app.tsx`.
 *
 * At the narrow end the controls stack and the labels shorten; nothing is
 * removed, because a control that disappears at a width is a control somebody
 * cannot find and concludes was never there.
 *
 * ## The count is not decoration
 *
 * `sift.ts` says the only place this app may hide a row is here, and only with
 * the count of what is hidden on screen. So the count always names BOTH
 * numbers — "12 of 37" — and never just the one, because "12" beside a filter
 * is a number a reader cannot tell from "there are twelve".
 */

const STANDINGS: { value: Standing; label: string; short: string; meaning: string }[] = [
  { value: 'all', label: 'All', short: 'All', meaning: 'Every entry in the .bib.' },
  { value: 'cited', label: 'Cited', short: 'Cited', meaning: 'Entries the prose names at least once.' },
  {
    value: 'uncited',
    label: 'Uncited',
    short: 'Unc.',
    meaning: 'Entries in the .bib that no \\cite anywhere in the document names.',
  },
]

export interface ToolbarProps {
  sifting: Sifting
  ordering: Ordering
  onSift: (sifting: Sifting) => void
  onOrder: (ordering: Ordering) => void
  shown: number
  total: number
}

export function Toolbar({ sifting, ordering, onSift, onOrder, shown, total }: ToolbarProps) {
  const narrowed = narrowing(sifting)
  return (
    <div className="space-y-1.5 border-b border-border px-2 py-2">
      <input
        type="search"
        value={sifting.query}
        onChange={(e) => onSift({ ...sifting, query: e.target.value })}
        placeholder="author, title, key, year"
        aria-label="Filter the bibliography"
        className={cn(
          'w-full rounded-md border border-input bg-background px-2 py-1 text-[0.75rem]',
          'placeholder:text-muted-foreground focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
        )}
      />
      <div className="flex flex-wrap items-center gap-1">
        {STANDINGS.map((s) => (
          <button
            key={s.value}
            type="button"
            title={s.meaning}
            aria-pressed={sifting.standing === s.value}
            onClick={() => onSift({ ...sifting, standing: s.value })}
            className={cn(
              'rounded-md border px-1.5 py-0.5 text-[0.68rem] focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
              sifting.standing === s.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input text-muted-foreground hover:bg-accent',
            )}
          >
            {/* The long label appears when the PANE is wide enough, not the
                window. Both are always in the DOM so neither is a control that
                vanishes. */}
            <span className="@[16rem]:hidden">{s.short}</span>
            <span className="hidden @[16rem]:inline">{s.label}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <label className="sr-only" htmlFor="ordering">
          Order
        </label>
        <select
          id="ordering"
          value={ordering}
          title={ORDER_MEANING[ordering]}
          onChange={(e) => onOrder((e.target.value as Ordering) || DEFAULT_ORDER)}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-1.5 py-0.5 text-[0.68rem] focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"
        >
          {(Object.keys(ORDER_LABELS) as Ordering[]).map((value) => (
            <option key={value} value={value}>
              {ORDER_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2 text-[0.68rem] text-muted-foreground">
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
