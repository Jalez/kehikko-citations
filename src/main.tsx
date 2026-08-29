import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

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
