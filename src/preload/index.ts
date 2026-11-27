import { contextBridge, ipcRenderer } from 'electron'
import type { ApiBridge } from '../shared/ipc'

const api: ApiBridge = {
  invoke: (channel: string, payload?: unknown) => ipcRenderer.invoke(channel, payload),
  onMainMessage: (handler: (message: string) => void) => {
    const listener = (_event: unknown, message: string): void => handler(message)
    ipcRenderer.on('main:message', listener)
    return () => {
      ipcRenderer.removeListener('main:message', listener)
    }
  },
  onAiEvent: (handler: (event: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown): void => handler(payload)
    ipcRenderer.on('ai:event', listener)
    return () => {
      ipcRenderer.removeListener('ai:event', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
