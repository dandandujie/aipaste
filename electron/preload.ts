import { contextBridge, ipcRenderer } from 'electron'

export interface ClipboardContent {
  text: string
  html: string
  rtf: string
  formats: string[]
}

export interface ScreenshotResult {
  success: boolean
  imageData?: string
  error?: string
}

export interface OcrResult {
  success: boolean
  text?: string
  latex?: string
  error?: string
}

export interface ApiConfig {
  id: string
  name: string
  type: 'siliconflow' | 'openai' | 'mathpix' | 'custom'
  apiKey: string
  baseUrl?: string
  model?: string
  isBuiltin?: boolean
}

export interface BuiltinApiInfo {
  id: string
  name: string
  type: string
  isBuiltin: boolean
}

contextBridge.exposeInMainWorld('electronAPI', {
  getClipboard: (): Promise<ClipboardContent> => ipcRenderer.invoke('get-clipboard-content'),
  writeClipboard: (data: { text?: string; html?: string; rtf?: string }): Promise<boolean> =>
    ipcRenderer.invoke('write-clipboard', data),
  captureScreen: (): Promise<ScreenshotResult> => ipcRenderer.invoke('capture-screen'),
  performOcr: (imageBase64: string, apiConfig: ApiConfig | null, mathMode?: boolean): Promise<OcrResult> =>
    ipcRenderer.invoke('perform-ocr', imageBase64, apiConfig, mathMode || false),
  getBuiltinApiInfo: (): Promise<BuiltinApiInfo> => ipcRenderer.invoke('get-builtin-api-info'),
  // 剪贴板监听控制
  setClipboardWatch: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('set-clipboard-watch', enabled),
  getClipboardWatch: (): Promise<boolean> => ipcRenderer.invoke('get-clipboard-watch'),
  // 浮窗控制
  setFloatingEnabled: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('set-floating-enabled', enabled),
  setFloatingVisible: (visible: boolean): Promise<boolean> => ipcRenderer.invoke('set-floating-visible', visible),
  getFloatingVisible: (): Promise<boolean> => ipcRenderer.invoke('get-floating-visible'),
  // 窗口置顶控制
  setAlwaysOnTop: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('set-always-on-top', enabled),
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args))
  },
  off: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },
})
