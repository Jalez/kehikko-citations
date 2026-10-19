import { GlobalRegistrator } from '@happy-dom/global-registrator'

/**
 * A document, for the tests that render one.
 *
 * Registered globally rather than per-file because half the value of these tests
 * is that they run the real components — the words on screen are the thing being
 * asserted, and a fake renderer would let a component say something different
 * from what it says in a browser.
 */
GlobalRegistrator.register()

/* The host, stood in for: a folder that exists is a project and any other is not. A test that wants
   a former path or no host at all replaces ASK.options. */
import { existsSync, statSync } from 'node:fs'

import { ASK } from '../doors.ts'

export const DEFAULT_ASK = {
  env: { KEHIKOT_ORIGINS: 'http://127.0.0.1:4170' },
  fetch: (async (url: string) => {
    const path = new URL(url).searchParams.get('path') ?? ''
    const here = existsSync(path) && statSync(path).isDirectory()
    return new Response(JSON.stringify({ ok: true, project: here, ...(here ? { id: 'proj-test0001' } : {}) }), { status: 200 })
  }) as unknown as typeof fetch,
}
ASK.options = DEFAULT_ASK
