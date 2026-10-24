import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Office, Person } from '../types'

// Cada janela do Claude Code nesta máquina grava sua mesa no $.store
// compartilhado em `office:<chave>` e a renova com um sinal de vida; cada
// janela lê todas as mesas, então todo painel mostra o escritório inteiro.
const PANE = 'escritorio'
const PREFIX = 'office:'
const BEAT_MS = 2000
const STALE_MS = 10000
const FORGET_MS = 60000
const TICK_MS = 450

const office = atom({ plugin: 'escritorio', key: 'office' } as const, { frame: 0, people: [] }, {
  shape: 'office-1',
})

type Desk = {
  name: string
  isWorking: boolean
  activity: string
  sinceMs: number
  beatMs: number
}

const COLORS = ['#4fc3f7', '#f06292', '#ffd54f', '#81c784', '#ba68c8', '#ff8a65', '#4db6ac', '#9575cd']

// Quatro linhas por quadro, todas da mesma largura para as mesas alinharem.
const WORKING = [
  ['   O    .--. ', '  /|\\_  |==| ', '  / \\   \'--\' ', ' _|_|________'],
  ['   O    .--. ', '  /|\\-  |##| ', '  / \\   \'--\' ', ' _|_|________'],
  ['  \\O    .--. ', '   |\\_  |=#| ', '  / \\   \'--\' ', ' _|_|________'],
  ['   O    .--. ', '  /|\\-  |#=| ', '  / \\   \'--\' ', ' _|_|________'],
]
const IDLE = [
  ['   O  z      ', '  /|\\ c[]    ', '  / \\        ', ' _|_|________'],
  ['   O   Z     ', '  /|\\ c[]    ', '  / \\        ', ' _|_|________'],
  ['   O    z    ', '  /|\\ c[]~   ', '  / \\        ', ' _|_|________'],
  ['   O     Z   ', '  /|\\ c[]    ', '  / \\        ', ' _|_|________'],
]

const hash = (text: string) => [...text].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 7)

const elapsed = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}min`
  return `${Math.floor(s / 3600)}h`
}

let sessionId = ''
let baseName = 'claude'
let frame = 0
let helpers = 0
// As mesas desta janela: a conversa principal e seus subagentes.
const mine = new Map<string, Desk>()

function keyFor(agentId?: string) {
  return agentId ? `${sessionId}:${agentId}` : sessionId
}

async function publish($: EngineInterface, key: string, patch: Partial<Desk>) {
  const now = await $.clock.now()
  const old = mine.get(key) ?? { name: baseName, isWorking: false, activity: 'parado', sinceMs: now, beatMs: now }
  const changed = patch.isWorking !== undefined && patch.isWorking !== old.isWorking
  const desk = { ...old, ...patch, sinceMs: changed ? now : old.sinceMs, beatMs: now }
  mine.set(key, desk)
  await $.store.set(PREFIX + key, desk)
}

async function leave($: EngineInterface, key: string) {
  mine.delete(key)
  await $.store.delete(PREFIX + key)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    sessionId = await $.session.id()
    const cwd = e.cwd
    baseName = `${cwd.split('/').filter(Boolean).at(-1) ?? 'claude'} #${sessionId.slice(-4)}`
    await publish($, keyFor(), { name: baseName, isWorking: false, activity: 'parado' })

    await $.command.register({ name: 'escritorio', description: 'Abre o escritório virtual' })

    $.clock.every(BEAT_MS, () => {
      for (const key of mine.keys()) void publish($, key, {})
    })

    $.clock.every(TICK_MS, () => {
      void (async () => {
        frame += 1
        const now = await $.clock.now()
        const people: Person[] = []
        for (const storeKey of await $.store.keys()) {
          if (!storeKey.startsWith(PREFIX)) continue
          const desk = (await $.store.get(storeKey)) as Desk | undefined
          if (!desk) continue
          const age = now - desk.beatMs
          if (age > FORGET_MS) {
            void $.store.delete(storeKey)
            continue
          }
          if (age > STALE_MS) continue
          const key = storeKey.slice(PREFIX.length)
          people.push({
            key,
            name: desk.name,
            isWorking: desk.isWorking,
            activity: desk.activity,
            isMe: key.startsWith(sessionId),
            sinceMs: now - desk.sinceMs,
          })
        }
        people.sort((a, b) => a.key.localeCompare(b.key))
        await update($, office, () => ({ frame, people }))
      })()
    })

    if (e.isInteractive) void $.ui.open({ id: PANE, title: 'Escritório' })

    return next(e)
  })

  on('command.run', { command: 'escritorio' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Escritório' })

    return { text: 'Escritório aberto.' }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId) {
      if (!mine.has(keyFor(e.agentId))) helpers += 1
      await publish($, keyFor(e.agentId), {
        name: `ajudante ${helpers} de ${baseName}`,
        isWorking: true,
        activity: 'pensando',
      })
    } else {
      await publish($, keyFor(), { isWorking: true, activity: 'pensando' })
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const key = keyFor(e.agentId)
    if (mine.has(key)) await publish($, key, { isWorking: true, activity: e.tool })
    const ran = await next(e)
    if (mine.get(key)?.isWorking) await publish($, key, { activity: 'pensando' })

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId) {
      const key = keyFor(e.agentId)
      await publish($, key, { isWorking: false, activity: 'terminou' })
      $.clock.after(4000, () => void leave($, key))
    } else {
      await publish($, keyFor(), { isWorking: false, activity: e.isAborted ? 'interrompido' : 'parado' })
    }

    return done
  })

  on('session.end', async ($, e, next) => {
    for (const key of [...mine.keys()]) await leave($, key)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const { frame: tick, people } = await read($, office)
    const working = people.filter(p => p.isWorking).length

    return (
      <Box flexDirection="column" gap={1}>
        <Text weight="bold">
          Escritório · {working} trabalhando · {people.length - working} parado{people.length - working === 1 ? '' : 's'}
        </Text>
        {people.length === 0 && <Text dimColor>Abrindo o escritório...</Text>}
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {people.map(person => {
            const color = COLORS[hash(person.key.split(':')[0] ?? person.key) % COLORS.length]
            const frames = person.isWorking ? WORKING : IDLE
            const sprite = frames[(tick + hash(person.key)) % frames.length] ?? frames[0]!
            return (
              <Box
                key={person.key}
                flexDirection="column"
                borderStyle="round"
                borderColor={person.isWorking ? color : undefined}
                borderDimColor={!person.isWorking}
                paddingX={1}
              >
                {sprite.map(line => (
                  <Text mono color={color} dimColor={!person.isWorking}>
                    {line}
                  </Text>
                ))}
                <Text weight="bold" color={color}>
                  {person.isMe ? '* ' : ''}
                  {person.name.slice(0, 22)}
                </Text>
                <Text dimColor={!person.isWorking}>
                  {person.isWorking ? `> ${person.activity}` : person.activity} · {elapsed(person.sinceMs)}
                </Text>
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  })
}
