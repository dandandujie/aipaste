/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ClipboardContent {
  text: string
  html: string
  rtf: string
  formats: string[]
}

interface ScreenshotResult {
  success: boolean
  imageData?: string
  error?: string
}

interface OcrResult {
  success: boolean
  text?: string
  latex?: string
  error?: string
}

interface ApiConfig {
  id: string
  name: string
  type: 'siliconflow' | 'openai' | 'mathpix' | 'custom'
  apiKey: string
  baseUrl?: string
  model?: string
  isBuiltin?: boolean
}

interface BuiltinApiInfo {
  id: string
  name: string
  type: string
  isBuiltin: boolean
}

interface Window {
  electronAPI: {
    getClipboard: () => Promise<ClipboardContent>
    writeClipboard: (data: { text?: string; html?: string; rtf?: string }) => Promise<boolean>
    captureScreen: () => Promise<ScreenshotResult>
    performOcr: (imageBase64: string, apiConfig: ApiConfig | null, mathMode?: boolean) => Promise<OcrResult>
    getBuiltinApiInfo: () => Promise<BuiltinApiInfo>
    setClipboardWatch: (enabled: boolean) => Promise<boolean>
    getClipboardWatch: () => Promise<boolean>
    setFloatingVisible: (visible: boolean) => Promise<boolean>
    getFloatingVisible: () => Promise<boolean>
    on: (channel: string, callback: (...args: any[]) => void) => void
    off: (channel: string) => void
  }
}
