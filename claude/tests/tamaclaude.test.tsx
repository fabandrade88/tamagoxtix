import { describe, expect, mock, test } from 'claude-code/testing'

const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const
const SPINNER = { word: 'Coalescing', message: null, suffix: '…', mode: 'thinking' } as const

describe('tamaclaude', () => {
  test('the spinner becomes the monster once the session has started', async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    mock.env(on, { HOME: '/nonexistent' })
    on('session.id', () => ({ value: 'test-session' }))
    on('command.register', () => ({ value: { command: 'tamaclaude' } }))
    await $.session.start(START)
    const drawn = await $.ui.render({
      surface: 'terminal',
      component: 'Spinner',
      requestId: 'main',
      props: SPINNER,
    })
    expect(JSON.stringify(drawn)).toContain('spinner.tsx')
  })

  test('the spinner module draws the monster, the clock and the coins', async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    mock.env(on, { HOME: '/nonexistent' })
    on('session.id', () => ({ value: 'test-session' }))
    on('command.register', () => ({ value: { command: 'tamaclaude' } }))
    await $.session.start(START)
    for (const mode of ['requesting', 'thinking', 'tool-use', 'responding'] as const) {
      const ui = await $.ui.mount({
        plugin: 'tamaclaude',
        surface: 'terminal',
        component: 'Spinner',
        props: { ...SPINNER, mode },
      })
      for (let i = 0; i < 6; i++) await ui.advance(160)
      expect(await ui.find({ in: 'tamaclaude-spinner', type: 'Text', text: /Coalescing/ })).toBeDefined()
      expect(await ui.find({ in: 'tamaclaude-spinner', type: 'Text', text: /tokens · esc to interrupt/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('between turns the monster hangs out above the prompt, scene after scene', async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    mock.env(on, { HOME: '/nonexistent' })
    on('session.id', () => ({ value: 'test-session' }))
    on('command.register', () => ({ value: { command: 'tamaclaude' } }))
    await $.session.start(START)
    const ui = await $.ui.mount({
      plugin: 'tamaclaude',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100 } as never,
    })
    // two minutes of frames: several idle scenes go by
    for (let i = 0; i < 400; i++) await ui.advance(320)
    expect(await ui.find({ in: 'tamaclaude-idle', type: 'Text', text: /waiting for you/ })).toBeDefined()
    await ui.unmount()
  })

  test('/tamaclaude palette lists every palette', async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    mock.env(on, { HOME: '/nonexistent' })
    on('session.id', () => ({ value: 'test-session' }))
    on('command.register', () => ({ value: { command: 'tamaclaude' } }))
    await $.session.start(START)
    const result = await $.command.run({
      command: 'tamaclaude',
      args: 'palette',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 100 },
    })
    expect(result.text).toContain('omarchy')
    expect(result.text).toContain('tokyo-night')
  })

  test('an unknown palette is refused without writing anything', async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    mock.env(on, { HOME: '/nonexistent' })
    on('session.id', () => ({ value: 'test-session' }))
    on('command.register', () => ({ value: { command: 'tamaclaude' } }))
    await $.session.start(START)
    const result = await $.command.run({
      command: 'tamaclaude',
      args: 'palette nope',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 100 },
    })
    expect(result.text).toContain('Unknown palette')
  })
})
