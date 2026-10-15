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

  test('/tamaclaude prints a usage card from the numbers on disk', async ($, on) => {
    const day = (date: string, tokens: number) => ({ date, tokens, output: tokens / 100 })
    const usage = {
      generatedAt: 0,
      days: Array.from({ length: 14 }, (_, i) => day(`2026-10-${String(i + 1).padStart(2, '0')}`, i * 1e6)),
      today: { date: '2026-10-14', tokens: 13e6, output: 130e3, hours: Array.from({ length: 24 }, (_, hour) => ({ hour, tokens: hour * 1e5 })) },
      session: { start: 0, end: 0, tokens: 5e6 },
      week: { start: 0, tokens: 40e6 },
    }
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    mock.env(on, { HOME: '/nonexistent' })
    on('session.id', () => ({ value: 'test-session' }))
    on('command.register', () => ({ value: { command: 'tamaclaude' } }))
    on('process.run', ($, e) =>
      e.argv.some(a => a.endsWith('usage-node.mjs'))
        ? { value: { exitCode: 0, stdout: JSON.stringify(usage), stderr: '' } }
        : { value: { exitCode: 1, stdout: '', stderr: '' } },
    )
    await $.session.start(START)
    const result = await $.command.run({
      command: 'tamaclaude',
      args: '',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 100 },
    })
    expect(result.text).toContain('today 13M')
    const ui = await $.ui.mount({
      plugin: 'tamaclaude',
      surface: 'terminal',
      component: 'CommandOutput',
      props: { command: 'tamaclaude', args: '', text: result.text ?? '', isErrored: false } as never,
    })
    expect(await ui.find({ type: 'Text', text: /last 14 days/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /today by hour/ })).toBeDefined()
    await ui.unmount()
  })

  test('/tamaclaude help lists the commands and draws them as a card', async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    mock.env(on, { HOME: '/nonexistent' })
    on('session.id', () => ({ value: 'test-session' }))
    on('command.register', () => ({ value: { command: 'tamaclaude' } }))
    await $.session.start(START)
    const result = await $.command.run({
      command: 'tamaclaude',
      args: 'help',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 100 },
    })
    for (const part of ['palette <name>', 'theme on|off', 'statusline on|off', 'pet on|off', 'tamaclaude.palette-next']) {
      expect(result.text).toContain(part)
    }
    const ui = await $.ui.mount({
      plugin: 'tamaclaude',
      surface: 'terminal',
      component: 'CommandOutput',
      props: { command: 'tamaclaude', args: 'help', text: result.text ?? '', isErrored: false } as never,
    })
    expect(await ui.find({ type: 'Text', text: /statusline on\|off/ })).toBeDefined()
    await ui.unmount()
  })

  test('the desktop app draws the spinner, the idle band and the cards too', async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    mock.env(on, { HOME: '/nonexistent' })
    on('session.id', () => ({ value: 'test-session' }))
    on('command.register', () => ({ value: { command: 'tamaclaude' } }))
    await $.session.start(START)

    const drawn = await $.ui.render({ surface: 'desktop', component: 'Spinner', requestId: 'main', props: SPINNER })
    expect(JSON.stringify(drawn)).toContain('spinner.tsx')

    const spinner = await $.ui.mount({ plugin: 'tamaclaude', surface: 'desktop', component: 'Spinner', props: { ...SPINNER, mode: 'tool-use' } })
    for (let i = 0; i < 6; i++) await spinner.advance(160)
    expect(await spinner.find({ in: 'tamaclaude-spinner', type: 'Text', text: /esc to interrupt/ })).toBeDefined()
    await spinner.unmount()

    const band = await $.ui.mount({
      plugin: 'tamaclaude',
      surface: 'desktop',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100 } as never,
    })
    for (let i = 0; i < 20; i++) await band.advance(320)
    expect(await band.find({ in: 'tamaclaude-idle', type: 'Text', text: /waiting for you/ })).toBeDefined()
    await band.unmount()

    const help = await $.command.run({ command: 'tamaclaude', args: 'help', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
    const card = await $.ui.mount({
      plugin: 'tamaclaude',
      surface: 'desktop',
      component: 'CommandOutput',
      props: { command: 'tamaclaude', args: 'help', text: help.text ?? '', isErrored: false } as never,
    })
    expect(await card.find({ type: 'Text', text: /statusline on\|off/ })).toBeDefined()
    await card.unmount()
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
