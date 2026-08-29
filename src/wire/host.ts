import {
  LIMITS,
  MESSAGE,
  PROTOCOL,
  clampHeight,
  hostMessageSchema,
  looksLikeWireMessage,
  type Goto,
  type ModuleContext,
  type ResponseFailureReason,
} from 'roadmap-module-protocol'

import { mailbox, type MessageSource } from './mailbox.ts'

/**
 * The bridge, and nothing about citations.
 *
 * Copied from `kehikko-references` unchanged. It is a copy rather than a shared
 * package because a module in this workspace is meant to stand alone in its own
 * repository, and because the one thing every module here needs identically is
 * the thing least worth a dependency graph.
 *
 * One conversation with one window, in the shape the protocol package defines.
 * It knows how to be greeted, how to ask a question and match the answer to it,
 * how to answer a `goto`, and how to say how tall it would like to be. It knows
 * nothing about issues, and the module that knows about issues knows nothing
 * about `postMessage`.
 *
 * ## Binding to the window, not to the origin
 *
 * This page has no `declares.storage`, so a roadmap frames it on an opaque
 * origin: it has no origin string of its own, every message it sends arrives
 * at the host with an origin of `"null"`, and every message it receives may
 * arrive with one too. `"null"` is a string that every sandboxed frame in every
 * tab shares, so it can never be an identity.
 *
 * What IS an identity is the window handle. The greeting arrives from exactly
 * one `MessageEvent.source`, and nothing in this page or any other page can
 * forge that handle — so the rule is the one the protocol's own note states:
 * bind to the window that greeted us, and after the greeting ignore anything
 * that did not come from it. Not because a stray message would be dangerous by
 * itself, but because a second sender answering our correlation ids is a page
 * that quietly shows another roadmap's work under this one's name.
 *
 * We reply with `targetOrigin: '*'`, and that is not laziness. There is nothing
 * secret in anything this page sends — the name of an epic somebody is already
 * reading — and a targeted origin here would have to be a guess: the
 * host's origin comes from `ev.origin`, which is `"null"` exactly when the host
 * itself is sandboxed. A guess that fails silently drops every message. Where
 * `ev.origin` is a real origin we use it, because then it is a fact rather than
 * a guess.
 *
 * ## Parse what the host sends, too
 *
 * A framed page receives every message posted at its window: the host's, a dev
 * server's hot-reload socket, an extension's. `looksLikeWireMessage` is the
 * cheap filter and `hostMessageSchema` is the real one. A module that trusted
 * `data.type` alone would be one that a bundler's socket can put into an
 * unexplained state on a Tuesday.
 */

/**
 * Why a question came back without an answer.
 *
 * The protocol's three, plus one of our own. `silent` is the timeout, and it is
 * a separate word rather than folded into `failed` because the two send a
 * person to different places: `failed` is the roadmap telling us it went wrong,
 * and `silent` is the roadmap not being there — which, from inside a frame, is
 * indistinguishable from a host that is still starting up. The protocol names
 * the same condition `silent` on the other side of the wire, for a module that
 * was greeted and never answered; the symmetry is intentional.
 */
export type Refusal = { reason: ResponseFailureReason | 'silent'; error: string }

export class HostRefused extends Error {
  constructor(readonly refusal: Refusal) {
    super(refusal.error)
    this.name = 'HostRefused'
  }
}

/**
 * How long to wait for one answer.
 *
 * A number rather than forever, because forever is a page that shows "asking…"
 * until somebody reloads it, which is the exact shape of dishonesty this app is
 * against — a spinner is a claim that an answer is coming. Twelve seconds is
 * long enough for a roadmap reading a file off a cold disk and short enough
 * that nobody sits through it twice.
 */
const ANSWER_WITHIN_MS = 12_000

export interface HostEvents {
  /**
   * The greeting arrived, carrying the context that came with it and whatever
   * this module last asked the host to keep for it.
   *
   * The kept string rides beside the context rather than inside it because it
   * belongs to one module and the context is broadcast to all of them — the
   * protocol's own note on `state` in `helloSchema` makes that argument. It is
   * `null` when the host keeps nothing, which is a first run, a host that does
   * not answer `state.set`, or a module that has never written any; a module has
   * to be able to tell that from a field that is missing because the host is
   * older than the idea, and only one of those means it should draw its defaults
   * with confidence.
   *
   * And it arrives HERE, in the greeting, rather than being fetched — so a page
   * has it before its first render instead of drawing the wrong filter and
   * correcting it a moment later.
   */
  onHello?: (context: ModuleContext, state: string | null) => void
  /** The reader switched epics, or this tab was shown again. */
  onContext?: (context: ModuleContext) => void
  /**
   * "Go to this reference." The answer is not optional and not deferrable: the
   * host is waiting on it, and the protocol is explicit that a module which
   * never answers must not be able to hang a reference. So `answer` is handed
   * in rather than returned, and `connect` guarantees it is called — see below.
   */
  onGoto?: (goto: Goto, answer: (found: boolean, why: string) => void) => void
}

export interface Host {
  /** Ask one question. Rejects with `HostRefused` — never with a bare string. */
  request: (method: string, params?: Record<string, unknown>) => Promise<unknown>
  /** Say how tall we would like to be. Fire and forget, by design. */
  resize: (height: number) => void
  /** Whether anything has greeted us yet. */
  greeted: () => boolean
  /** Stop listening. Every question still waiting is refused rather than left hanging. */
  stop: () => void
}

/**
 * Start listening, and hand back the four things a page needs.
 *
 * Nothing is sent from here until a greeting arrives, and nothing needs to be:
 * the host greets on every frame load, and a module that announced itself first
 * would be shouting at a window that may not be a host at all.
 *
 * ## What it listens to, which is not the window
 *
 * The default source is the `mailbox` rather than `window`, and the difference
 * is a bug this page had for its whole life. `connect` is called from a React
 * effect, and effects run strictly after the frame's `load` event — which is
 * exactly when the host greets. Listening on the window here meant the greeting
 * had already come and gone, every time: the page rendered perfectly and the
 * pane beside it reported a module that would not speak. See the essay in
 * `mailbox.ts`.
 *
 * The source stays injectable, because everything this function decides is
 * tested without a browser and that has to keep being true.
 */
export function connect(id: string, events: HostEvents = {}, window_: MessageSource = mailbox): Host {
  let host: Window | null = null
  let origin = '*'
  let live = true

  /** Correlation id -> the promise waiting on it. A `Map`, per the protocol's note on lookups. */
  const waiting = new Map<string, { resolve: (v: unknown) => void; reject: (e: HostRefused) => void; timer: ReturnType<typeof setTimeout> }>()

  let counter = 0
  const nextId = () => `${Date.now().toString(36)}-${(counter += 1).toString(36)}`

  const send = (message: unknown) => {
    if (!host) return
    host.postMessage(message, origin)
  }

  const settle = (correlation: string, outcome: { ok: true; data: unknown } | { ok: false; refusal: Refusal }) => {
    const pending = waiting.get(correlation)
    if (!pending) return
    waiting.delete(correlation)
    clearTimeout(pending.timer)
    if (outcome.ok) pending.resolve(outcome.data)
    else pending.reject(new HostRefused(outcome.refusal))
  }

  const onMessage = (ev: MessageEvent) => {
    if (!live) return
    if (!looksLikeWireMessage(ev.data)) return
    const parsed = hostMessageSchema.safeParse(ev.data)
    if (!parsed.success) return
    const message = parsed.data

    if (message.type === MESSAGE.HELLO) {
      /* Re-greeting is normal rather than an error: the host greets on every
         frame load, and a frame that reloaded itself has forgotten everything.
         So the newest greeting wins, and the window it came from becomes the
         one we answer. */
      host = (ev.source as Window | null) ?? window_.parent ?? null
      origin = ev.origin && ev.origin !== 'null' ? ev.origin : '*'
      send({ type: MESSAGE.READY, id, protocol: message.protocol ?? PROTOCOL })
      events.onHello?.(message.context, message.state)
      return
    }

    /* Everything after the greeting has to come from the window that gave it.
       See the essay at the top: the origin cannot do this job and this can. */
    if (ev.source !== host) return

    if (message.type === MESSAGE.CONTEXT) {
      /* Everything except the envelope, rather than a list of fields — and the
         change away from a list is the point.

         This used to name each field it wanted, which is a bug that fails
         silently and gets worse with every protocol release. `selection` was
         nearly lost to it and `prompt` actually was: it arrived on the wire,
         was visible in the message, and was dropped one line before anything
         could act on it. There is nothing to see when that happens — no error,
         no warning, just a field that is never there — and Journeys needed a
         wire trace to find the same bug in its own copy of this code.

         So the message is passed through with only `type` and `protocol`
         removed, which are the two things a `ModuleContext` does not have. A
         field this page does not understand today reaches the code that might
         tomorrow. `pinned` is already one of those: carried, honestly not acted
         on, and available to whoever writes the sentence for it rather than
         invented by a page that has never seen a host send one. */
      const { type: _envelope, protocol: _spoken, ...context } = message
      events.onContext?.(context)
      return
    }

    if (message.type === MESSAGE.RESPONSE) {
      if (message.ok) settle(message.id, { ok: true, data: message.data })
      else settle(message.id, { ok: false, refusal: { reason: message.reason, error: message.error } })
      return
    }

    if (message.type === MESSAGE.GOTO) {
      /* Answered exactly once, whatever the listener does — including nothing,
         including throwing. The host is waiting on this and will time out into
         "not found"; a module that leaves it to the timeout has turned a
         hundred milliseconds into twelve seconds of a reader waiting. */
      let answered = false
      const answer = (found: boolean, why = '') => {
        if (answered) return
        answered = true
        clearTimeout(backstop)
        send({ type: MESSAGE.WENT, id: message.id, found, why: why.slice(0, LIMITS.REASON) })
      }
      /* The backstop, and why it is a timer rather than a line after the call:
         a listener may quite reasonably want to answer after a scroll settles,
         so answering `false` the moment it returns would pre-empt the honest
         answer. Half a second is longer than any of that and far shorter than
         the host's own timeout, which means the reader gets the fallback link
         instead of a wait. */
      const backstop = setTimeout(() => answer(false, 'This app did not manage to say where that reference is.'), 500)
      try {
        if (events.onGoto) events.onGoto(message, answer)
        else answer(false, 'This app is not showing anything that can be walked to.')
      } catch {
        answer(false, 'This app failed while looking for that reference.')
      }
      return
    }
  }

  window_.addEventListener('message', onMessage)

  return {
    request(method, params = {}) {
      if (!host) {
        return Promise.reject(
          new HostRefused({ reason: 'silent', error: 'Nothing has greeted this page, so there is nobody to ask.' }),
        )
      }
      const correlation = nextId()
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          settle(correlation, {
            ok: false,
            refusal: {
              reason: 'silent',
              error: `The roadmap was asked ${method} and had not answered ${Math.round(ANSWER_WITHIN_MS / 1000)} seconds later.`,
            },
          })
        }, ANSWER_WITHIN_MS)
        waiting.set(correlation, { resolve, reject, timer })
        send({ type: MESSAGE.REQUEST, id: correlation, method, params })
      })
    },

    resize(height) {
      /* Clamped on our own side with the host's own arithmetic, so that what we
         ask for is what we will get. The host runs its own copy over the raw
         number regardless — this is prediction, not enforcement. */
      send({ type: MESSAGE.RESIZE, height: clampHeight(height) })
    },

    greeted: () => host !== null,

    stop() {
      live = false
      window_.removeEventListener('message', onMessage)
      for (const correlation of [...waiting.keys()]) {
        settle(correlation, { ok: false, refusal: { reason: 'silent', error: 'This page stopped listening.' } })
      }
    },
  }
}
