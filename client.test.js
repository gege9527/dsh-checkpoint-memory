/**
 * node --test adapters/dsh/plugin  (picks up client.test.js)
 *
 * Evaluates the browser-lazy-CJS bundle (client.js) inside a simulated
 * window.__ModuleLoader__ environment and pins the wiring that matters without a
 * real browser DOM:
 *   - the bundle loads through the lazy-CJS protocol and exports apply + inject [];
 *   - apply() registers one "conversation.input.right" entry id
 *     'checkpoint-memory-sync' (the composer tool-row "同步记忆" button);
 *   - the injected checkpoint runner sends '/checkpoint-memory' to the CURRENT
 *     session through the sessions service: scope(id) → sessionOf(scoped) →
 *     face.prompt([{ text:'/checkpoint-memory' }], 'queue'). The host's dsh-tool-skill
 *     pre-step recognises the leading slash name and injects the skill body, so the
 *     model runs §0 in the main conversation.
 *
 * The React button component itself is not rendered (no DOM/React here); the slot +
 * command wiring is what this pins.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLE_PATH = join(HERE, 'client.js')

/** Evaluate client.js and return its module exports by simulating the loader. */
function loadBundle() {
  let registeredFactory
  const fakeWindow = {
    __ModuleLoader__: {
      load: (spec) => { registeredFactory = spec.factory },
    },
  }
  const context = vm.createContext({ window: fakeWindow, console })
  vm.runInContext(readFileSync(BUNDLE_PATH, 'utf8'), context, { filename: 'client.js' })
  assert.ok(registeredFactory, 'bundle must register a factory via __ModuleLoader__.load')
  const moduleExports = registeredFactory(function requireMock(name) {
    if (name === 'react') {
      return {
        createElement: () => ({}),
        useState: (v) => [v, () => {}],
        useEffect: () => {},
        useRef: () => ({ current: 0 }),
      }
    }
    throw new Error(`unexpected require: ${name}`)
  })
  return moduleExports
}

/** A reflective Cordis-like context supporting the ['slots'] inject, slots.register
 *  capture, and a `sessions` service whose scope(id)/sessionOf resolves a recording
 *  session face (with `.prompt`). */
function harness() {
  let registered
  const calls = { prompt: null }
  const face = {
    prompt: async (content, mode) => {
      calls.prompt = { content, mode }
      return { ok: true }
    },
  }
  const sessions = {
    scope: (sessionId) => ({ sessionId }),
    sessionOf: (scoped) => face,
  }
  const services = { sessions }
  const mk = () => new Proxy({}, {
    get(_, prop) {
      if (prop === 'get') return (name) => services[name]
      if (prop === 'inject') {
        return (deps, callback) => { callback(mk()); return [] }
      }
      if (prop === 'effect') return (fn) => fn()
      if (prop === 'slots') {
        return {
          inject: (name, factory) => factory(),
          register: (options, component) => { registered = { options, component }; return {} },
        }
      }
      if (prop in services) return services[prop]
      return undefined
    },
    set() { return true },
  })
  return { ctx: mk(), get registered() { return registered }, calls }
}

test('the client bundle exports apply and an empty inject (no hard dependencies)', () => {
  const mod = loadBundle()
  assert.equal(typeof mod.apply, 'function')
  assert.equal(mod.inject.length, 0) // cross-realm array; compare length, not reference
})

test('apply() registers one 同步记忆 button in the composer tool row (input.right)', () => {
  const h = harness()
  const mod = loadBundle()
  mod.apply(h.ctx)
  assert.ok(h.registered, 'a slots.register call must happen')
  assert.equal(h.registered.options.name, 'conversation.input.right')
  assert.equal(h.registered.options.id, 'checkpoint-memory-sync')
  assert.equal(typeof h.registered.options.inject, 'function', 'an inject face must be supplied')
  assert.equal(typeof h.registered.component, 'function', 'a React component must be registered')
})

test('the checkpoint runner sends /checkpoint-memory via session.prompt', async () => {
  const h = harness()
  const mod = loadBundle()
  mod.apply(h.ctx)
  const injected = h.registered.options.inject()
  assert.equal(typeof injected.ctx, 'object', 'the apply-level ctx rides the inject face')
  assert.equal(typeof injected.makeRunner, 'function', 'a checkpoint runner maker is supplied')

  const run = injected.makeRunner(h.ctx)
  assert.equal(typeof run, 'function')
  const result = await run('session-123')

  assert.equal(typeof result, 'object')
  assert.equal(result.ok, true)
  assert.ok(h.calls.prompt, 'session.prompt must be invoked')
  assert.equal(h.calls.prompt.mode, 'queue')
  assert.equal(h.calls.prompt.content.length, 1)
})

test('the submitted prompt is exactly the /checkpoint-memory slash-command text', async () => {
  const h = harness()
  const mod = loadBundle()
  mod.apply(h.ctx)
  const injected = h.registered.options.inject()
  await injected.makeRunner(h.ctx)('session-9')
  assert.ok(h.calls.prompt, 'session.prompt must be invoked')
  const part = h.calls.prompt.content[0]
  assert.equal(part.type, 'text')
  assert.equal(part.text, '/checkpoint-memory')
})
