import { useCallback, useEffect, useRef, useState } from 'react'

import type { ModuleContext } from 'roadmap-module-protocol'

import { ID } from '../../manifest.ts'
import { connect, type Host } from './host.ts'

/**
 * The host, as three pieces of React state and one function.
 *
 * ## What this app takes from a host, and what it does not
 *
 * It takes the open epic, the theme, and the string it asked the host to keep.
 * That is all. It asks the host for the epic list, once, and draws one extra
 * line with the answer.
 *
 * Everything else on this page comes off this machine's own disk through this
 * app's own `/api`, which is why the whole thing works with no host at all —
 * open `http://127.0.0.1:7930/app` and there is a picker where the canvas would
 * be. A page built the other way round, waiting for a host before it could show
 * anything, would be a page nobody could debug from a terminal.
 *
 * ## Nothing is sent before a greeting
 *
 * The host greets on every frame load and a module that announced itself first
 * would be shouting at a window that may not be a host at all. `connect`
 * listens on the `mailbox` rather than on `window` for a reason worth knowing:
 * effects run strictly after the frame's `load` event, which is exactly when
 * the host greets, so a listener installed here would miss it every time. The
 * essay is in `mailbox.ts`.
 */
export interface Roadmap {
  /** The epic the canvas is on, or null when nothing has said. */
  epic: string | null
  /** `light` or `dark`, as the host says, applied to the document element. */
  theme: 'light' | 'dark'
  /**
   * Whatever this module last asked the host to keep, exactly as it was written.
   *
   * Undefined until a greeting arrives, and null when a greeting arrived with
   * nothing kept. The difference matters to the caller: undefined means "do not
   * know yet, do not overwrite it", null means "there is nothing, defaults are
   * correct". A page that treated the two the same would write its defaults
   * over somebody's saved filter the moment it rendered.
   *
   * `live/keep.ts` owns the format and is the only thing that knows there is
   * one; nothing here looks inside the string.
   */
  kept: string | null | undefined
  /** Whether anything has greeted this page. */
  framed: boolean
  /** Every epic the host knows, when it answered. Enrichment; null otherwise. */
  epics: string[] | null
  /** Ask the host to keep this string. Fire and forget; a host that will not is not an emergency. */
  keep: (state: string) => void
}

export function useRoadmap(): Roadmap {
  const host = useRef<Host | null>(null)
  const [epic, setEpic] = useState<string | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [kept, setKept] = useState<string | null | undefined>(undefined)
  const [framed, setFramed] = useState(false)
  const [epics, setEpics] = useState<string[] | null>(null)

  useEffect(() => {
    const take = (context: ModuleContext) => {
      setEpic(context.epic)
      setTheme(context.theme)
    }
    const bridge = connect(ID, {
      onHello: (context, state) => {
        setFramed(true)
        take(context)
        /* `state ?? null`, so "the host greeted and kept nothing" becomes null
           rather than staying undefined for ever. The caller distinguishes the
           two and would otherwise never write a setting again. */
        setKept(state ?? null)
        /*
         * The epic list is enrichment and is asked for exactly once, on the
         * greeting.
         *
         * Refused, unanswered, or asked of a host that has never heard of the
         * method, the page is unchanged but for one muted line. Nothing waits
         * on this and nothing is blank until it arrives — which is the whole
         * test of whether a capability was declared honestly.
         */
        void bridge
          .request('epics.list')
          .then((answer) => {
            const list = (answer as { epics?: { slug?: unknown }[] } | null)?.epics
            if (!Array.isArray(list)) return
            setEpics(list.map((e) => String(e?.slug ?? '')).filter(Boolean))
          })
          .catch(() => {
            /* A refusal is an ordinary answer here. See above. */
          })
      },
      onContext: take,
    })
    host.current = bridge
    return () => {
      host.current = null
      bridge.stop()
    }
  }, [])

  /*
   * The theme, on the document element, as a class.
   *
   * `.dark` / `.light` rather than only `.dark`, because `index.css` uses
   * `:root:not(.light)` under `prefers-color-scheme` — a host saying "light"
   * has to beat a machine set to dark, since the host is the one looking at the
   * frame. With no host at all neither class is set and the media query is the
   * whole answer, which is the correct behaviour for a page opened in its own
   * tab.
   */
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.classList.toggle('light', theme === 'light')
  }, [theme])

  /**
   * Hand the host a string to keep, and do not wait to hear about it.
   *
   * Every other request on this page has a visible consequence and a sentence
   * beside it. A refused `state.set` has none: the page goes on working exactly
   * as it did, and the setting is forgotten on the next reload. Reporting it
   * would mean an error message about a filter, which is a worse page than one
   * that quietly does not remember.
   *
   * Nothing here knows what is in the string. See `live/keep.ts`.
   */
  const keep = useCallback((state: string) => {
    void host.current?.request('state.set', { state }).catch(() => {})
  }, [])

  return { epic, theme, kept, framed, epics, keep }
}
