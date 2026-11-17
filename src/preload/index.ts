import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { MasilApi } from './api'

function on<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

// 앱 화면(Svelte)에 노출하는 API. 네이버 웹뷰에는 노출되지 않는다.
const api: MasilApi = {
  platform: process.platform,
  neighbors: {
    list: () => ipcRenderer.invoke(IPC.neighborsList),
    add: (input) => ipcRenderer.invoke(IPC.neighborsAdd, input),
    update: (id, patch) => ipcRenderer.invoke(IPC.neighborsUpdate, id, patch),
    remove: (id) => ipcRenderer.invoke(IPC.neighborsRemove, id)
  },
  posts: {
    list: () => ipcRenderer.invoke(IPC.postsList),
    open: (id) => ipcRenderer.invoke(IPC.postsOpen, id),
    skip: (id) => ipcRenderer.invoke(IPC.postsSkip, id),
    nextPending: (excludeId) => ipcRenderer.invoke(IPC.postsNextPending, excludeId)
  },
  check: {
    now: () => ipcRenderer.invoke(IPC.checkNow),
    status: () => ipcRenderer.invoke(IPC.checkStatus),
    onStatus: (cb) => on(IPC.evCheckStatus, cb)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch) => ipcRenderer.invoke(IPC.settingsSet, patch)
  },
  naver: {
    setBounds: (rect) => ipcRenderer.send(IPC.naverSetBounds, rect),
    setHidden: (hidden) => ipcRenderer.send(IPC.naverSetHidden, hidden),
    nav: (action) => ipcRenderer.send(IPC.naverNav, action),
    state: () => ipcRenderer.invoke(IPC.naverState),
    onState: (cb) => on(IPC.evNaverState, cb)
  },
  onDataChanged: (cb) => on(IPC.evDataChanged, cb),
  onSelectPost: (cb) => on(IPC.evSelectPost, cb)
}

contextBridge.exposeInMainWorld('masil', api)
