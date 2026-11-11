import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Modules never name each other: cooperation goes through protocol services, found through the host.
 * This scans the module's own code (not tests, notes, docs, the build or dependencies) for another
 * module's id, the document provider's name or its data folder, and fails on a hit.
 */

const ROOT = join(import.meta.dir, '..')
const SKIP = new Set(['node_modules', 'dist', 'test', 'notes', 'docs', '.git', '.github'])
const CODE = /\.(ts|tsx|js|mjs|json|sh|html|css)$/
const OTHERS = [
  'antigravity', 'browser', 'checklist', 'claude', 'codex', 'copilot', 'diff', 'editor', 'explorer', 'factory',
  'flows', 'history', 'inbox', 'journeys', 'kanban', 'learning', 'monitor', 'notes', 'opencode', 'orchestrator',
  'paper', 'queue', 'references', 'review', 'screenplay', 'slides', 'source', 'terminal', 'tests', 'vibe',
]
const FORBIDDEN: RegExp[] = [
  new RegExp(`\\b(?:kehikot|roadmap)\\.(?:${OTHERS.join('|')})\\b`),
  new RegExp(`\\.kehikot/(?:${OTHERS.join('|')})\\b`),
  /\b(?:list_sections|read_source|propose_edit|list_proposals|read_paper|show_flow|list_flows|write_screenplay|quizzes|cite_slide|check_item)\b/,
  /* Other modules' names that are never an everyday word here, in comments as well. */
  /\b(?:Paper|Journeys|References|Slides|Learning|Screenplay|Flows|Browser|Checklist|Explorer|Orchestrator|Factory|Kanban|Codex|Antigravity|OpenCode|Vibe)\b/,
]

function files(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name === 'bun.lock' || name === 'CHANGELOG.md') continue
    const at = join(dir, name)
    if (statSync(at).isDirectory()) out.push(...files(at))
    else if (CODE.test(name)) out.push(at)
  }
  return out
}

describe('no neighbours named', () => {
  test('the code names no other module, its tools or its folder', () => {
    const hits: string[] = []
    for (const file of files(ROOT)) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        for (const rule of FORBIDDEN) if (rule.test(line)) hits.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(hits).toEqual([])
  })
})

describe('the manifest names no other module', () => {
  test('nothing it says spells one', async () => {
    const { MANIFEST } = await import('../manifest.ts')
    const said = JSON.stringify(MANIFEST, null, 1).split('\n')
    expect(said.filter((line) => FORBIDDEN.some((rule) => rule.test(line)))).toEqual([])
  })
})
