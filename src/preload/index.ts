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
    open: (input) => ipcRenderer.invoke(IPC.naverOpen, input),
    state: () => ipcRenderer.invoke(IPC.naverState),
    onState: (cb) => on(IPC.evNaverState, cb)
  },
  drafts: {
    current: () => ipcRenderer.invoke(IPC.currentPost),
    state: () => ipcRenderer.invoke(IPC.draftsState),
    generate: () => ipcRenderer.invoke(IPC.draftsGenerate),
    fill: (text, tone) => ipcRenderer.invoke(IPC.draftsFill, text, tone),
    onCurrent: (cb) => on(IPC.evCurrentPost, cb),
    onState: (cb) => on(IPC.evDrafts, cb)
  },
  comments: {
    forBlog: (blogId) => ipcRenderer.invoke(IPC.commentsForBlog, blogId),
    onChanged: (cb) => on(IPC.evCommentsChanged, cb)
  },
  ai: {
    setKey: (key) => ipcRenderer.invoke(IPC.aiSetKey, key),
    test: (prompt) => ipcRenderer.invoke(IPC.aiTest, prompt)
  },
  style: {
    state: () => ipcRenderer.invoke(IPC.styleState),
    refresh: () => ipcRenderer.invoke(IPC.styleRefresh),
    approve: (id) => ipcRenderer.invoke(IPC.styleApprove, id),
    reject: (id) => ipcRenderer.invoke(IPC.styleReject, id),
    save: (content) => ipcRenderer.invoke(IPC.styleSave, content),
    onState: (cb) => on(IPC.evStyle, cb)
  },
  importer: {
    openPage: () => ipcRenderer.invoke(IPC.importOpenPage),
    scan: () => ipcRenderer.invoke(IPC.importScan),
    run: (ids) => ipcRenderer.invoke(IPC.importRun, ids),
    cancel: () => ipcRenderer.invoke(IPC.importCancel),
    status: () => ipcRenderer.invoke(IPC.importStatus),
    onProgress: (cb) => on(IPC.evImportProgress, cb)
  },
  visits: {
    scan: () => ipcRenderer.invoke(IPC.visitsScan),
    cancel: () => ipcRenderer.invoke(IPC.visitsCancel),
    status: () => ipcRenderer.invoke(IPC.visitsStatus),
    list: () => ipcRenderer.invoke(IPC.visitsList),
    onStatus: (cb) => on(IPC.evVisitStatus, cb)
  },
  replies: {
    state: () => ipcRenderer.invoke(IPC.repliesState),
    generate: (commentNo) => ipcRenderer.invoke(IPC.repliesGenerate, commentNo),
    fill: (commentNo, text) => ipcRenderer.invoke(IPC.repliesFill, commentNo, text),
    onState: (cb) => on(IPC.evReplies, cb)
  },
  findMyBlog: () => ipcRenderer.invoke(IPC.findMyBlog),
  onSettings: (cb) => on(IPC.evSettings, cb),
  onCommentConfirmed: (cb) => on(IPC.evCommentConfirmed, cb),
  data: {
    export: () => ipcRenderer.invoke(IPC.dataExport),
    import: () => ipcRenderer.invoke(IPC.dataImport)
  },
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    checkUpdate: () => ipcRenderer.invoke(IPC.appCheckUpdate),
    onUpdate: (cb) => on(IPC.evUpdate, cb)
  },
  onDataChanged: (cb) => on(IPC.evDataChanged, cb),
  onSelectPost: (cb) => on(IPC.evSelectPost, cb)
}

contextBridge.exposeInMainWorld('masil', api)
