import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'escritorio',
  component: 'Pane',
  requestId: 'escritorio',
  props: {
    title: 'Escritório',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('cada janela vira um bonequinho, trabalhando ou parado', async ($, on) => {
  on('state.get', () => ({
    value: {
      value: { shape: 'office-1', value: {
        frame: 3,
        people: [
          { key: 'a', name: 'site #aaaa', isWorking: true, activity: 'Bash', isMe: true, sinceMs: 5000 },
          { key: 'b', name: 'api #bbbb', isWorking: false, activity: 'parado', isMe: false, sinceMs: 90000 },
        ],
      } },
      version: 1,
    },
  }))

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /1 trabalhando/ }))?.text).toContain('1 parado')
    expect((await ui.find({ type: 'Text', text: /Bash/ }))?.text).toBe('> Bash · 5s')
    expect((await ui.find({ type: 'Text', text: /api #bbbb/ }))?.text).toBe('api #bbbb')
    expect((await ui.find({ type: 'Text', text: /parado ·/ }))?.text).toBe('parado · 1min')
    await ui.unmount()
  }
})
