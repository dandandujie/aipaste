import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, clipboard, globalShortcut, desktopCapturer, screen } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { performOcr, getBuiltinApi, type ApiConfig } from './ocr'

// Disable GPU acceleration to prevent crashes on some systems
app.disableHardwareAcceleration()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null
let tray: Tray | null
let floatingWindow: BrowserWindow | null
let clipboardWatcher: NodeJS.Timeout | null = null
let lastClipboardText = ''
let lastClipboardHtml = ''
let clipboardWatchEnabled = true
let floatingAutoShow = false

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

// 剪贴板监听
function startClipboardWatch() {
  if (clipboardWatcher) return

  lastClipboardText = clipboard.readText()
  lastClipboardHtml = clipboard.readHTML()

  clipboardWatcher = setInterval(() => {
    if (!clipboardWatchEnabled) return

    const currentText = clipboard.readText()
    const currentHtml = clipboard.readHTML()
    // 同时检测 text 和 html 变化，解决 HTML 内容变化但 text 不变的情况
    if (currentText !== lastClipboardText || currentHtml !== lastClipboardHtml) {
      lastClipboardText = currentText
      lastClipboardHtml = currentHtml
      const formats = clipboard.availableFormats()
      const rtf = clipboard.readRTF()

      // 通知渲染进程剪贴板变化
      win?.webContents.send('clipboard-changed', { text: currentText, html: currentHtml, rtf, formats })
      floatingWindow?.webContents.send('clipboard-changed', { text: currentText, html: currentHtml, rtf, formats })

      // 如果开启了浮窗自动显示，且有新内容，且主窗口不在前台，则显示浮窗
      if (floatingAutoShow && currentText && !win?.isFocused()) {
        floatingWindow?.show()
      }
    }
  }, 500)
}

function stopClipboardWatch() {
  if (clipboardWatcher) {
    clearInterval(clipboardWatcher)
    clipboardWatcher = null
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 670,
    icon: path.join(process.env.VITE_PUBLIC!, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(process.env.DIST!, 'index.html'))
  }

  win.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault()
      win?.hide()
    }
    return false
  })
}

function createFloatingWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
  const floatingWidth = 360
  const floatingHeight = 480

  floatingWindow = new BrowserWindow({
    width: floatingWidth,
    height: floatingHeight,
    x: screenWidth - floatingWidth - 20,
    y: Math.floor((screenHeight - floatingHeight) / 2),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
    show: false,
  })

  // 失去焦点时自动隐藏
  floatingWindow.on('blur', () => {
    floatingWindow?.hide()
  })

  if (VITE_DEV_SERVER_URL) {
    floatingWindow.loadURL(`${VITE_DEV_SERVER_URL}#/floating`)
  } else {
    floatingWindow.loadFile(path.join(process.env.DIST!, 'index.html'), { hash: 'floating' })
  }
}

function createTray() {
  const iconPath = path.join(process.env.VITE_PUBLIC!, 'icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => win?.show() },
    {
      label: 'Toggle Floating',
      click: () => (floatingWindow?.isVisible() ? floatingWindow.hide() : floatingWindow?.show()),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        ;(app as any).isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setToolTip('AI Paste')
  tray.setContextMenu(contextMenu)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  createWindow()
  createFloatingWindow()
  createTray()

  // IPC Handlers - Clipboard
  ipcMain.handle('get-clipboard-content', () => {
    const formats = clipboard.availableFormats()
    const text = clipboard.readText()
    const html = clipboard.readHTML()
    const rtf = clipboard.readRTF()

    return { text, html, rtf, formats }
  })

  ipcMain.handle('write-clipboard', (_event, data: { text?: string; html?: string; rtf?: string }) => {
    if (data.html) {
      clipboard.write({
        text: data.text || '',
        html: data.html,
        rtf: data.rtf || '',
      })
    } else if (data.text) {
      clipboard.writeText(data.text)
    }
    return true
  })

  // Screenshot capture
  ipcMain.handle('capture-screen', async () => {
    try {
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width, height } = primaryDisplay.size
      const scaleFactor = primaryDisplay.scaleFactor

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.floor(width * scaleFactor),
          height: Math.floor(height * scaleFactor),
        },
      })

      if (sources.length === 0) {
        return { success: false, error: 'No screen sources found' }
      }

      const imageData = sources[0].thumbnail.toDataURL()
      return { success: true, imageData }
    } catch (error) {
      console.error('[Screenshot] Capture failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // OCR with API config support
  ipcMain.handle('perform-ocr', async (_event, imageBase64: string, apiConfig: ApiConfig | null, mathMode: boolean) => {
    // Use built-in API if no config provided or using builtin
    const config = apiConfig && !apiConfig.isBuiltin ? apiConfig : getBuiltinApi()
    return performOcr(imageBase64, config, mathMode)
  })

  // Get builtin API info (without exposing the key)
  ipcMain.handle('get-builtin-api-info', () => {
    const builtin = getBuiltinApi()
    return {
      id: builtin.id,
      name: builtin.name,
      type: builtin.type,
      isBuiltin: true,
    }
  })

  // 剪贴板监听控制
  ipcMain.handle('set-clipboard-watch', (_event, enabled: boolean) => {
    clipboardWatchEnabled = enabled
    return clipboardWatchEnabled
  })

  ipcMain.handle('get-clipboard-watch', () => {
    return clipboardWatchEnabled
  })

  // 浮窗控制 - 设置浮窗功能开关（控制是否在剪贴板变化时自动弹出）
  ipcMain.handle('set-floating-enabled', (_event, enabled: boolean) => {
    floatingAutoShow = enabled
    return enabled
  })

  // 浮窗控制 - 显示/隐藏浮窗
  ipcMain.handle('set-floating-visible', (_event, visible: boolean) => {
    if (visible) {
      floatingWindow?.show()
    } else {
      floatingWindow?.hide()
    }
    return visible
  })

  ipcMain.handle('get-floating-visible', () => {
    return floatingWindow?.isVisible() || false
  })

  // 窗口置顶控制
  ipcMain.handle('set-always-on-top', (_event, enabled: boolean) => {
    win?.setAlwaysOnTop(enabled)
    return enabled
  })

  // 启动剪贴板监听
  startClipboardWatch()

  // Global shortcuts
  globalShortcut.register('CommandOrControl+Shift+V', () => {
    win?.webContents.send('shortcut-convert')
    win?.show()
  })

  globalShortcut.register('CommandOrControl+Shift+M', () => {
    win?.webContents.send('shortcut-screenshot')
  })
})

app.on('will-quit', () => {
  stopClipboardWatch()
})
