/**
 * OCR Service with multiple API providers
 */

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

// Built-in API (hidden from user)
const BUILTIN_API: ApiConfig = {
  id: 'builtin-siliconflow',
  name: 'Default (SiliconFlow)',
  type: 'siliconflow',
  apiKey: 'sk-elscoezyzvumpalpkqlogrgcsirxoekvtldocjiqoaclpzmw',
  baseUrl: 'https://api.siliconflow.cn/v1/chat/completions',
  model: 'deepseek-ai/DeepSeek-OCR',
  isBuiltin: true,
}

/**
 * Get the built-in API config (for internal use only)
 */
export function getBuiltinApi(): ApiConfig {
  return BUILTIN_API
}

/**
 * Perform OCR using specified API config
 */
export async function performOcr(
  imageBase64: string,
  apiConfig: ApiConfig,
  mathMode: boolean = false
): Promise<OcrResult> {
  switch (apiConfig.type) {
    case 'siliconflow':
    case 'openai':
      return performOpenAIStyleOcr(imageBase64, apiConfig, mathMode)
    case 'mathpix':
      return performMathpixOcr(imageBase64, apiConfig)
    case 'custom':
      return performOpenAIStyleOcr(imageBase64, apiConfig, mathMode)
    default:
      return { success: false, error: 'Unknown API type' }
  }
}

/**
 * OpenAI-style API (SiliconFlow, OpenAI, custom compatible)
 */
async function performOpenAIStyleOcr(
  imageBase64: string,
  config: ApiConfig,
  mathMode: boolean
): Promise<OcrResult> {
  const baseUrl = config.baseUrl || 'https://api.siliconflow.cn/v1/chat/completions'
  const model = config.model || 'deepseek-ai/DeepSeek-V3'

  try {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    // DeepSeek-OCR 官方推荐提示词（不使用 grounding 模式，避免输出坐标）
    const isDeepSeekOCR = model.includes('DeepSeek-OCR')
    const prompt = isDeepSeekOCR
      ? (mathMode ? 'Convert the document to markdown.' : 'Free OCR.')
      : mathMode
        ? `You are a mathematical formula OCR expert. Extract all mathematical content from this image.

Rules:
1. Output ALL formulas in LaTeX format
2. Use $...$ for inline math
3. Use $$...$$ for display/block math
4. Preserve equation numbering if present
5. For matrices, use \\begin{pmatrix}...\\end{pmatrix} or \\begin{bmatrix}...\\end{bmatrix}
6. For aligned equations, use \\begin{align}...\\end{align}
7. Include any surrounding text context
8. Do not explain, just output the extracted content

Output the LaTeX directly:`
        : `Please extract all text and mathematical formulas from this image.
For mathematical formulas, output them in LaTeX format wrapped with $ for inline math or $$ for display math.
Output the content in a clean, readable format preserving the original structure.
If there are no formulas, just output the plain text.
Do not add any explanations, just output the extracted content directly.`

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${base64Data}` },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: mathMode ? 0 : 0.1,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[OCR] API error:', response.status, errorText)
      return { success: false, error: `API error: ${response.status}` }
    }

    const data = await response.json()
    console.log('[OCR] Full API response:', JSON.stringify(data, null, 2))
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      console.error('[OCR] No content in response, data:', data)
      return { success: false, error: 'No content in response' }
    }
    console.log('[OCR] Extracted content:', content)

    const hasLatex = /\$[^$]+\$|\$\$[^$]+\$\$|\\[a-zA-Z]+/.test(content)

    return {
      success: true,
      text: content,
      latex: hasLatex ? content : undefined,
    }
  } catch (error) {
    console.error('[OCR] Request failed:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Mathpix API
 */
async function performMathpixOcr(imageBase64: string, config: ApiConfig): Promise<OcrResult> {
  try {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    // Mathpix requires app_id and app_key in headers
    // config.apiKey format: "app_id:app_key"
    const [appId, appKey] = config.apiKey.split(':')

    if (!appId || !appKey) {
      return { success: false, error: 'Mathpix API key format should be "app_id:app_key"' }
    }

    const response = await fetch('https://api.mathpix.com/v3/text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        app_id: appId,
        app_key: appKey,
      },
      body: JSON.stringify({
        src: `data:image/png;base64,${base64Data}`,
        formats: ['text', 'latex_styled'],
        data_options: {
          include_asciimath: true,
          include_latex: true,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Mathpix error: ${response.status} - ${errorText}` }
    }

    const data = await response.json()

    return {
      success: true,
      text: data.text || data.latex_styled || '',
      latex: data.latex_styled || data.text,
    }
  } catch (error) {
    console.error('[Mathpix OCR] Request failed:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Legacy function for backward compatibility
 */
export async function performMathOcr(imageBase64: string, apiKey: string): Promise<OcrResult> {
  return performOcr(
    imageBase64,
    {
      id: 'legacy',
      name: 'Legacy',
      type: 'siliconflow',
      apiKey,
      baseUrl: 'https://api.siliconflow.cn/v1/chat/completions',
      model: 'deepseek-ai/DeepSeek-V3',
    },
    true
  )
}
