const OMML_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math'

export function wrapForWord(html: string): string {
  return `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      xmlns:m="${OMML_NS}"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <!--[if gte mso 9]>
  <xml>
    <o:OfficeDocumentSettings>
      <o:AllowPNG/>
    </o:OfficeDocumentSettings>
  </xml>
  <![endif]-->
  <style>
    .ai-paste-content {
      font-family: "微软雅黑", Arial, sans-serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #333333;
    }
    .ai-paste-content p,
    .ai-paste-content div:not(.katex-block) {
      margin: 0 0 8pt 0;
    }
    .ai-paste-content h1 { font-size: 22pt; font-weight: bold; margin: 16pt 0 8pt 0; }
    .ai-paste-content h2 { font-size: 18pt; font-weight: bold; margin: 14pt 0 6pt 0; }
    .ai-paste-content h3 { font-size: 14pt; font-weight: bold; margin: 12pt 0 4pt 0; }
    .ai-paste-content pre,
    .ai-paste-content code {
      font-family: Consolas, Monaco, "Courier New", monospace;
      font-size: 10pt;
      background-color: #f5f5f5;
      padding: 8px;
      margin: 8pt 0;
      white-space: pre-wrap;
    }
    .ai-paste-content code { padding: 2px 4px; }
    .ai-paste-content table {
      border-collapse: collapse;
      width: 100%;
      margin: 8pt 0;
      border: 1px solid #dddddd;
    }
    .ai-paste-content th,
    .ai-paste-content td {
      border: 1px solid #dddddd;
      padding: 6px;
      text-align: left;
    }
    .ai-paste-content th {
      background-color: #f0f0f0;
      font-weight: bold;
    }
    .ai-paste-content blockquote {
      margin: 8pt 0;
      padding: 8pt 16pt;
      border-left: 4px solid #ddd;
      background-color: #f9f9f9;
      color: #666;
    }
    .ai-paste-content ul,
    .ai-paste-content ol {
      margin: 8pt 0;
      padding-left: 24pt;
    }
    .ai-paste-content li { margin-bottom: 4pt; }
    .ai-paste-content a { color: #0066cc; text-decoration: underline; }
    .ai-paste-content strong { font-weight: bold; }
    .ai-paste-content em { font-style: italic; }
    .ai-paste-content .katex-block {
      text-align: center;
      margin: 1em 0;
      padding: 0.5em;
      background: #fafaf8;
      border: 1px solid #e5e5e5;
    }
    .ai-paste-content .katex {
      font-family: "Cambria Math", "Times New Roman", serif;
    }
    .ai-paste-content .katex-mathml { display: none !important; }
    .ai-paste-content math { display: none !important; }
  </style>
</head>
<body class="ai-paste-content" xmlns:m="${OMML_NS}">
<!--StartFragment-->${html}<!--EndFragment-->
</body>
</html>`.trim()
}
