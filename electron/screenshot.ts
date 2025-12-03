import { desktopCapturer, screen, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let selectionWindow: BrowserWindow | null = null

export interface ScreenshotResult {
  success: boolean
  imageData?: string // base64
  error?: string
}

/**
 * Capture full screen and return as base64
 */
export async function captureFullScreen(): Promise<ScreenshotResult> {
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

    const primarySource = sources[0]
    const thumbnail = primarySource.thumbnail
    const imageData = thumbnail.toDataURL()

    return { success: true, imageData }
  } catch (error) {
    console.error('[Screenshot] Capture failed:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Open selection window for region capture
 */
export async function captureRegion(parentWindow: BrowserWindow): Promise<ScreenshotResult> {
  return new Promise(async (resolve) => {
    try {
      // First capture full screen
      const fullScreenResult = await captureFullScreen()
      if (!fullScreenResult.success || !fullScreenResult.imageData) {
        resolve(fullScreenResult)
        return
      }

      const primaryDisplay = screen.getPrimaryDisplay()
      const { width, height } = primaryDisplay.size

      // Create fullscreen transparent window for selection
      selectionWindow = new BrowserWindow({
        width,
        height,
        x: 0,
        y: 0,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        fullscreen: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, 'preload.js'),
        },
      })

      // Load selection UI
      const selectionHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              width: 100vw;
              height: 100vh;
              overflow: hidden;
              cursor: crosshair;
              background: rgba(0, 0, 0, 0.3);
            }
            #screenshot-bg {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              object-fit: cover;
              filter: brightness(0.5);
            }
            #selection {
              position: absolute;
              border: 2px solid #00ff00;
              background: transparent;
              display: none;
            }
            #selection-preview {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              object-fit: cover;
              clip-path: inset(0);
            }
            .toolbar {
              position: absolute;
              bottom: -40px;
              right: 0;
              display: flex;
              gap: 8px;
            }
            .toolbar button {
              padding: 6px 12px;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 12px;
            }
            .btn-confirm { background: #22c55e; color: white; }
            .btn-cancel { background: #ef4444; color: white; }
            #hint {
              position: fixed;
              top: 20px;
              left: 50%;
              transform: translateX(-50%);
              background: rgba(0,0,0,0.8);
              color: white;
              padding: 10px 20px;
              border-radius: 8px;
              font-family: system-ui;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <img id="screenshot-bg" src="${fullScreenResult.imageData}" />
          <div id="selection">
            <img id="selection-preview" src="${fullScreenResult.imageData}" />
            <div class="toolbar">
              <button class="btn-confirm" onclick="confirm()">✓ OCR</button>
              <button class="btn-cancel" onclick="cancel()">✕ Cancel</button>
            </div>
          </div>
          <div id="hint">Drag to select region for OCR • ESC to cancel</div>
          <script>
            const selection = document.getElementById('selection');
            const preview = document.getElementById('selection-preview');
            const hint = document.getElementById('hint');
            let startX, startY, isSelecting = false;
            let selectionRect = null;

            document.addEventListener('mousedown', (e) => {
              startX = e.clientX;
              startY = e.clientY;
              isSelecting = true;
              selection.style.display = 'block';
              selection.style.left = startX + 'px';
              selection.style.top = startY + 'px';
              selection.style.width = '0';
              selection.style.height = '0';
              hint.style.display = 'none';
            });

            document.addEventListener('mousemove', (e) => {
              if (!isSelecting) return;
              const currentX = e.clientX;
              const currentY = e.clientY;
              const left = Math.min(startX, currentX);
              const top = Math.min(startY, currentY);
              const width = Math.abs(currentX - startX);
              const height = Math.abs(currentY - startY);

              selection.style.left = left + 'px';
              selection.style.top = top + 'px';
              selection.style.width = width + 'px';
              selection.style.height = height + 'px';

              preview.style.clipPath = \`inset(\${top}px \${window.innerWidth - left - width}px \${window.innerHeight - top - height}px \${left}px)\`;
              preview.style.filter = 'brightness(1)';

              selectionRect = { left, top, width, height };
            });

            document.addEventListener('mouseup', () => {
              isSelecting = false;
            });

            document.addEventListener('keydown', (e) => {
              if (e.key === 'Escape') cancel();
              if (e.key === 'Enter' && selectionRect) confirm();
            });

            function confirm() {
              if (selectionRect && selectionRect.width > 10 && selectionRect.height > 10) {
                window.electronAPI?.sendScreenshotResult({
                  success: true,
                  rect: selectionRect
                });
              }
            }

            function cancel() {
              window.electronAPI?.sendScreenshotResult({ success: false, cancelled: true });
            }
          </script>
        </body>
        </html>
      `

      selectionWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(selectionHtml)}`)

      // Handle result from selection window
      const handleResult = (_event: any, result: any) => {
        if (selectionWindow) {
          selectionWindow.close()
          selectionWindow = null
        }

        if (result.success && result.rect) {
          // Crop the image based on selection
          const { left, top, width, height } = result.rect
          // For now, return full image - cropping would need native module
          resolve({
            success: true,
            imageData: fullScreenResult.imageData,
          })
        } else {
          resolve({ success: false, error: 'Selection cancelled' })
        }
      }

      ipcMain.once('screenshot-result', handleResult)

      selectionWindow.on('closed', () => {
        selectionWindow = null
        ipcMain.removeListener('screenshot-result', handleResult)
      })
    } catch (error) {
      console.error('[Screenshot] Region capture failed:', error)
      resolve({ success: false, error: String(error) })
    }
  })
}

export function setupScreenshotHandlers() {
  ipcMain.handle('capture-full-screen', async () => {
    return captureFullScreen()
  })

  ipcMain.handle('capture-region', async (_event) => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
      return captureRegion(win)
    }
    return { success: false, error: 'No focused window' }
  })
}
