import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

/**
 * Imported for its side effect, and it belongs in the ENTRY rather than beside
 * the `connect` call.
 *
 * The client installs the one `message` listener at module scope, so it is
 * listening as part of this bundle being evaluated — before React has rendered
 * anything, let alone run an effect. The host greets on the frame's `load`
 * event and effects run strictly after that, so a listener installed in
 * `useEffect` is installed after the greeting has already been posted and
 * thrown away. The essay is in the client's `mailbox.ts`; the only symptom is a
 * host reporting a module that will not speak.
 *
 * Here, from the entry, because a module scope that only a lazily-loaded chunk
 * imports is a module scope that has not run yet — the same bug wearing a
 * bundler's clothes.
 */
import 'roadmap-module-protocol/client'

import { App } from './app.tsx'
import './index.css'

/**
 * Mount, and nothing else.
 *
 * The one thing here worth a sentence is `h-full` on the document: this page is
 * a frame's whole contents as often as it is a tab's, and a body sized to its
 * content inside a frame leaves the list with no height to scroll within — so
 * it grows instead, and the roadmap's own page ends up scrolling a list that
 * was supposed to scroll itself.
 */
document.documentElement.classList.add('h-full')
document.body.classList.add('h-full')

const root = document.getElementById('root')
if (!root) throw new Error('the page has no #root to mount into')
root.classList.add('h-full')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
