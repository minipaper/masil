import { contextBridge } from 'electron'
import type { MasilApi } from './api'

// 앱 화면(Svelte)에 노출하는 최소 API. 기능은 마일스톤마다 여기에 IPC로 추가한다.
const api: MasilApi = {
  platform: process.platform
}

contextBridge.exposeInMainWorld('masil', api)
