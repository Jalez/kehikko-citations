import { MANIFEST_KIND, PROTOCOL, manifestSchema, type Manifest } from 'roadmap-module-protocol'

export const ID = 'roadmap.citations'
export const VERSION = '1.0.0'

/**
 * What this app says about itself when a host asks.
 *
 * The manifest is the smallest half of this program and the only half a host
 * ever reads. Everything below it works with nothing on the other end — open
 * `http://127.0.0.1:7930/app` and the whole list is there, with a picker in
 * place of the host's canvas.
 *
 * ## What is declared
 *
 * - **`epics:read`.** For the gap, exactly as the paper module asks for it.
 *   This app can see which epics HAVE a document with a bibliography, because
 *   it is looking at the directory; it cannot see which epics EXIST. An epic
 *   whose paper has no bibliography at all is worth putting on screen and is
 *   invisible from here without asking. Enrichment, drawn as enrichment:
 *   refused or unanswered, the picker is still every document on this machine.
 * - **`state:keep`.** How the filter and the order survive a reload. The host
 *   keeps one opaque string for this module and never reads it; the format
 *   lives entirely in `src/live/keep.ts`. This is the capability that makes the
 *   storage paragraph below true rather than merely defensible.
 *
 * ## What is NOT declared, and the one that took a decision
 *
 * - **`selection:set` — not declared, and this is the interesting refusal.**
 *
 *   References declares it: picking a row there puts `gh#111` and `!1801` into
 *   the canvas selection and every other module is told. The obvious move is to
 *   do the same with a citation key, and it is wrong.
 *
 *   The protocol's essay on `selection` in `wire.ts` says what the field is:
 *   "a host can vouch that these are the refs somebody picked, and cannot vouch
 *   for what they ARE, because it was told and never checked." The selection
 *   carries refs and no kinds — which works precisely because every module that
 *   reads it agrees what a ref is. `graesser2004autotutor` is not a ref. It is
 *   a key in one author's `.bib` file, meaningful inside one document and
 *   meaningless three containers over, and putting it in the selection would hand
 *   every module on the canvas a string it will try to look up in a tracker and
 *   fail to find. The failure is not an error anybody sees: it is References
 *   showing nothing, Journeys highlighting nothing, and a reader concluding the
 *   canvas is broken.
 *
 *   The essay's own words for this are "context is the host's own knowledge or
 *   it is a rumour with a protocol's name on it". A citation key travelling as
 *   a ref is that rumour. So selection here is LOCAL: picking a row expands it
 *   in place, and nothing leaves this container.
 *
 *   The day the protocol grows a way to say what kind of thing a selection
 *   holds — or the day a `citation:` prefix means something to a second module
 *   — this is the paragraph to come back to. Until then the honest position is
 *   that this app has nothing to say that the canvas can understand.
 * - **`live:read` — not declared.** A bibliography is not work. Nothing here
 *   has a tracker state and colouring an entry by one would be inventing a
 *   relationship between a paper somebody cited and an issue somebody filed.
 * - **`steps:read`, `stage:report` — not declared.** Nothing here does work,
 *   so nothing here has a stage to report.
 * - **`prompt: false`.** A prompt is standing instructions a module would act
 *   on differently having read them. This one parses two files and compares
 *   them; there is no generation to steer and no filter to bias. Declaring it
 *   true would put a dialog in the host's chrome feeding a string into a
 *   program with nowhere to put it.
 * - **No extensions.** Nothing happens here that another module would want to
 *   be told about.
 *
 * ## Storage, and why a read-only module asks for it
 *
 * Because it SERVES ITS OWN `/api`. Without `storage: true` a host frames the
 * page without `allow-same-origin`, the page runs on an opaque origin, and an
 * opaque origin matches nothing — so the page's fetches of its own
 * `/api/citations` are cross-origin, and `<script type="module">` is fetched in
 * CORS mode besides. The server would then have to answer with a permissive
 * `Access-Control-Allow-Origin`, which is an invitation to every page in every
 * tab to read this origin. There is no `server.cors` line in `vite.config.ts`
 * and there is no write path here at all.
 *
 * The second reason is smaller and concrete: `localStorage` on an opaque origin
 * does not return null, it THROWS. A module that reached for it to remember a
 * filter would take its own page down on the first render inside a frame. The
 * filter is kept with `state.set` instead, which is what `state:keep` is for.
 *
 * What the sandbox gives up is small: the origin this page regains is
 * `127.0.0.1:7930` and a host is on `127.0.0.1:4181`. Different ports are
 * different origins, so the page still cannot reach into the host.
 */
export const MANIFEST: Manifest = manifestSchema.parse({
  kind: MANIFEST_KIND,
  protocol: PROTOCOL,
  id: ID,
  name: 'Citations',
  version: VERSION,
  summary:
    'The academic references this document cites: every entry in its .bib, which of them the prose actually names, and which citations name nothing.',
  /**
   * What an agent should do about this module being here.
   *
   * Not what it shows — the summary says that. This says what its PRESENCE
   * OBLIGES, and a host composes it into the prompt every agent on the canvas
   * is handed, attributed to this module.
   */
  guidance:
    'This document argues from sources, and a citation is a claim that a named work supports the ' +
    'sentence it sits in. Never add a \\cite for a key you have not seen in the .bib, and never ' +
    'invent a bibliography entry — a fabricated reference is the most damaging thing you can put ' +
    'in an academic document, and it survives review. If a sentence you write needs a source, say ' +
    'plainly that it needs one rather than supplying a plausible key. Broken citations shown here ' +
    'compile to a "?" in the PDF and are yours to fix; uncited entries are the author\'s judgement ' +
    'and are not yours to delete. Edit the .bib and the .tex on disk — this module only reads.',
  entry: '/app',
  modes: [{ id: 'citations', label: 'Citations', scope: 'epic' }],
  mcp: {
    url: '/mcp',
    transport: 'http',
    about:
      'A document’s bibliography: every entry, how often the prose cites it, and every citation that names nothing.',
  },
  extensions: { emits: [], consumes: [] },
  declares: {
    protocol: `>=${PROTOCOL} <${PROTOCOL + 1}`,
    uses: ['epics:read', 'state:keep'],
    storage: true,
    prompt: false,
  },
  health: '/healthz',
})
