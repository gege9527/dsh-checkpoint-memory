/**
 * node --test adapters/dsh/plugin  (picks up install-skill.test.js)
 *
 * Covers the skill-to-library installer: first-install materialises the FULL skill
 * under $DSH_HOME/skills/checkpoint-memory/, appends the rules snippet to
 * $DSH_HOME/AGENTS.md, a repeat run is a no-op, user-added files survive, and failures
 * (unwritable root / missing payload) settle as clean outcomes instead of throwing. All
 * runs target temp dirs — never the real $DSH_HOME.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { installSkill, resolveDshHome, SKILL_NAME, VERSION_FILENAME, AGENTS_MARKER_START, AGENTS_MARKER_END, defaultPayloadDir, appendRulesToAgents } from './install-skill.js'

// The real bundled payload ships beside this file's module; the module under test
// resolves it via defaultPayloadDir(). Tests reuse the real payload for realism but
// always point dshHome at a temp dir.
const PAYLOAD = defaultPayloadDir(new URL('./install-skill.js', import.meta.url))

function tempHome() {
  return mkdtempSync(join(tmpdir(), 'cm-skill-home-'))
}

function installedPath(home) {
  return join(home, 'skills', SKILL_NAME)
}

function agentsPath(home) {
  return join(home, 'AGENTS.md')
}

function readRulesSnippet() {
  return readFileSync(join(PAYLOAD, 'rules-snippet.md'), 'utf8')
}

test('exposes a resolvable dshHome (env wins, else ~/.dsh)', () => {
  assert.equal(resolveDshHome({ DSH_HOME: '/tmp/x' }), '/tmp/x')
  assert.equal(resolveDshHome({}), join(homedir(), '.dsh'))
})

test('first install materialises the full skill into the library root', async () => {
  const home = tempHome()
  const r = await installSkill({ dshHome: home })
  assert.equal(r.status, 'installed')
  const dest = installedPath(home)
  assert.equal(r.dest, dest)
  assert.ok(existsSync(join(dest, 'SKILL.md')), 'SKILL.md must be present')
  assert.ok(existsSync(join(dest, 'tools', 'check.py')), 'tools/ must be present')
  assert.ok(existsSync(join(dest, 'templates', 'MEMORY.md')), 'templates/ must be present')
  assert.ok(existsSync(join(dest, 'rules-snippet.md')), 'rules-snippet must be present')
  assert.equal(existsSync(join(dest, 'adapters')), false, 'skill payload no longer ships adapters/')
  // The payload carries the complete body, not the abbreviated runtime version.
  const skill = readFileSync(join(dest, 'SKILL.md'), 'utf8')
  assert.match(skill, /## 8\. 索引上限守卫/, 'full SKILL.md section must install')
  assert.ok(Buffer.byteLength(skill, 'utf8') > 5000,
    'full SKILL.md is long (abbreviated body is ~60 lines)')
})

test('first install appends the rules snippet to AGENTS.md', async () => {
  const home = tempHome()
  const r = await installSkill({ dshHome: home })
  assert.equal(r.status, 'installed')
  assert.equal(r.agents.status, 'appended')
  assert.equal(r.agents.path, agentsPath(home))
  const agents = readFileSync(agentsPath(home), 'utf8')
  const snippet = readRulesSnippet().trim()
  assert.ok(agents.includes(AGENTS_MARKER_START), 'AGENTS.md must contain the checkpoint-memory start marker')
  assert.ok(agents.includes(AGENTS_MARKER_END), 'AGENTS.md must contain the checkpoint-memory end marker')
  assert.ok(agents.trim().endsWith(AGENTS_MARKER_END), 'AGENTS.md must end with the end marker')
  assert.ok(agents.includes(snippet), 'AGENTS.md must contain the rules snippet')
  assert.match(agents, /# 记忆（checkpoint-memory）/)
})

test('a repeat install is a no-op (idempotent, up-to-date)', async () => {
  const home = tempHome()
  await installSkill({ dshHome: home })
  const dest = installedPath(home)
  writeFileSync(join(dest, 'SKILL.md'), readFileSync(join(dest, 'SKILL.md'), 'utf8')) // touch unchanged
  const second = await installSkill({ dshHome: home })
  assert.equal(second.status, 'up-to-date')
  assert.equal(second.agents.status, 'present', 'rules snippet already present on second install')
  const agents = readFileSync(agentsPath(home), 'utf8')
  const snippet = readRulesSnippet().trim()
  const startMarkerCount = agents.split(AGENTS_MARKER_START).length - 1
  const endMarkerCount = agents.split(AGENTS_MARKER_END).length - 1
  assert.equal(startMarkerCount, 1, 'start marker must appear exactly once')
  assert.equal(endMarkerCount, 1, 'end marker must appear exactly once')
  const firstOccurrence = agents.indexOf(snippet)
  const lastOccurrence = agents.lastIndexOf(snippet)
  assert.equal(firstOccurrence, lastOccurrence, 'snippet must appear exactly once')
})

test('user-added files in the destination survive an install', async () => {
  const home = tempHome()
  await installSkill({ dshHome: home })
  const dest = installedPath(home)
  const userNote = join(dest, 'user-notes.md')
  writeFileSync(userNote, '# mine\n', 'utf8')
  // Force a re-run that would normally be "up-to-date" is fine; the point is the
  // user file is never deleted. Re-invoke even though up-to-date and assert survival.
  await installSkill({ dshHome: home })
  assert.equal(readFileSync(userNote, 'utf8'), '# mine\n', 'unrelated user file must be untouched')
})

test('an unwritable destination settles as error, not a throw', async () => {
  const home = tempHome()
  const skillsDir = join(home, 'skills')
  // Occupy the destination with a non-directory so mkdir/recursive write fails.
  mkdirSync(skillsDir, { recursive: true })
  writeFileSync(installedPath(home), 'not a dir')
  const r = await installSkill({ dshHome: home })
  assert.equal(r.status, 'error')
  assert.equal(typeof r.detail, 'string')
})

test('a missing payload skips cleanly instead of crashing', async () => {
  const home = tempHome()
  const empty = mkdtempSync(join(tmpdir(), 'cm-empty-payload-'))
  const r = await installSkill({ dshHome: home, payloadDir: empty })
  assert.equal(r.status, 'skipped') // empty payload: nothing to install
})

test('a changed SKILL.md hash triggers a reinstall (version marker update)', async () => {
  const home = tempHome()
  await installSkill({ dshHome: home })
  const dest = installedPath(home)
  // Simulate an upgrade: newer payload version marker + different SKILL.md.
  const edited = mkdtempSync(join(tmpdir(), 'cm-upgraded-payload-'))
  writeFileSync(join(edited, 'SKILL.md'), '# upgraded\n')
  writeFileSync(join(edited, VERSION_FILENAME), 'deadbeef')
  const r = await installSkill({ dshHome: home, payloadDir: edited })
  assert.equal(r.status, 'installed')
  assert.equal(readFileSync(join(dest, 'SKILL.md'), 'utf8'), '# upgraded\n')
  assert.equal(readFileSync(join(dest, VERSION_FILENAME), 'utf8'), 'deadbeef')
})

test('appendRulesToAgents skips when rules-snippet is missing', async () => {
  const home = tempHome()
  const empty = mkdtempSync(join(tmpdir(), 'cm-empty-payload-'))
  const r = await appendRulesToAgents(home, empty)
  assert.equal(r.status, 'skipped')
  assert.equal(existsSync(agentsPath(home)), false)
})

test('appendRulesToAgents appends to existing AGENTS.md without duplicating', async () => {
  const home = tempHome()
  writeFileSync(agentsPath(home), '# Existing rules\n\nSome prior content.\n')
  const first = await appendRulesToAgents(home, PAYLOAD)
  assert.equal(first.status, 'appended')
  const agents = readFileSync(agentsPath(home), 'utf8')
  assert.match(agents, /# Existing rules/)
  assert.match(agents, /# 记忆（checkpoint-memory）/)
  assert.ok(agents.includes(AGENTS_MARKER_START), 'start marker must be written to AGENTS.md')
  assert.ok(agents.includes(AGENTS_MARKER_END), 'end marker must be written to AGENTS.md')
  const startMarkerCount = agents.split(AGENTS_MARKER_START).length - 1
  const endMarkerCount = agents.split(AGENTS_MARKER_END).length - 1
  assert.equal(startMarkerCount, 1, 'start marker must appear exactly once after first append')
  assert.equal(endMarkerCount, 1, 'end marker must appear exactly once after first append')
  const second = await appendRulesToAgents(home, PAYLOAD)
  assert.equal(second.status, 'present')
})
