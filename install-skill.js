/**
 * install-skill.js — materialise the FULL checkpoint-memory skill into dsh's skill
 * library at activation time, and append its rules snippet to `$DSH_HOME/AGENTS.md`.
 *
 * dsh's filesystem skill provider scans `$DSH_HOME/skills/` as its user skill root,
 * discovering one skill per subdirectory that carries a valid `SKILL.md`
 * (rank `user-dsh`). The plugin ships a self-contained copy of the whole skill
 * (SKILL.md + tools/ + templates/ + adapters/dsh/ + rules-snippet.md + INSTALL.md) in
 * `./skill/` and — on apply() — ensures that copy is present at
 * `$DSH_HOME/skills/checkpoint-memory/`.
 *
 * It also appends `./skill/rules-snippet.md` to `$DSH_HOME/AGENTS.md` so the always-on
 * rules are loaded by dsh for every session. The append is idempotent: if the snippet
 * is already present, nothing is added.
 *
 * Idempotence, not clobbering:
 *  - A `.skill-version` marker (SHA-256 of SKILL.md) is compared first. An
 *    identical marker means "already installed at this version" and the whole
 *    sync is skipped.
 *  - Only files that are part of the payload are ever written. Files the user
 *    layered into the destination that are NOT in the payload are left alone,
 *    so a local edit to e.g. SKILL.md survives unless the payload carries a
 *    different version of it (in which case the bundled skill wins).
 *  - Missing or unreadable destination roots are created; an unwritable root
 *    returns an error instead of throwing out of apply().
 *  - The AGENTS.md rules block is appended once when missing, and refreshed in place
 *    whenever the payload version changes (so upgraded rules actually reach every
 *    session). It never touches content outside its start/end markers.
 *
 * Zero dependencies, plain ESM, node: builtins only — same ethos as index.js.
 */
import { constants as FS } from 'node:fs'
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SKILL_NAME = 'checkpoint-memory'
export const VERSION_FILENAME = '.skill-version'
export const RULES_SNIPPET = 'rules-snippet.md'
export const AGENTS_FILENAME = 'AGENTS.md'
export const AGENTS_MARKER_START = '<!-- CHECKPOINT_MEMORY_RULES_START -->'
export const AGENTS_MARKER_END = '<!-- CHECKPOINT_MEMORY_RULES_END -->'

/** Resolve `$DSH_HOME`, mirroring dsh's `resolveDshHome`: env wins, else `~/.dsh`. */
export function resolveDshHome(env = process.env) {
  const fromEnv = env.DSH_HOME
  return typeof fromEnv === 'string' && fromEnv.trim() !== '' ? resolve(fromEnv) : join(homedir(), '.dsh')
}

/** The directory the bundled payload ships from. Defaults to `./skill` beside this module. */
export function defaultPayloadDir(moduleUrl = import.meta.url) {
  return join(dirname(fileURLToPath(moduleUrl)), 'skill')
}

/* Reconciliation outcome summary. */
function outcome(status, dest, detail = '') {
  return detail === '' ? { status, dest } : { status, dest, detail }
}

/**
 * Ensure the full skill is installed at `$DSH_HOME/skills/checkpoint-memory/`, and that
 * the rules snippet from the payload is present in `$DSH_HOME/AGENTS.md`.
 *
 * @param opts -
 *   - payloadDir:  bundled skill tree to install from (default: ./skill).
 *   - dshHome:     resolved `$DSH_HOME` (default: resolveDshHome()).
 *   - env:         environment used only to build the default dshHome.
 *   - appendRules: set `false` to skip appending `rules-snippet.md` to AGENTS.md.
 * @returns a settled result; never throws for routine filesystem conditions:
 *   - { status: 'up-to-date', dest, agents } — identical payload already present.
 *   - { status: 'installed', dest, agents }  — payload written (fresh or updated).
 *   - { status: 'skipped', dest, detail } — no payload found to install from.
 *   - { status: 'error', dest, detail, agents? }   — root unwritable / copy failed.
 * The `agents` field separately reports the AGENTS.md sync:
 *   - { status: 'appended', path }            — block was added (none existed).
 *   - { status: 'refreshed', path }           — existing block was rewritten from the payload.
 *   - { status: 'present', path }             — block already matches the payload, nothing written.
 *   - { status: 'error', path, detail }       — marker mismatch / write failed.
 *   - { status: 'skipped', path, detail } (e.g. no rules-snippet in payload).
 */
export async function installSkill(opts = {}) {
  const dshHome = opts.dshHome ?? resolveDshHome(opts.env)
  const payloadDir = resolve(opts.payloadDir ?? defaultPayloadDir())
  const dest = resolve(join(dshHome, 'skills', SKILL_NAME))
  if (opts.payloadDir === undefined) {
    // The bundled payload is optional at require time: a profile that sets
    // registerSkill but carries no payload still gets a clean skip, not a crash.
    try {
      await access(payloadDir, FS.F_OK)
    } catch {
      return outcome('skipped', dest, 'no bundled skill payload')
    }
  }

  try {
    await mkdir(dest, { recursive: true })
  } catch (error) {
    return outcome('error', dest, errorMessage(error))
  }

  // Nothing to install from an empty payload — a clean skip, not a false "installed".
  const payloadFiles = await listTree(payloadDir).catch((error) => {
    return { error }
  })
  if (Array.isArray(payloadFiles) && payloadFiles.length === 0) {
    return outcome('skipped', dest, 'bundled skill payload is empty')
  }
  if (!Array.isArray(payloadFiles)) {
    return outcome('error', dest, errorMessage(payloadFiles.error))
  }

  const payloadVersion = await readFile(join(payloadDir, VERSION_FILENAME), 'utf8').catch(() => undefined)
  const installedVersion = await readFile(join(dest, VERSION_FILENAME), 'utf8').catch(() => undefined)
  if (payloadVersion !== undefined && payloadVersion === installedVersion) {
    // Even when the skill is unchanged, make sure the rules snippet is still present
    // in AGENTS.md — the user may have trimmed it, or an earlier install did not write it.
    const agentsResult = opts.appendRules === false
      ? { status: 'skipped', path: resolve(join(dshHome, AGENTS_FILENAME)), detail: 'appendRules is false' }
      : await appendRulesToAgents(dshHome, payloadDir)
    return { ...outcome('up-to-date', dest), agents: agentsResult }
  }

  const copied = await copyPayload(payloadDir, dest)
  if (!copied.ok) return outcome('error', dest, copied.error)

  // Persist the version marker only after the payload copy succeeded, so a
  // partial failure retries on the next activation.
  try {
    if (payloadVersion !== undefined) {
      await writeFile(join(dest, VERSION_FILENAME), payloadVersion, 'utf8')
    }
  } catch (error) {
    return outcome('error', dest, `payload copied but version marker failed: ${errorMessage(error)}`)
  }

  const agentsResult = opts.appendRules === false
    ? { status: 'skipped', path: resolve(join(dshHome, AGENTS_FILENAME)), detail: 'appendRules is false' }
    : await appendRulesToAgents(dshHome, payloadDir, { refresh: true })
  return { ...outcome('installed', dest), agents: agentsResult }
}

/**
 * Sync `rules-snippet.md` from the payload into `$DSH_HOME/AGENTS.md`, wrapped between
 * `AGENTS_MARKER_START` and `AGENTS_MARKER_END`.
 *
 *  - No start marker yet: the block is appended after the existing content.
 *  - Start marker present, `refresh` falsy: treated as already installed, nothing written.
 *  - Start marker present, `refresh: true`: the enclosed block is rewritten in place from
 *    the payload. A skill upgrade therefore actually updates the always-on rules instead
 *    of leaving a stale copy behind. Everything outside the two markers — including
 *    content the user added before or after the block — is preserved verbatim.
 *
 * A start marker with no matching end marker is refused rather than guessed at: rewriting
 * there could swallow unrelated rules, so the caller gets an `error` outcome to report.
 */
export async function appendRulesToAgents(dshHome, payloadDir, opts = {}) {
  const refresh = opts.refresh === true
  const agentsPath = resolve(join(dshHome, AGENTS_FILENAME))
  const snippetPath = resolve(join(payloadDir, RULES_SNIPPET))

  let snippet
  try {
    snippet = await readFile(snippetPath, 'utf8')
  } catch (error) {
    return { status: 'skipped', path: agentsPath, detail: `no ${RULES_SNIPPET} in payload: ${errorMessage(error)}` }
  }

  const snippetBody = snippet.trim()
  if (snippetBody === '') {
    return { status: 'skipped', path: agentsPath, detail: `${RULES_SNIPPET} is empty` }
  }

  let current = ''
  let currentExists = false
  try {
    current = await readFile(agentsPath, 'utf8')
    currentExists = true
  } catch {
    current = ''
  }

  // The block as it should read, without the leading separator newline the append path adds.
  const block = `${AGENTS_MARKER_START}\n\n${snippet.trimEnd()}\n\n${AGENTS_MARKER_END}`

  const startAt = current.indexOf(AGENTS_MARKER_START)
  if (startAt !== -1) {
    if (!refresh) {
      return { status: 'present', path: agentsPath }
    }
    const endAt = current.indexOf(AGENTS_MARKER_END, startAt + AGENTS_MARKER_START.length)
    if (endAt === -1) {
      return {
        status: 'error',
        path: agentsPath,
        detail: `${AGENTS_MARKER_START} present without ${AGENTS_MARKER_END}; refusing to rewrite`,
      }
    }
    const endOfBlock = endAt + AGENTS_MARKER_END.length
    if (current.slice(startAt, endOfBlock) === block) {
      return { status: 'present', path: agentsPath }
    }
    const next = current.slice(0, startAt) + block + current.slice(endOfBlock)
    try {
      await writeFile(agentsPath, next, 'utf8')
    } catch (error) {
      return { status: 'error', path: agentsPath, detail: errorMessage(error) }
    }
    return { status: 'refreshed', path: agentsPath }
  }

  const prefix = currentExists && !current.endsWith('\n') ? '\n\n' : currentExists ? '\n' : ''
  try {
    await writeFile(agentsPath, `${current}${prefix}${block}\n`, 'utf8')
  } catch (error) {
    return { status: 'error', path: agentsPath, detail: errorMessage(error) }
  }
  return { status: 'appended', path: agentsPath }
}

/**
 * Copy every file+dir inside `src` into `dst`, creating parent dirs as needed and
 * overwriting colliding files. Never deletes anything already under `dst` that is
 * not part of `src`.
 */
async function copyPayload(src, dst) {
  const entries = await listTree(src)
  try {
    for (const entry of entries) {
      const target = join(dst, relative(src, entry))
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, await readFile(entry))
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

/** List all files under `root` (directories walked, symlinks ignored). */
async function listTree(root) {
  const files = []
  const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile()) {
        files.push(full)
      }
    }
  }
  await walk(root)
  return files
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
