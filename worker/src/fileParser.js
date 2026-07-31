/**
 * Parse uploaded files in-memory inside the Worker.
 * No file is stored. Text is returned and injected into LLM context.
 *
 * Supported: .csv, .txt, .xlsx (client should pre-convert), .docx (basic), .pdf (text-only)
 */
export async function parseFile(file) {
  const name = (file.name || '').toLowerCase()
  const bytes = await file.arrayBuffer()

  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    return parseCsvOrText(bytes)
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    // XLSX is heavy (SheetJS ~800KB bundle). Client should convert to CSV first.
    // If raw XLSX is sent anyway, try to extract as UTF-8 text (partial)
    return `[XLSX file received: ${file.name} — ${(bytes.byteLength / 1024).toFixed(1)}KB. ` +
           `For best results, export as CSV before uploading. Attempting text extraction…]\n\n` +
           extractTextFromBinary(bytes)
  }

  if (name.endsWith('.docx')) {
    return parseDocx(bytes)
  }

  if (name.endsWith('.pdf')) {
    return parsePdf(bytes)
  }

  // Fallback: try UTF-8
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes).slice(0, 100000)
}

function parseCsvOrText(bytes) {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const lines = text.split('\n').filter(l => l.trim())

  // For CSV: build a readable summary
  if (lines[0]?.includes(',')) {
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    const rows    = lines.slice(1, 201) // cap at 200 rows for token budget
    const total   = lines.length - 1

    return [
      `CSV File: ${lines.length - 1} total rows, ${headers.length} columns`,
      `Columns: ${headers.join(', ')}`,
      ``,
      `Data (first ${Math.min(200, total)} rows):`,
      lines.slice(0, 201).join('\n'),
      total > 200 ? `\n… and ${total - 200} more rows (truncated to fit context)` : '',
    ].join('\n')
  }

  return text.slice(0, 100000)
}

function parseDocx(bytes) {
  // DOCX is a ZIP containing XML. Extract word/document.xml via basic string search.
  try {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    // Find XML content between <w:t> tags (Word text runs)
    const matches = [...text.matchAll(/<w:t[^>]*>([^<]+)<\/w:t>/g)]
    if (matches.length > 0) {
      const content = matches.map(m => m[1]).join(' ')
        .replace(/\s+/g, ' ').trim()
      return `DOCX content:\n\n${content.slice(0, 100000)}`
    }
    return `[DOCX file received but text extraction produced no output. Try saving as .txt or .csv.]`
  } catch {
    return `[DOCX parse error. Please convert to .txt or .csv for analysis.]`
  }
}

function parsePdf(bytes) {
  // PDF text extraction without pdf-parse (which needs Node.js fs).
  // Extract text streams between BT/ET markers (works for text-based PDFs).
  try {
    const text = new TextDecoder('latin1', { fatal: false }).decode(bytes)
    const textBlocks = []

    // Match text between BT (begin text) and ET (end text) PDF operators
    const btEt = text.matchAll(/BT[\s\S]*?ET/g)
    for (const match of btEt) {
      // Extract strings from Tj and TJ operators
      const tjMatches = [...match[0].matchAll(/\(([^)]+)\)\s*Tj/g)]
      const tjArrMatches = [...match[0].matchAll(/\[([^\]]+)\]\s*TJ/g)]
      for (const m of tjMatches) textBlocks.push(m[1])
      for (const m of tjArrMatches) {
        const strings = [...m[1].matchAll(/\(([^)]+)\)/g)].map(s => s[1])
        textBlocks.push(strings.join(''))
      }
    }

    if (textBlocks.length > 0) {
      const content = textBlocks.join(' ')
        .replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\s+/g, ' ').trim()
      return `PDF content:\n\n${content.slice(0, 100000)}`
    }

    return `[PDF received but no extractable text found. This may be a scanned/image PDF. ` +
           `Please use a text-based PDF or convert to .txt/.csv for analysis.]`
  } catch {
    return `[PDF parse error. Please convert to .txt or .csv for analysis.]`
  }
}

function extractTextFromBinary(bytes) {
  // Last-resort: find printable ASCII strings of length > 4
  const u8  = new Uint8Array(bytes)
  const out = []
  let cur   = ''
  for (const b of u8) {
    if (b >= 32 && b < 127) { cur += String.fromCharCode(b) }
    else { if (cur.length > 4) out.push(cur); cur = '' }
  }
  return out.join(' ').slice(0, 50000)
}
