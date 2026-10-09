import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { doors, serves } from 'kehikot-module-protocol/serve'
import { defineConfig, type Plugin } from 'vite'

import { BUILD, MANIFEST, answer } from './doors.ts'
import { ID, PREFERRED_PORT } from './manifest.ts'

/**
 * Say at startup where documents come from: there is no directory to point this app at any more,
 * and the variables that used to do it are named for whoever still has one in a shell profile.
 */
function says(): Plugin {
  return {
    name: 'citations-says',
    apply: 'serve',
    configureServer(server) {
      server.config.logger.info(
        'citations: documents come from the open project — <project>/.kehikot/paper/<epic>/main.tex, the same '
          + 'place the paper module reads them. KEHIKKO_PAPERS_DIR, KEHIKKO_ROADMAP_DIR and KEHIKKO_THESIS_DIR are '
          + 'no longer read and are ignored if still set.',
      )
    },
  }
}

/**
 * The dev server.
 *
 * - `serves()` decides the port from `PREFERRED_PORT` (or $PORT from a host) and keeps the
 *   registration true, so there is no `server.port` here. It is first because it has to claim a
 *   port before anything else in this config asks for one.
 * - `doors()` is every door this app answers on, served by the one process that serves the page:
 *   the manifest, `/app` with the build printed into it, and `/healthz`, `/mcp` and `/api/*`
 *   through `answer` in doors.ts. A module is ONE ORIGIN — the page fetches `/api/citations` as a
 *   relative path — and `/app` has to be claimed before Vite's resolver sees it, because this
 *   repository has a `src/app.tsx`. No ticket in the page: this app takes no writes. See the
 *   protocol's docs/module-plumbing.md.
 * - No `server.cors`: this module serves its own `/api`, and a permissive header would let any
 *   page in any tab read it. The manifest declares `storage: true` instead, so the page has a real
 *   origin and needs none. `curl -sI -H 'Origin: https://evil.example' http://127.0.0.1:7930/app
 *   | grep -i access-control` must print nothing.
 * - No alias for `kehikot-module-protocol`: it resolves through its exports, as the host's does.
 *   The `@` alias points at `src`, which is what shadcn's generated components import through.
 * - Tailwind is configured in `src/index.css`; there is no `tailwind.config.js`.
 * - No `index.html` and no `build` script: the page is generated per request, so `vite build` has
 *   no entry to start from. `build.outDir` describes where a build would go if this grew one.
 * - `base: './'`, because a host frames this page at whatever address it wrote down.
 */
export default defineConfig({
  base: './',
  plugins: [
    serves({ id: ID, prefer: PREFERRED_PORT }),
    doors({ manifest: MANIFEST, answer, build: BUILD, page: { title: 'Citations' } }),
    says(),
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  build: { outDir: 'dist', emptyOutDir: true },
})
