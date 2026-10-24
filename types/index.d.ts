export type Person = {
  key: string
  name: string
  isWorking: boolean
  activity: string
  isMe: boolean
  sinceMs: number
}

export type Office = { frame: number; people: Person[] }

declare module 'claude-code' {
  interface PluginState {
    escritorio: { office: Shaped<Office> }
  }
}
