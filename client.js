// Browser half of the dsh-checkpoint-memory plugin. Mounts ONE button into the web
// GUI, zero-build lazy-CJS (window.__ModuleLoader__.load), mirroring modlens/dshmarket.
//
// Icon-only sync-memory button in the composer tool row (`conversation.input.right`).
// On click it submits the `/checkpoint-memory` skill command to the CURRENT session via `session.prompt`. The
// host treats a single text block starting with '/' as a slash command, so the skill
// routes to the model, which runs the full §0 protocol in the MAIN conversation:
//   §0.1 recall (reads MEMORY.md → "恢复记忆") and
//   §0.2 curation/write (scans this session → "保存记忆").
// Because it runs in the main conversation, the model has this session's context for
// the curation judgement AND the memory index for recall — both halves are real, which
// a detached subagent could not guarantee (it lacks this session's live context).
//
// Reliability lessons (hard-won in live GUI testing):
//  - Hover/pressed background is driven by React state + inline style. An injected
//    `<style>` was unreliable (inline style beat it; host ordering could push it out),
//    so NO stylesheet is injected at all — every visual state is an inline style.
//  - The executor is resolved AT CLICK TIME off the live `ctx`, with try/catch around
//    the reflective `ctx.remote` reads (an undeclared read THROWS on Cordis' proxy,
//    which is exactly a silent "click does nothing"). Every outcome is visible
//    (✓ / ✕ / !) and failures are logged to the console.
window.__ModuleLoader__.load({
  id: 'dsh-checkpoint-memory',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports

    var INPUT_RIGHT_SLOT = 'conversation.input.right'
    var COMMAND = '/checkpoint-memory'

    // Build the runner that executes `/checkpoint-memory` in the CURRENT session.
    //
    // How the web actually runs a user-invocable skill (from ui-skill, the '/' skill
    // source): picking a skill lands the literal `/name ` TEXT into the composer, and
    // the prompt ships that same literal — determinism lives HOST-side, where the
    // dsh-tool-skill pre-step recognizes a leading `/name` and injects the rendered
    // skill body for the model. It is deliberately NOT command.execute (that is pure
    // admission for registered commands; a user-invocable skill has no handler, so it
    // only accepts and never runs — the "checkmark but nothing happened" symptom).
    //
    // So the button must send a `/checkpoint-memory` prompt to the session. The
    // reliable client service is `ctx.sessions`: `scope(sessionId)` → an Agent-scoped
    // context, then `sessionOf(scoped)` → the `SessionFace` whose `.prompt(content,
    // 'queue')` submits a user turn. The host's tool-skill pre-step then injects the
    // skill body and the model runs the full §0 protocol (recall + curation).
    function resolvePromptRunner(ctx) {
      var sessions = null
      try {
        sessions = ctx.get ? ctx.get('sessions') : null
      } catch (_error) {
        sessions = null
      }
      if (!sessions || typeof sessions.scope !== 'function'
        || typeof sessions.sessionOf !== 'function') {
        return null
      }
      return function (sessionId) {
        var scoped
        var face
        try {
          scoped = sessions.scope(sessionId)
          face = scoped !== undefined && scoped !== null ? sessions.sessionOf(scoped) : null
        } catch (_error) {
          return null
        }
        if (!face || typeof face.prompt !== 'function') return null
        return Promise.resolve(face.prompt([{ type: 'text', text: COMMAND }], 'queue'))
      }
    }

    function makeChipButton(react, opts) {
      var h = react.createElement
      var useState = react.useState
      var useEffect = react.useEffect
      var useRef = react.useRef

      // Render a small SVG sync icon for the idle state; use simple glyphs for
      // transient feedback so the button stays a single 26x26 element.
      function renderIcon(busy, feedback) {
        if (busy) return '\u23F3' // ⏳
        if (feedback === 'sent') return '\u2713' // ✓
        if (feedback === 'unavailable') return '\u0021' // !
        if (feedback === 'error') return '\u00D7' // ×
        return h('svg', {
          width: '14',
          height: '14',
          viewBox: '0 0 24 24',
          fill: 'currentColor',
          style: { display: 'block' },
          'aria-hidden': 'true',
        }, h('path', { d: 'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z' }))
      }

      return function ChipButton(props) {
        var sessionId = props.sessionId
        var ctx = props.ctx
        var makeRunner = opts.makeRunner
        var busyState = useState(false)
        var busy = busyState[0]
        var setBusy = busyState[1]
        var feedbackState = useState(null)
        var feedback = feedbackState[0]
        var setFeedback = feedbackState[1]
        var hoverState = useState(false)
        var hovered = hoverState[0]
        var setHovered = hoverState[1]
        var activeState = useState(false)
        var pressed = activeState[0]
        var setPressed = activeState[1]
        var generation = useRef(0)

        function onClick() {
          if (busy) return
          var run
          try {
            run = makeRunner(ctx)
          } catch (_error) {
            run = null
          }
          if (!run) {
            setFeedback('unavailable')
            return
          }
          var gen = ++generation.current
          setBusy(true)
          setFeedback(null)
          Promise.resolve(run(sessionId))
            .then(function (result) {
              if (gen !== generation.current) return
              setBusy(false)
              if (result === null || result === undefined) { setFeedback('unavailable'); return }
              if (result && result.ok) { setFeedback('sent'); return }
              setFeedback('error')
            })
            .catch(function (error) {
              if (gen !== generation.current) return
              setBusy(false)
              setFeedback('error')
              // eslint-disable-next-line no-console
              console.error('[checkpoint-memory] ' + opts.name + ' failed:', error)
            })
        }

        useEffect(function () {
          return function () { generation.current++ }
        }, [])

        var fill = 'transparent'
        if (!busy && pressed) {
          fill = 'var(--dsw-alias-interactive-bg-active, rgba(38,49,72,0.16))'
        } else if (!busy && hovered) {
          fill = 'var(--dsw-alias-interactive-bg-hover, rgba(38,49,72,0.06))'
        }

        return h(
          'button',
          {
            type: 'button',
            title: opts.title,
            'aria-label': opts.title,
            onClick: onClick,
            disabled: busy,
            onMouseEnter: function () { setHovered(true) },
            onMouseLeave: function () { setHovered(false); setPressed(false) },
            onMouseDown: function () { if (!busy) setPressed(true) },
            onMouseUp: function () { setPressed(false) },
            style: chipStyle(busy, fill),
          },
          h('span', { style: iconStyle }, renderIcon(busy, feedback)),
        )
      }
    }

    // Minimal icon-only composer tool-row button: 26x26 circle, no text.
    function chipStyle(busy, fill) {
      return {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '26px',
        height: '26px',
        padding: '0',
        border: 'none',
        borderRadius: '50%',
        color: busy ? 'var(--dsw-alias-label-dimmed, #8f959e)' : 'var(--dsw-alias-label-primary, #1f2329)',
        background: fill,
        fontFamily: 'var(--dsw-font-family, inherit)',
        fontSize: '14px',
        lineHeight: '1',
        cursor: busy ? 'wait' : 'pointer',
        userSelect: 'none',
      }
    }
    var iconStyle = { display: 'inline-flex' }

    function apply(ctx) {
      var react
      try {
        react = require('react')
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[checkpoint-memory] client skipped: cannot load react', error)
        return
      }

      var Chip = makeChipButton(react, {
        name: '同步记忆',
        title: '在主会话中执行 /checkpoint-memory（恢复 + 保存记忆）',
        makeRunner: resolvePromptRunner,
      })

      ctx.inject(['slots'], function (scope) {
        scope.effect(function () {
          return scope.slots.inject(INPUT_RIGHT_SLOT, function () {
            return scope.slots.register(
              {
                name: INPUT_RIGHT_SLOT,
                id: 'checkpoint-memory-sync',
                inject: function () {
                  return {
                    ctx: ctx,
                    makeRunner: resolvePromptRunner,
                  }
                },
              },
              Chip,
            )
          })
        })
      })
    }

    exports.apply = apply
    // `slots` and `sessions` are optional; resolved live via ctx.get inside the
    // runner. No hard dependency.
    exports.inject = []
    return module.exports
  },
})
