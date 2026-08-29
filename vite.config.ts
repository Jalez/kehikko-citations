import type { IncomingMessage } from 'node:http'
import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { WELL_KNOWN } from 'roadmap-module-protocol'
import { defineConfig, type Plugin } from 'vite'

import { MANIFEST, answer, type Reply } from './doors.ts'
import { page } from './page/document.ts'
import { list, papersDir, thesisRoot } from './store.ts'

/**
 * Every door this app answers on, served by the one process that serves the
 * page.
 *
 * ## Why they cannot be a second server
 *
 * A module is ONE ORIGIN or it is nothing: the protocol refuses a manifest
 * whose `entry` points anywhere but the origin that served the manifest. That
 * argument is usually made about the manifest and the health check; here it
 * reaches further, because this module serves its own material. The page
 * fetches `/api/citations` as a relative path, which is how the app works with
 * nothing else running at all. On a second port those would be cross-origin
 * from the page, and two ports is exactly where a permissive CORS policy comes
 * from. Removing the second port removes the reason for the header.
 *
 * ## Why the page is generated rather than a file
 *
 * `entry` is `/app`, and under Vite dev an extensionless path is not free: a
 * request for `/app` sitting next to an `app.tsx` resolves to that module and
 * answers `200 text/javascript` with compiled source. A browser loads such a
 * document happily and runs nothing in it — the frame's `load` fires, the host
 * greets it, and nothing answers, which reads in a host's log as "loaded its
 * page and did not answer the greeting". Claiming `/app` in middleware, before
 * Vite's resolver sees it, is what makes that impossible.
 */
function doors(): Plugin {
  return {
    name: 'citations-doors',
    configureServer(server) {
      /*
       * Say at startup what this program can see.
       *
       * Not decoration. The one configuration mistake this app can make is
       * being pointed at the wrong directory, and the symptom is a page that
       * loads perfectly and says every document has no bibliography — a working
       * app reporting an empty world. Printing the directories and the count at
       * the moment somebody starts it turns a confusing afternoon into a line
       * they already read.
       */
      const dir = papersDir()
      const thesis = thesisRoot()
      if (!dir && !thesis) {
        server.config.logger.warn(
          'citations: no directory configured. Set KEHIKKO_PAPERS_DIR, KEHIKKO_ROADMAP_DIR or ' +
            'KEHIKKO_THESIS_DIR and restart; the app will serve and say so on its own page until then.',
        )
      } else {
        /* Each root on its own line, because a total folding two roots into one
           number would hide the case where one of them found nothing. */
        for (const doc of list(dir, thesis)) {
          server.config.logger.info(
            `citations: ${doc.epic} — ${doc.entries === null ? 'no bibliography named' : `${doc.entries} entries`}`,
          )
        }
      }

      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1')
        const path = url.pathname
        const method = (request.method ?? 'GET').toUpperCase()

        const send = (reply: Reply) => {
          if (reply.body === null) {
            response.statusCode = reply.status
            response.end()
            return
          }
          response.statusCode = reply.status
          response.setHeader('content-type', 'application/json; charset=utf-8')
          response.end(JSON.stringify(reply.body, null, 2))
        }

        /* Spelled by the protocol package so that this app and every host
           cannot disagree about it by a character. */
        if (path === WELL_KNOWN) return send({ status: 200, body: MANIFEST })

        if (path === '/app' || path === '/app/' || path === '/') {
          void server
            .transformIndexHtml(request.url ?? '/app', page(), request.originalUrl)
            .then((html) => {
              response.statusCode = 200
              response.setHeader('content-type', 'text/html; charset=utf-8')
              /*
               * Framed by a host and by nothing else — and by nothing at all is
               * fine too, which is what opening this page directly is.
               *
               * `frame-ancestors` is the module's own half of the arrangement:
               * a host says which origins IT will frame, and this says who may
               * frame this. Whoever is running it decides, through
               * `ROADMAP_ORIGIN`; the default is the address the host in this
               * workspace actually serves on.
               */
              response.setHeader(
                'content-security-policy',
                `frame-ancestors 'self' ${process.env.ROADMAP_ORIGIN ?? 'http://127.0.0.1:4181 http://localhost:4181'}`,
              )
              response.end(html)
            })
            .catch(next)
          return
        }

        const ours = path === '/healthz' || path === '/mcp' || path.startsWith('/api/')
        if (!ours) return next()

        /* Only the paths above read a body, and only those wait for one. Vite's
           own middleware stack has to keep seeing an unconsumed request for
           everything else. */
        void body(request)
          .then((parsed) => {
            const reply = answer(method, path, url.searchParams, parsed)
            if (!reply) return next()
            send(reply)
          })
          .catch(next)
      })
    },
  }
}

/**
 * The request body, as JSON, or null.
 *
 * Bounded at a megabyte, because the caller is whatever on this machine found
 * the port — loopback is a fence around the machine and not around the programs
 * on it — and a handler that reads until the socket closes is a handler that
 * can be asked to read forever. Unparseable is null rather than a throw, and
 * `doors.ts` says "that was not a request" about it.
 */
const MAX_BODY_BYTES = 1_000_000

async function body(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  if ((request.method ?? 'GET').toUpperCase() !== 'POST') return null
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const piece = chunk as Buffer
    size += piece.length
    if (size > MAX_BODY_BYTES) return null
    chunks.push(piece)
  }
  if (!chunks.length) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/**
 * The dev server, and the one line that is absent from it.
 *
 * ## No `server.cors` — this module declares storage instead
 *
 * Modules that hold nothing set `cors: true` and have to: a host frames a
 * module WITHOUT `allow-same-origin` unless its manifest declares storage,
 * which puts the page on an opaque origin — and `<script type="module">` is
 * ALWAYS fetched in CORS mode, so with no permissive header not one script in
 * the page runs. The document loads, `load` fires, the host greets it, and
 * nothing answers. `curl` cannot see it, being unsubject to CORS; only the
 * browser console can.
 *
 * This module cannot go that way, because it serves its own `/api`. A
 * permissive `Access-Control-Allow-Origin` means any page in any tab can read
 * this origin. So the manifest declares `storage: true`, this line is absent,
 * and the page's own `/api` calls are ordinary same-origin requests with no
 * CORS involved at all. The check is one command:
 *
 *     curl -sI -H 'Origin: https://evil.example' http://127.0.0.1:7930/app | grep -i access-control
 *
 * and it must print nothing.
 *
 * ## No alias for `roadmap-module-protocol`
 *
 * The package's `exports` are correct and reaching past them is what made a
 * whole class of bug possible. A module that resolved its contract differently
 * from the host it talks to is a module testing something nobody ships.
 *
 * The `@` alias below is a different thing: it points at this repository's own
 * `src`, and exists because shadcn's components are generated with
 * `@/lib/utils` in them and a module rewritten by hand on every `shadcn add` is
 * a module that drifts from upstream.
 *
 * ## Tailwind is configured in CSS, and there is no `tailwind.config.js`
 *
 * v4 reads `src/index.css`: the theme, the dark variant and the container
 * queries all live there. A config file would be a second place the theme lives
 * and the failure mode of two is that one of them is the one somebody edits.
 *
 * ## There is no `build` script in `package.json` and no `index.html`
 *
 * Both would be lies. The page is generated per request by the middleware
 * above, so `vite build` has no entry to start from; six modules in this
 * workspace carry a `"build": "vite build"` that cannot succeed. `build.outDir`
 * stays configured because it costs nothing and describes where a build WOULD
 * go if this ever grew one honestly.
 */
export default defineConfig({
  /**
   * `base: './'`, because this page is served at `/app` here and framed by a
   * host at whatever address that host wrote down. Absolute asset paths are
   * correct in the first case and a guess in the second; relative ones are a
   * fact in both, because the browser resolves them against the document it
   * just fetched.
   */
  base: './',
  plugins: [doors(), react(), tailwindcss()],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  build: { outDir: 'dist', emptyOutDir: true },
})
