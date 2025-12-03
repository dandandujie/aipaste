<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import katex from 'katex'
  import 'katex/dist/katex.min.css'
  import { wrapForWord } from './lib/style-applier'

  type Tab = 'clipboard' | 'ocr' | 'settings'
  let activeTab: Tab = 'clipboard'

  let clipboardText = ''
  let clipboardHtml = ''
  let clipboardFormats: string[] = []
  let isFloating = window.location.hash === '#/floating'
  let status = '就绪'
  let clipboardWatchEnabled = true
  let floatingEnabled = false

  let screenshotImage = ''
  let ocrResult = ''
  let isOcrLoading = false
  let mathMode = true
  let alwaysOnTop = false

  let builtinApiInfo: BuiltinApiInfo | null = null
  let userApis: ApiConfig[] = []
  let selectedApiId = 'builtin'
  let showAddApi = false

  let newApiName = ''
  let newApiType: ApiConfig['type'] = 'siliconflow'
  let newApiKey = ''
  let newApiBaseUrl = ''
  let newApiModel = ''


  // 检测是否包含 LaTeX 公式
  function hasLatex(text: string): boolean {
    // 标准 LaTeX 分隔符
    if (/\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/s.test(text)) {
      return true
    }
    // 裸露的 LaTeX 命令（如 \frac, \exp, \left 等）
    if (/\\(frac|sqrt|sum|int|prod|lim|exp|log|ln|sin|cos|tan|left|right|begin|end|alpha|beta|gamma|delta|phi|theta|sigma|omega|infty|partial|nabla|cdot|times|approx|neq|leq|geq|text)\b/.test(text)) {
      return true
    }
    return false
  }

  // 检测是否是 HTML 内容
  function isHtmlContent(text: string): boolean {
    return /<[a-z][\s\S]*>/i.test(text)
  }

  // 处理 HTML 内容，提取有效片段
  function processHtmlContent(html: string): string {
    if (!html) return ''

    // 1. 处理 AI-Paste 专用标记
    html = html.replace(/<!--RENDEREDMATHSTART-->/g, '').replace(/<!--RENDEREDMATHEND-->/g, '')

    // 2. 处理标准剪贴板标记 (<!--StartFragment--> ... <!--EndFragment-->)
    const fragMatch = html.match(/<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/)
    if (fragMatch) {
      html = fragMatch[1]
    }

    // 3. 提取 body 内容 (避免嵌套 html/body 标签导致渲染问题)
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    if (bodyMatch) {
      html = bodyMatch[1]
    }

    // 4. 移除可能影响页面的 style 和 script 标签
    html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')

    return html
  }

  // 渲染文本中的 LaTeX 公式为 HTML
  function renderLatex(text: string): string {
    if (!text) return ''

    // 使用占位符保护已渲染的内容（使用不会与 Markdown 冲突的格式）
    const placeholders: string[] = []
    let placeholderIndex = 0

    const savePlaceholder = (content: string): string => {
      const placeholder = `\x00KATEX${placeholderIndex++}\x00`
      placeholders.push(content)
      return placeholder
    }

    // 预处理 LaTeX：修复常见格式问题
    const preprocessLatex = (latex: string): string => {
      let result = latex
      // 在 \cdot, \times 等命令后添加空格（如果后面直接跟字母或数字）
      result = result.replace(/\\(cdot|times|quad|qquad|,|;|!)([a-zA-Z0-9])/g, '\\$1 $2')
      // 处理 \text{} 内的 Unicode 中点 · - 拆分为多个 \text{} 并用 \cdot 连接
      result = result.replace(/\\text\{([^}]*)\}/g, (match, content) => {
        if (content.includes('·')) {
          const parts = content.split('·')
          return parts.map(p => p ? `\\text{${p}}` : '').filter(Boolean).join('\\cdot ')
        }
        return match
      })
      return result
    }

    let result = text

    // 1. 替换块级公式 $$ ... $$
    result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
      try {
        const processed = preprocessLatex(latex.trim())
        return savePlaceholder(`<div class="katex-block">${katex.renderToString(processed, { displayMode: true, throwOnError: false })}</div>`)
      } catch { return `<div class="katex-error">$$${latex}$$</div>` }
    })

    // 2. 替换块级公式 \[ ... \]
    result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, latex) => {
      try {
        const processed = preprocessLatex(latex.trim())
        return savePlaceholder(`<div class="katex-block">${katex.renderToString(processed, { displayMode: true, throwOnError: false })}</div>`)
      } catch { return `<div class="katex-error">\\[${latex}\\]</div>` }
    })

    // 3. 替换行内公式 \( ... \)
    result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, latex) => {
      try {
        const processed = preprocessLatex(latex.trim())
        return savePlaceholder(katex.renderToString(processed, { displayMode: false, throwOnError: false }))
      } catch { return `<span class="katex-error">\\(${latex}\\)</span>` }
    })

    // 4. 替换行内公式 $ ... $（排除 $$）
    result = result.replace(/\$([^$\n]+)\$/g, (_, latex) => {
      try {
        const processed = preprocessLatex(latex.trim())
        return savePlaceholder(katex.renderToString(processed, { displayMode: false, throwOnError: false }))
      } catch { return `<span class="katex-error">$${latex}$</span>` }
    })

    // 5. 处理 Markdown 格式
    // 加粗 **text** 或 __text__
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>')
    // 斜体 *text* 或 _text_
    result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // 标题 ### text
    result = result.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    result = result.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    result = result.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
    // 分隔线 ---
    result = result.replace(/^---$/gm, '<hr>')

    // 6. 处理剩余文本：将换行转为 <br>，但保护占位符
    result = result.replace(/\n/g, '<br>\n')

    // 7. 恢复所有占位符
    for (let i = 0; i < placeholders.length; i++) {
      result = result.split(`\x00KATEX${i}\x00`).join(placeholders[i])
    }

    return result
  }

  // 获取渲染内容 - 优先使用 HTML，否则渲染 LaTeX
  function getRenderedContent(html: string, text: string): string {
    // 如果有 HTML 内容且确实包含 HTML 标签，处理后使用
    if (html && html.trim() && isHtmlContent(html)) {
      console.log('[Preview] Using HTML content, length:', html.length)
      return processHtmlContent(html)
    }
    // 如果纯文本包含 HTML 标签（从某些网页复制时会出现），直接渲染
    if (isHtmlContent(text)) {
      console.log('[Preview] Text contains HTML tags')
      return processHtmlContent(text)
    }
    // 如果纯文本包含 LaTeX，渲染它
    if (hasLatex(text)) {
      console.log('[Preview] Text contains LaTeX, rendering...')
      return renderLatex(text)
    }
    console.log('[Preview] No rich content detected, html:', !!html, 'text length:', text.length)
    return ''
  }

  // 响应式渲染结果 - 显式传入依赖以确保响应式更新
  $: renderedContent = getRenderedContent(clipboardHtml, clipboardText)
  $: hasRichContent = !!(clipboardHtml && clipboardHtml.trim()) || isHtmlContent(clipboardText) || hasLatex(clipboardText)

  function loadSettings() {
    const saved = localStorage.getItem('aipaste_user_apis')
    if (saved) {
      try { userApis = JSON.parse(saved) } catch { userApis = [] }
    }
    selectedApiId = localStorage.getItem('aipaste_selected_api') || 'builtin'
    mathMode = localStorage.getItem('aipaste_math_mode') !== 'false'
    clipboardWatchEnabled = localStorage.getItem('aipaste_clipboard_watch') !== 'false'
    floatingEnabled = localStorage.getItem('aipaste_floating_enabled') === 'true'
    alwaysOnTop = localStorage.getItem('aipaste_always_on_top') === 'true'
  }

  function saveSettings() {
    localStorage.setItem('aipaste_user_apis', JSON.stringify(userApis))
    localStorage.setItem('aipaste_selected_api', selectedApiId)
    localStorage.setItem('aipaste_math_mode', String(mathMode))
    localStorage.setItem('aipaste_clipboard_watch', String(clipboardWatchEnabled))
    localStorage.setItem('aipaste_floating_enabled', String(floatingEnabled))
    localStorage.setItem('aipaste_always_on_top', String(alwaysOnTop))
  }

  async function toggleFloating() {
    floatingEnabled = !floatingEnabled
    await window.electronAPI.setFloatingEnabled(floatingEnabled)
    saveSettings()
    status = floatingEnabled ? '已开启浮窗' : '已关闭浮窗'
  }

  async function toggleAlwaysOnTop() {
    alwaysOnTop = !alwaysOnTop
    await window.electronAPI.setAlwaysOnTop(alwaysOnTop)
    saveSettings()
    status = alwaysOnTop ? '已置顶窗口' : '已取消置顶'
  }

  async function closeFloatingWindow() {
    await window.electronAPI.setFloatingVisible(false)
  }

  function getSelectedApiConfig(): ApiConfig | null {
    if (selectedApiId === 'builtin') return null
    return userApis.find((a) => a.id === selectedApiId) || null
  }

  function addNewApi() {
    if (!newApiName || !newApiKey) { status = '请填写名称和密钥'; return }
    const newApi: ApiConfig = {
      id: `user-${Date.now()}`,
      name: newApiName,
      type: newApiType,
      apiKey: newApiKey,
      baseUrl: newApiBaseUrl || undefined,
      model: newApiModel || undefined,
    }
    userApis = [...userApis, newApi]
    selectedApiId = newApi.id
    saveSettings()
    newApiName = ''; newApiKey = ''; newApiBaseUrl = ''; newApiModel = ''
    showAddApi = false
    status = '已添加 API'
  }

  function deleteApi(id: string) {
    userApis = userApis.filter((a) => a.id !== id)
    if (selectedApiId === id) selectedApiId = 'builtin'
    saveSettings()
    status = '已删除 API'
  }

  async function refreshClipboard() {
    try {
      const content = await window.electronAPI.getClipboard()
      clipboardText = content.text
      clipboardHtml = content.html
      clipboardFormats = content.formats
      status = `已加载 ${content.formats.length} 种格式`
    } catch (err) {
      status = '剪贴板错误'
      console.error(err)
    }
  }

  // 标记是否正在自动转换，避免循环触发
  let isAutoConverting = false

  // 剪贴板变化处理
  async function handleClipboardChanged(content: { text: string; html: string; rtf: string; formats: string[] }) {
    // 如果是自动转换写入的，跳过
    if (isAutoConverting) {
      isAutoConverting = false
      return
    }

    console.log('[Clipboard] Changed - text length:', content.text.length, 'html length:', content.html.length)
    clipboardText = content.text
    clipboardHtml = content.html
    clipboardFormats = content.formats

    // 自动转换为 Word 兼容格式
    if (clipboardWatchEnabled && content.text) {
      await autoConvertToWord(content.text, content.html)
    }
  }

  // 自动转换为 Word 兼容格式
  async function autoConvertToWord(text: string, html: string) {
    status = '自动转换中...'
    try {
      // 计算渲染内容
      const rendered = getRenderedContent(html, text)
      let contentHtml: string
      if (rendered) {
        contentHtml = rendered
      } else {
        contentHtml = text.replace(/\n/g, '<br>')
      }

      // 包装为 Word 兼容格式
      const outputHtml = wrapForWord(contentHtml)

      // 标记正在自动转换
      isAutoConverting = true
      await window.electronAPI.writeClipboard({ text, html: outputHtml })
      status = '已自动转换'
    } catch (err) {
      status = '自动转换失败'
      console.error(err)
      isAutoConverting = false
    }
  }

  async function toggleClipboardWatch() {
    clipboardWatchEnabled = !clipboardWatchEnabled
    await window.electronAPI.setClipboardWatch(clipboardWatchEnabled)
    saveSettings()
    status = clipboardWatchEnabled ? '已开启监听' : '已关闭监听'
  }

  async function convertAndCopy() {
    status = '转换中...'
    try {
      // 使用渲染后的内容，如果有的话
      let contentHtml: string
      if (renderedContent) {
        contentHtml = renderedContent
      } else {
        contentHtml = clipboardText.replace(/\n/g, '<br>')
      }
      const html = wrapForWord(contentHtml)
      await window.electronAPI.writeClipboard({ text: clipboardText, html })
      status = '转换完成'
    } catch (err) {
      status = '转换失败'
      console.error(err)
    }
  }

  async function copyAsPlainText() {
    await window.electronAPI.writeClipboard({ text: clipboardText })
    status = '已复制纯文本'
  }

  async function copyAsHtml() {
    const html = `<div style="font-family: 'Times New Roman', serif;">${clipboardText.replace(/\n/g, '<br>')}</div>`
    await window.electronAPI.writeClipboard({ text: clipboardText, html })
    status = '已复制 HTML'
  }

  async function captureAndOcr() {
    status = '截图中...'
    try {
      const result = await window.electronAPI.captureScreen()
      if (!result.success || !result.imageData) {
        status = '截图失败'
        return
      }
      screenshotImage = result.imageData
      status = '识别中...'
      isOcrLoading = true
      const apiConfig = getSelectedApiConfig()
      const ocrRes = await window.electronAPI.performOcr(result.imageData, apiConfig, mathMode)
      isOcrLoading = false
      if (ocrRes.success && ocrRes.text) {
        ocrResult = ocrRes.text
        clipboardText = ocrRes.text
        status = '识别完成'
        await window.electronAPI.writeClipboard({ text: ocrRes.text })
      } else {
        status = '识别失败'
      }
    } catch (err) {
      isOcrLoading = false
      status = '识别错误'
      console.error(err)
    }
  }

  function handleShortcutConvert() { refreshClipboard().then(convertAndCopy) }
  function handleShortcutScreenshot() { captureAndOcr() }

  // 处理图片粘贴
  async function handlePaste(event: ClipboardEvent) {
    if (activeTab !== 'ocr') return
    const items = event.clipboardData?.items
    if (!items) return

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        event.preventDefault()
        const file = item.getAsFile()
        if (file) {
          await processImageFile(file)
        }
        break
      }
    }
  }

  // 处理图片文件上传
  async function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (file && file.type.startsWith('image/')) {
      await processImageFile(file)
    }
    input.value = '' // 重置 input
  }

  // 处理拖放图片
  async function handleDrop(event: DragEvent) {
    event.preventDefault()
    const file = event.dataTransfer?.files[0]
    if (file && file.type.startsWith('image/')) {
      await processImageFile(file)
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault()
  }

  // 处理图片文件并进行 OCR
  async function processImageFile(file: File) {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const imageData = e.target?.result as string
      if (imageData) {
        screenshotImage = imageData
        status = '识别中...'
        isOcrLoading = true
        const apiConfig = getSelectedApiConfig()
        const ocrRes = await window.electronAPI.performOcr(imageData, apiConfig, mathMode)
        isOcrLoading = false
        if (ocrRes.success && ocrRes.text) {
          ocrResult = ocrRes.text
          clipboardText = ocrRes.text
          status = '识别完成'
          await window.electronAPI.writeClipboard({ text: ocrRes.text })
        } else {
          status = '识别失败'
        }
      }
    }
    reader.readAsDataURL(file)
  }

  let fileInput: HTMLInputElement

  onMount(async () => {
    loadSettings()
    builtinApiInfo = await window.electronAPI.getBuiltinApiInfo()
    await window.electronAPI.setClipboardWatch(clipboardWatchEnabled)
    await window.electronAPI.setFloatingEnabled(floatingEnabled)
    await window.electronAPI.setAlwaysOnTop(alwaysOnTop)
    refreshClipboard()
    window.electronAPI.on('shortcut-convert', handleShortcutConvert)
    window.electronAPI.on('shortcut-screenshot', handleShortcutScreenshot)
    window.electronAPI.on('clipboard-changed', handleClipboardChanged)
    document.addEventListener('paste', handlePaste)
  })

  onDestroy(() => {
    window.electronAPI.off('shortcut-convert')
    window.electronAPI.off('shortcut-screenshot')
    window.electronAPI.off('clipboard-changed')
    document.removeEventListener('paste', handlePaste)
  })

  const apiTypeDefaults: Record<string, { baseUrl: string; model: string; placeholder: string }> = {
    siliconflow: { baseUrl: 'https://api.siliconflow.cn/v1/chat/completions', model: 'deepseek-ai/DeepSeek-V3', placeholder: 'sk-...' },
    openai: { baseUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o', placeholder: 'sk-...' },
    mathpix: { baseUrl: '', model: '', placeholder: 'app_id:app_key' },
    custom: { baseUrl: '', model: '', placeholder: '你的 API 密钥' },
  }

  $: if (newApiType) {
    const defaults = apiTypeDefaults[newApiType]
    if (defaults && !newApiBaseUrl) newApiBaseUrl = defaults.baseUrl
    if (defaults && !newApiModel) newApiModel = defaults.model
  }

  $: containsLatex = hasLatex(clipboardText)
</script>

<main class="h-screen w-full bg-[#F8F6F1] text-neutral-800 font-mono flex flex-col overflow-hidden selection:bg-amber-200">
  {#if isFloating}
    <!-- 悬浮窗模式 -->
    <div class="h-screen flex flex-col border border-neutral-400 bg-[#FFFEF9] drag-region shadow-md">
      <!-- 标题栏 -->
      <div class="flex-shrink-0 flex justify-between items-center px-3 py-2 no-drag border-b border-neutral-300 bg-neutral-50">
        <div class="flex items-center gap-2">
          <span class="font-serif font-bold text-sm tracking-tight">AI 粘贴</span>
          <span class="text-[10px] bg-neutral-200 px-1.5 py-0.5 border border-neutral-400">悬浮</span>
          {#if containsLatex}
            <span class="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 border border-amber-300">含公式</span>
          {/if}
        </div>
        <span class="text-[10px] text-green-600">✓ 已转换</span>
      </div>
      <!-- 预览内容 -->
      <div class="flex-1 min-h-0 overflow-y-auto no-drag bg-white">
        <div class="p-3">
          {#if clipboardText || clipboardHtml}
            {#if hasRichContent && renderedContent}
              <div class="rendered-content text-sm leading-relaxed text-neutral-800">{@html renderedContent}</div>
            {:else}
              <pre class="text-xs font-mono whitespace-pre-wrap text-neutral-800 leading-relaxed">{clipboardText}</pre>
            {/if}
          {:else}
            <div class="h-full flex items-center justify-center text-neutral-400 text-xs">复制内容后自动显示...</div>
          {/if}
        </div>
      </div>
      <!-- 状态栏 -->
      <div class="flex-shrink-0 px-3 py-1 border-t border-neutral-300 bg-neutral-50 no-drag">
        <div class="text-[10px] text-neutral-500">{status} · {clipboardText.length} 字符</div>
      </div>
    </div>
  {:else}
    <!-- 顶部导航栏 -->
    <header class="h-12 border-b border-neutral-400 flex items-center justify-between px-4 bg-[#FFFEF9]">
      <div class="flex items-center gap-6">
        <h1 class="font-serif font-bold text-base tracking-tight">AI 粘贴</h1>
        <nav class="flex gap-1">
          <button on:click={() => (activeTab = 'clipboard')} class="px-3 py-1.5 text-xs border {activeTab === 'clipboard' ? 'bg-neutral-800 text-white border-neutral-800' : 'bg-transparent text-neutral-600 border-neutral-300 hover:border-neutral-500'}">
            剪贴板
          </button>
          <button on:click={() => (activeTab = 'ocr')} class="px-3 py-1.5 text-xs border {activeTab === 'ocr' ? 'bg-neutral-800 text-white border-neutral-800' : 'bg-transparent text-neutral-600 border-neutral-300 hover:border-neutral-500'}">
            截图识别
          </button>
          <button on:click={() => (activeTab = 'settings')} class="px-3 py-1.5 text-xs border {activeTab === 'settings' ? 'bg-neutral-800 text-white border-neutral-800' : 'bg-transparent text-neutral-600 border-neutral-300 hover:border-neutral-500'}">
            设置
          </button>
        </nav>
      </div>
      <div class="flex items-center gap-3">
        <button on:click={toggleClipboardWatch} class="text-[10px] px-2 py-1 border {clipboardWatchEnabled ? 'bg-green-100 border-green-400 text-green-700' : 'bg-neutral-100 border-neutral-300 text-neutral-500'}">
          {clipboardWatchEnabled ? '● 监听中' : '○ 已暂停'}
        </button>
        <div class="text-xs font-mono bg-neutral-100 px-2 py-1 border border-neutral-300 {status.includes('错误') || status.includes('失败') ? 'text-red-600' : status.includes('完成') || status.includes('检测') ? 'text-green-700' : 'text-neutral-700'}">{status}</div>
      </div>
    </header>

    {#if activeTab === 'settings'}
    <!-- 设置页面 -->
    <div class="flex-1 overflow-y-auto p-6 bg-[#F8F6F1]">
      <div class="max-w-2xl mx-auto space-y-6">
        <!-- API 配置 -->
        <section class="bg-[#FFFEF9] border border-neutral-400 p-5">
          <div class="flex items-center gap-2 mb-4 pb-2 border-b border-neutral-300">
            <span class="text-xs font-bold">API 配置</span>
          </div>

          <!-- 内置 API -->
          <label class="flex items-center gap-3 p-3 cursor-pointer border border-neutral-300 mb-2 hover:bg-neutral-50 {selectedApiId === 'builtin' ? 'bg-amber-50 border-amber-400' : ''}">
            <input type="radio" bind:group={selectedApiId} value="builtin" on:change={saveSettings} class="accent-neutral-800" />
            <div class="flex-1">
              <div class="font-medium text-sm">{builtinApiInfo?.name || '默认 API'}</div>
              <div class="text-[10px] text-neutral-500">内置 · 免费使用</div>
            </div>
            <span class="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 border border-green-300">默认</span>
          </label>

          <!-- 用户 API -->
          {#each userApis as api (api.id)}
            <label class="flex items-center gap-3 p-3 cursor-pointer border border-neutral-300 mb-2 hover:bg-neutral-50 {selectedApiId === api.id ? 'bg-amber-50 border-amber-400' : ''}">
              <input type="radio" bind:group={selectedApiId} value={api.id} on:change={saveSettings} class="accent-neutral-800" />
              <div class="flex-1">
                <div class="font-medium text-sm">{api.name}</div>
                <div class="text-[10px] text-neutral-500">{api.type} · {api.apiKey.slice(0, 8)}...</div>
              </div>
              <button class="text-red-600 hover:text-red-800 text-[10px] px-2 py-1 border border-red-300 hover:bg-red-50" on:click|stopPropagation={() => deleteApi(api.id)}>删除</button>
            </label>
          {/each}

          <!-- 添加新 API -->
          {#if !showAddApi}
            <button class="w-full p-3 border border-dashed border-neutral-400 text-neutral-500 hover:border-neutral-600 hover:text-neutral-700 text-xs" on:click={() => (showAddApi = true)}>+ 添加自定义 API</button>
          {:else}
            <div class="p-4 border border-neutral-400 space-y-3 bg-neutral-50">
              <div class="flex justify-between items-center pb-2 border-b border-neutral-300">
                <span class="font-medium text-xs">添加新 API</span>
                <button class="text-neutral-500 hover:text-neutral-800 text-[10px]" on:click={() => (showAddApi = false)}>取消</button>
              </div>

              <div class="space-y-1">
                <label class="block text-[10px] text-neutral-500">API 类型</label>
                <select bind:value={newApiType} class="w-full px-2 py-1.5 bg-white border border-neutral-400 focus:border-neutral-600 focus:outline-none text-xs">
                  <option value="siliconflow">硅基流动</option>
                  <option value="openai">OpenAI</option>
                  <option value="mathpix">Mathpix</option>
                  <option value="custom">自定义 (OpenAI 兼容)</option>
                </select>
              </div>

              <div class="space-y-1">
                <label class="block text-[10px] text-neutral-500">名称</label>
                <input type="text" bind:value={newApiName} placeholder="我的 API" class="w-full px-2 py-1.5 bg-white border border-neutral-400 focus:border-neutral-600 focus:outline-none text-xs" />
              </div>

              <div class="space-y-1">
                <label class="block text-[10px] text-neutral-500">API 密钥</label>
                <input type="password" bind:value={newApiKey} placeholder={apiTypeDefaults[newApiType]?.placeholder || 'API 密钥'} class="w-full px-2 py-1.5 bg-white border border-neutral-400 focus:border-neutral-600 focus:outline-none text-xs font-mono" />
              </div>

              {#if newApiType !== 'mathpix'}
                <div class="space-y-1">
                  <label class="block text-[10px] text-neutral-500">接口地址 (可选)</label>
                  <input type="text" bind:value={newApiBaseUrl} placeholder={apiTypeDefaults[newApiType]?.baseUrl || 'https://api.example.com/v1/chat/completions'} class="w-full px-2 py-1.5 bg-white border border-neutral-400 focus:border-neutral-600 focus:outline-none text-[10px] font-mono" />
                </div>
                <div class="space-y-1">
                  <label class="block text-[10px] text-neutral-500">模型 (可选)</label>
                  <input type="text" bind:value={newApiModel} placeholder={apiTypeDefaults[newApiType]?.model || '模型名称'} class="w-full px-2 py-1.5 bg-white border border-neutral-400 focus:border-neutral-600 focus:outline-none text-xs font-mono" />
                </div>
              {/if}

              <button class="w-full px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs" on:click={addNewApi}>添加 API</button>
            </div>
          {/if}
        </section>

        <!-- 偏好设置 -->
        <section class="bg-[#FFFEF9] border border-neutral-400 p-5">
          <div class="flex items-center gap-2 mb-4 pb-2 border-b border-neutral-300">
            <span class="text-xs font-bold">偏好设置</span>
          </div>
          <div class="space-y-2">
            <div class="flex items-center justify-between p-3 bg-neutral-50 border border-neutral-300">
              <div>
                <div class="text-sm font-medium">浮窗模式</div>
                <div class="text-[10px] text-neutral-500">显示悬浮预览窗口</div>
              </div>
              <button class="w-10 h-5 border border-neutral-400 transition-colors relative {floatingEnabled ? 'bg-green-600 border-green-600' : 'bg-neutral-200'}" on:click={toggleFloating}>
                <div class="w-4 h-4 bg-white border border-neutral-300 absolute top-0 transition-transform {floatingEnabled ? 'left-5' : 'left-0'}"></div>
              </button>
            </div>
            <div class="flex items-center justify-between p-3 bg-neutral-50 border border-neutral-300">
              <div>
                <div class="text-sm font-medium">公式模式</div>
                <div class="text-[10px] text-neutral-500">针对数学公式识别优化</div>
              </div>
              <button class="w-10 h-5 border border-neutral-400 transition-colors relative {mathMode ? 'bg-green-600 border-green-600' : 'bg-neutral-200'}" on:click={() => { mathMode = !mathMode; saveSettings(); }}>
                <div class="w-4 h-4 bg-white border border-neutral-300 absolute top-0 transition-transform {mathMode ? 'left-5' : 'left-0'}"></div>
              </button>
            </div>
            <div class="flex items-center justify-between p-3 bg-neutral-50 border border-neutral-300">
              <div>
                <div class="text-sm font-medium">窗口置顶</div>
                <div class="text-[10px] text-neutral-500">保持窗口在最顶层显示</div>
              </div>
              <button class="w-10 h-5 border border-neutral-400 transition-colors relative {alwaysOnTop ? 'bg-green-600 border-green-600' : 'bg-neutral-200'}" on:click={toggleAlwaysOnTop}>
                <div class="w-4 h-4 bg-white border border-neutral-300 absolute top-0 transition-transform {alwaysOnTop ? 'left-5' : 'left-0'}"></div>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
    {:else if activeTab === 'ocr'}
    <!-- 截图识别页面 -->
    <div class="flex-1 overflow-y-auto p-6 bg-[#F8F6F1]">
      <div class="grid grid-cols-1 xl:grid-cols-12 gap-5 h-full min-h-[500px]">
        <div class="xl:col-span-8 flex flex-col gap-5">
          <!-- 截图区域 -->
          <section class="bg-[#FFFEF9] border border-neutral-400 flex flex-col h-[280px] relative group">
            <div class="flex items-center gap-2 px-4 py-2 border-b border-neutral-300 bg-neutral-50">
              <span class="text-[10px] font-bold">截图区域</span>
            </div>
            {#if screenshotImage}
              <div class="flex-1 p-2 relative">
                <img src={screenshotImage} alt="截图" class="w-full h-full object-contain" />
                <div class="absolute bottom-4 left-1/2 -translate-x-1/2">
                  <button on:click={() => { screenshotImage = ''; ocrResult = ''; }} class="px-3 py-1.5 bg-white text-neutral-700 text-xs border border-neutral-400 hover:bg-neutral-100">清除</button>
                </div>
              </div>
            {:else}
              <div
                class="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-neutral-300 m-3 hover:border-neutral-500 hover:bg-neutral-50 transition-colors cursor-pointer"
                on:drop={handleDrop}
                on:dragover={handleDragOver}
                on:click={() => fileInput?.click()}
                role="button"
                tabindex="0"
              >
                <div class="text-4xl mb-3 text-neutral-400">[  ]</div>
                <div class="text-xs text-neutral-500 mb-2">拖放图片、粘贴 (⌘V) 或点击上传</div>
                <div class="flex gap-2 mt-2">
                  <button on:click|stopPropagation={captureAndOcr} disabled={isOcrLoading} class="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs disabled:opacity-50">
                    {#if isOcrLoading}
                      <span class="animate-pulse">处理中...</span>
                    {:else}
                      <span>截图识别</span>
                    {/if}
                  </button>
                  <button on:click|stopPropagation={() => fileInput?.click()} class="px-4 py-2 bg-white hover:bg-neutral-100 text-neutral-700 text-xs border border-neutral-400">
                    选择文件
                  </button>
                </div>
                <input
                  bind:this={fileInput}
                  type="file"
                  accept="image/*"
                  class="hidden"
                  on:change={handleFileUpload}
                />
              </div>
            {/if}
          </section>
          <!-- OCR 结果 -->
          <section class="bg-[#FFFEF9] border border-neutral-400 flex-1 min-h-[200px] flex flex-col">
            <div class="flex items-center justify-between px-4 py-2 border-b border-neutral-300 bg-neutral-50">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 {ocrResult ? 'bg-green-500' : 'bg-neutral-400'}"></span>
                <span class="text-[10px] font-bold">识别结果</span>
              </div>
              <button on:click={() => navigator.clipboard.writeText(ocrResult)} class="px-2 py-1 text-[10px] border border-neutral-300 hover:bg-neutral-100" disabled={!ocrResult}>复制</button>
            </div>
            <div class="flex-1 p-4 overflow-auto bg-white">
              {#if isOcrLoading}
                <div class="h-full flex flex-col items-center justify-center">
                  <div class="w-32 h-1 bg-neutral-200 overflow-hidden"><div class="h-full bg-neutral-600 animate-progress"></div></div>
                  <span class="text-[10px] text-neutral-500 mt-2">识别中...</span>
                </div>
              {:else if ocrResult}
                {#if hasLatex(ocrResult)}
                  <div class="rendered-content text-sm leading-relaxed text-neutral-800">{@html renderLatex(ocrResult)}</div>
                {:else}
                  <pre class="text-xs font-mono whitespace-pre-wrap text-neutral-800 leading-relaxed">{ocrResult}</pre>
                {/if}
              {:else}
                <div class="h-full flex items-center justify-center text-neutral-400 text-xs">等待截图...</div>
              {/if}
            </div>
          </section>
        </div>
        <div class="xl:col-span-4 flex flex-col gap-5">
          <section class="bg-[#FFFEF9] border border-neutral-400">
            <div class="px-4 py-2 border-b border-neutral-300 bg-neutral-50"><span class="text-[10px] font-bold">快捷键</span></div>
            <div class="p-4 space-y-2 text-xs">
              <div class="flex justify-between"><span class="text-neutral-600">截图识别</span><kbd class="bg-neutral-100 px-2 py-0.5 border border-neutral-300 text-[10px]">⌘+Shift+M</kbd></div>
            </div>
          </section>
        </div>
      </div>
    </div>
    {:else}
    <!-- 剪贴板页面 (主页面) -->
    <div class="flex-1 overflow-y-auto p-6 bg-[#F8F6F1]">
      <div class="grid grid-cols-1 xl:grid-cols-12 gap-5 h-full min-h-[500px]">
        <!-- 左侧: 剪贴板内容预览 -->
        <div class="xl:col-span-8 flex flex-col gap-5">
          <!-- 原始内容 -->
          <section class="bg-[#FFFEF9] border border-neutral-400 flex-1 min-h-[300px] flex flex-col">
            <div class="flex items-center justify-between px-4 py-2 border-b border-neutral-300 bg-neutral-50">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 {clipboardText ? 'bg-green-500' : 'bg-neutral-400'}"></span>
                <span class="text-[10px] font-bold">剪贴板内容</span>
                {#if containsLatex}
                  <span class="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 border border-amber-300">含公式</span>
                {/if}
              </div>
              <div class="flex gap-1">
                <button on:click={refreshClipboard} class="px-2 py-1 text-[10px] border border-neutral-300 hover:bg-neutral-100">刷新</button>
              </div>
            </div>
            <div class="flex-1 p-4 overflow-auto bg-white border-t border-neutral-200">
              {#if clipboardText || clipboardHtml}
                {#if hasRichContent && renderedContent}
                  <div class="rendered-content text-sm leading-relaxed text-neutral-800">{@html renderedContent}</div>
                {:else}
                  <pre class="text-xs font-mono whitespace-pre-wrap text-neutral-800 leading-relaxed">{clipboardText}</pre>
                {/if}
              {:else}
                <div class="h-full flex items-center justify-center text-neutral-400 text-xs">复制内容后自动显示...</div>
              {/if}
            </div>
          </section>
        </div>

        <!-- 右侧: 格式化复制选项 -->
        <div class="xl:col-span-4 flex flex-col gap-5">
          <!-- 复制选项 -->
          <section class="bg-[#FFFEF9] border border-neutral-400">
            <div class="px-4 py-2 border-b border-neutral-300 bg-neutral-50">
              <span class="text-[10px] font-bold">格式化复制</span>
            </div>
            <div class="p-3 space-y-2">
              <button on:click={copyAsPlainText} disabled={!clipboardText} class="w-full flex items-center justify-between p-3 border border-neutral-300 hover:bg-neutral-50 hover:border-neutral-500 transition-colors disabled:opacity-50">
                <span class="text-xs">纯文本</span>
              </button>
              <button on:click={copyAsHtml} disabled={!clipboardText} class="w-full flex items-center justify-between p-3 border border-neutral-300 hover:bg-neutral-50 hover:border-neutral-500 transition-colors disabled:opacity-50">
                <span class="text-xs">HTML 格式</span>
              </button>
              <button on:click={convertAndCopy} disabled={!clipboardText} class="w-full flex items-center justify-between p-3 border border-neutral-300 hover:bg-neutral-50 hover:border-neutral-500 transition-colors disabled:opacity-50">
                <span class="text-xs">Word 兼容格式</span>
                <kbd class="text-[10px] bg-neutral-100 px-2 py-0.5 border border-neutral-300">⌘V</kbd>
              </button>
            </div>
          </section>

          <!-- 剪贴板信息 -->
          <section class="bg-[#FFFEF9] border border-neutral-400 flex-1">
            <div class="px-4 py-2 border-b border-neutral-300 bg-neutral-50">
              <span class="text-[10px] font-bold">剪贴板信息</span>
            </div>
            <div class="p-4 space-y-3">
              <div class="flex items-center justify-between text-xs">
                <span class="text-neutral-500 text-[10px]">格式</span>
                <span class="font-mono text-[10px]">{clipboardFormats.length > 0 ? clipboardFormats.slice(0, 3).join(', ') : '无'}</span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-neutral-500 text-[10px]">字符数</span>
                <span class="font-mono">{clipboardText.length}</span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-neutral-500 text-[10px]">含公式</span>
                <span class="flex items-center gap-1">
                  <span class="w-2 h-2 {containsLatex ? 'bg-amber-500' : 'bg-neutral-400'}"></span>
                  {containsLatex ? '是' : '否'}
                </span>
              </div>
            </div>
          </section>

          <!-- 快捷键 -->
          <section class="bg-[#FFFEF9] border border-neutral-400">
            <div class="px-4 py-2 border-b border-neutral-300 bg-neutral-50">
              <span class="text-[10px] font-bold">快捷键</span>
            </div>
            <div class="p-4 space-y-2 text-xs">
              <div class="flex justify-between">
                <span class="text-neutral-600">格式化复制</span>
                <kbd class="bg-neutral-100 px-2 py-0.5 border border-neutral-300 text-[10px]">⌘+Shift+V</kbd>
              </div>
              <div class="flex justify-between">
                <span class="text-neutral-600">截图识别</span>
                <kbd class="bg-neutral-100 px-2 py-0.5 border border-neutral-300 text-[10px]">⌘+Shift+M</kbd>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
    {/if}
  {/if}
</main>

<style>
  .drag-region {
    -webkit-app-region: drag;
  }
  .no-drag {
    -webkit-app-region: no-drag;
  }

  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: #F8F6F1;
  }
  ::-webkit-scrollbar-thumb {
    background: #d4d4d4;
    border: 1px solid #a3a3a3;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #a3a3a3;
  }

  @keyframes progress {
    0% { width: 0%; margin-left: 0; }
    50% { width: 50%; margin-left: 25%; }
    100% { width: 0%; margin-left: 100%; }
  }
  .animate-progress {
    animation: progress 1.5s infinite ease-in-out;
  }

  /* KaTeX 渲染样式 */
  .rendered-content :global(.katex-block),
  .rendered-content :global(.katex-display) {
    display: block;
    text-align: center;
    margin: 1em 0;
    padding: 0.5em;
    background: #fafaf8;
    border: 1px solid #e5e5e5;
    overflow-x: auto;
  }
  .rendered-content :global(.katex-error) {
    color: #dc2626;
    background: #fef2f2;
    padding: 0.25em 0.5em;
    border: 1px solid #fecaca;
  }
  .rendered-content :global(.katex) {
    font-size: 1.1em;
  }
  /* 确保 KaTeX HTML 可见，隐藏 MathML (防止重复显示) */
  .rendered-content :global(.katex-html) {
    display: inline-block;
  }
  .rendered-content :global(.katex-mathml) {
    display: none !important;
  }
  /* 同时隐藏独立的 math 元素 */
  .rendered-content :global(math) {
    display: none !important;
  }
  /* 通用 HTML 内容样式 */
  .rendered-content :global(p) {
    margin: 0.5em 0;
  }
  .rendered-content :global(ul),
  .rendered-content :global(ol) {
    margin: 0.5em 0;
    padding-left: 1.5em;
  }
  .rendered-content :global(li) {
    margin: 0.25em 0;
  }
</style>
