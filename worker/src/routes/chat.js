import { neon } from '@neondatabase/serverless'
import { parseFile } from '../fileParser.js'
import { tavilySearch } from '../tavily.js'

const SYSTEM_PROMPT = `You are Stellar AI, an intelligent assistant for Stellar Global Supplies — an Indian industrial supply company. You help with procurement analysis, supplier evaluation, pricing intelligence, inventory management, and data analysis.

CRITICAL RULES:
- Always use ₹ (Indian Rupees) for all currency values, never use $ or USD
- Be concise, precise, and professional
- Use markdown for structured responses (headers, bullet points, bold)
- When Ent Data is provided below, base your answer strictly on that data only
- If no Ent Data is provided and the user asks about company-specific numbers (sales, orders, revenue etc), respond: "I don't have access to internal data for this query. Please enable the Ent Data toggle to get answers based on real company data."
- Never invent, estimate, or hallucinate company-specific figures`

// Map friendly model IDs (sent from frontend) to Cloudflare Workers AI model strings
const CF_MODEL_MAP = {
  'llama-3.3-70b':   '@cf/meta/llama-3.3-70b-instruct-fp8-fast',   // Best quality — default
  'llama-4-scout':   '@cf/meta/llama-4-scout-17b-16e-instruct',     // Multimodal + function calling
  'gpt-oss-120b':    '@cf/openai/gpt-oss-120b',                     // Powerful reasoning
  'qwq-32b':         '@cf/qwen/qwq-32b',                            // Deep analysis / finance
  'glm-4.7-flash':   '@cf/zai-org/glm-4.7-flash',                  // Fast · 131k ctx · multilingual
  'llama-3.1-8b':    '@cf/meta/llama-3.1-8b-instruct-fp8-fast',    // Fastest · simple queries
}

// Vision-capable models (support image inputs via Llama 4 Scout multimodal)
const VISION_MODELS = new Set(['llama-4-scout'])

function sse(writer, enc, type, data) {
  writer.write(enc.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`))
}

async function resolveSecret(binding) {
  return typeof binding?.get === 'function' ? await binding.get() : binding
}

export async function handleChat(req, env, ctx) {
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const enc    = new TextEncoder()

  ;(async () => {
    try {
      let message = '', history = [], entData = false, webSearch = false
      let model = 'llama-3.3-70b', fileContent = '', sessionId = null
      let imageBase64 = null, imageMediaType = null

      const ct = req.headers.get('content-type') || ''

      if (ct.includes('multipart/form-data')) {
        const form = await req.formData()
        message       = form.get('message') || ''
        model         = form.get('model')   || model
        entData       = form.get('entData') === 'true'
        webSearch     = form.get('webSearch') === 'true'
        history       = JSON.parse(form.get('history') || '[]')
        sessionId     = form.get('sessionId') || null
        const file    = form.get('file')
        const imgFile = form.get('image')  // optional image upload for vision models

        if (file) {
          sse(writer, enc, 'status', { text: 'Parsing file…' })
          fileContent = await parseFile(file)
        }

        // Handle image upload for vision-capable models
        if (imgFile && VISION_MODELS.has(model)) {
          const imgBuffer = await imgFile.arrayBuffer()
          const imgBytes  = new Uint8Array(imgBuffer)
          let binary = ''
          for (const b of imgBytes) binary += String.fromCharCode(b)
          imageBase64     = btoa(binary)
          imageMediaType  = imgFile.type || 'image/jpeg'
        }
      } else {
        const body = await req.json()
        message   = body.message  || ''
        model     = body.model    || model
        entData   = !!body.entData
        webSearch = !!body.webSearch
        history   = body.history  || []
        sessionId = body.sessionId || null
      }

      // Resolve CF model ID — fall back to 70B if unknown model sent
      const cfModel = CF_MODEL_MAP[model] || CF_MODEL_MAP['llama-3.3-70b']

      sse(writer, enc, 'status', { text: 'Launching worker…' })

      const systemParts = [SYSTEM_PROMPT]

      // ── Ent data: query Neon read-only analytics DB ──────────────────────────
      if (entData) {
        const neonUrl = await resolveSecret(env.NEON_DATABASE_URL)
        if (neonUrl) {
          sse(writer, enc, 'status', { text: 'Querying org data…' })
          try {
            const sql = neon(neonUrl)
            const q   = message.toLowerCase()
            const ctx = []

            const currentMonth = new Date().toISOString().slice(0, 7)

            const safeQuery = async (label, query) => {
              try {
                const result = await query
                console.log(`Neon [${label}]:`, JSON.stringify(result?.slice?.(0,2) ?? result))
                return result
              } catch (e) {
                console.error(`Neon [${label}] ERROR:`, e.message)
                return []
              }
            }

            const [salesSummary, purchaseSummary, currentSales, currentOrders] = await Promise.all([
              safeQuery('sales_summary', sql`SELECT COUNT(*) as invoices, SUM(total_amount) as total, MIN(invoice_date) as from_date, MAX(invoice_date) as to_date FROM sales`),
              safeQuery('purchases_summary', sql`SELECT COUNT(*) as invoices, SUM(total_amount) as total, MIN(invoice_date) as from_date, MAX(invoice_date) as to_date FROM purchases`),
              safeQuery('current_sales', sql`SELECT COUNT(*) as invoices, SUM(total_amount) as total FROM sales WHERE TO_CHAR(invoice_date, 'YYYY-MM') = ${currentMonth}`),
              safeQuery('current_orders', sql`SELECT SUM(order_count) as orders, SUM(grand_total) as total FROM orders_monthly_summary WHERE month = ${currentMonth}`),
            ])
            if (salesSummary[0]?.total) ctx.push(`Overall sales: ${salesSummary[0].invoices} invoices, ₹${salesSummary[0].total} total (${salesSummary[0].from_date} to ${salesSummary[0].to_date})`)
            if (purchaseSummary[0]?.total) ctx.push(`Overall purchases: ${purchaseSummary[0].invoices} invoices, ₹${purchaseSummary[0].total} total`)
            if (currentSales[0]?.total) ctx.push(`Current month (${currentMonth}) sales: ${currentSales[0].invoices} invoices, ₹${currentSales[0].total}`)
            if (currentOrders[0]?.orders) ctx.push(`Current month (${currentMonth}) orders: ${currentOrders[0].orders} orders, ₹${currentOrders[0].total}`)

            if (q.match(/supplier|vendor|purchase|buy|bought|procur/)) {
              const [suppliers, topPurchase] = await Promise.all([
                safeQuery('select_supplier_name,_gstin_fr', sql`SELECT supplier_name, gstin FROM suppliers ORDER BY supplier_name LIMIT 50`),
                safeQuery('select_supplier_name,_count(*)', sql`SELECT supplier_name, COUNT(*) as invoices, SUM(total_amount) as total FROM purchases GROUP BY supplier_name ORDER BY total DESC LIMIT 20`),
              ])
              if (suppliers.length) ctx.push(`Suppliers (${suppliers.length}):\n${suppliers.map(s => `- ${s.supplier_name}${s.gstin ? ' (GST: '+s.gstin+')' : ''}`).join('\n')}`)
              if (topPurchase.length) ctx.push(`Top suppliers by purchase value:\n${topPurchase.map(s => `- ${s.supplier_name}: ₹${s.total} (${s.invoices} invoices)`).join('\n')}`)
            }

            if (q.match(/customer|client|sale|sold|revenue|invoice/)) {
              const [customers, topSales] = await Promise.all([
                safeQuery('select_customer_name,_gstin_fr', sql`SELECT customer_name, gstin FROM customers ORDER BY customer_name LIMIT 50`),
                safeQuery('select_customer_name,_count(*)', sql`SELECT customer_name, COUNT(*) as invoices, SUM(total_amount) as total FROM sales GROUP BY customer_name ORDER BY total DESC LIMIT 20`),
              ])
              if (customers.length) ctx.push(`Customers (${customers.length}):\n${customers.map(c => `- ${c.customer_name}${c.gstin ? ' (GST: '+c.gstin+')' : ''}`).join('\n')}`)
              if (topSales.length) ctx.push(`Top customers by sales value:\n${topSales.map(c => `- ${c.customer_name}: ₹${c.total} (${c.invoices} invoices)`).join('\n')}`)
            }

            if (q.match(/product|item|material|sku|stock|quantity|qty/)) {
              const [skus, topItems] = await Promise.all([
                safeQuery('select_sku,_material_type,_hsn', sql`SELECT sku, material_type, hsn_sac FROM top_sku ORDER BY sku LIMIT 100`),
                safeQuery('select_item_name,_material_typ', sql`SELECT item_name, material_type, SUM(quantity) as total_qty, SUM(total_amount) as total_value FROM sales_items GROUP BY item_name, material_type ORDER BY total_value DESC LIMIT 20`),
              ])
              if (skus.length) ctx.push(`Product catalogue (${skus.length} SKUs):\n${skus.map(s => `- ${s.sku}${s.material_type ? ' ['+s.material_type+']' : ''}${s.hsn_sac ? ' HSN:'+s.hsn_sac : ''}`).join('\n')}`)
              if (topItems.length) ctx.push(`Top items by sales value:\n${topItems.map(i => `- ${i.item_name}: qty ${i.total_qty}, ₹${i.total_value}`).join('\n')}`)
            }

            if (q.match(/gst|tax|cgst|sgst|igst/)) {
              const gstSummary = await safeQuery('select_gst_rate,_sum(gst_amoun', sql`
                SELECT gst_rate, SUM(gst_amount) as total_gst, SUM(base_amount) as base, COUNT(*) as items
                FROM sales_items GROUP BY gst_rate ORDER BY gst_rate`)
              if (gstSummary.length) ctx.push(`GST breakdown (sales):\n${gstSummary.map(g => `- ${g.gst_rate}% rate: ₹${g.total_gst} GST on ₹${g.base} base (${g.items} items)`).join('\n')}`)
            }

            if (q.match(/month|year|trend|growth|2024|2025|quarter|period/)) {
              const monthly = await safeQuery('select_to_char(invoice_date,_', sql`
                SELECT TO_CHAR(invoice_date, 'YYYY-MM') as month, SUM(total_amount) as sales
                FROM sales WHERE invoice_date >= NOW() - INTERVAL '12 months'
                GROUP BY month ORDER BY month`)
              if (monthly.length) ctx.push(`Monthly sales (last 12 months):\n${monthly.map(m => `- ${m.month}: ₹${m.sales}`).join('\n')}`)
            }

            if (q.match(/order|dispatch|deliver|execut|fulfill/)) {
              const [orderSummary, orderStatus] = await Promise.all([
                safeQuery('select_month,_sum(order_count)', sql`SELECT month, SUM(order_count) as orders, SUM(grand_total) as total FROM orders_monthly_summary GROUP BY month ORDER BY month DESC LIMIT 12`),
                safeQuery('select_status,_payment_status,', sql`SELECT status, payment_status, SUM(order_count) as count, SUM(grand_total) as total FROM orders_monthly_summary GROUP BY status, payment_status ORDER BY total DESC`),
              ])
              if (orderSummary.length) ctx.push(`Monthly orders (last 12 months):\n${orderSummary.map(o => `- ${o.month}: ${o.orders} orders, ₹${o.total}`).join('\n')}`)
              if (orderStatus.length) ctx.push(`Orders by status:\n${orderStatus.map(o => `- ${o.status} / ${o.payment_status}: ${o.count} orders, ₹${o.total}`).join('\n')}`)
            }

            if (q.match(/quote|quotation|proposal|bid|prospect/)) {
              const [quoteSummary, quoteStatus] = await Promise.all([
                safeQuery('select_month,_sum(quote_count)', sql`SELECT month, SUM(quote_count) as quotes, SUM(total_value) as total, AVG(avg_quote_value) as avg FROM quotes_monthly_summary GROUP BY month ORDER BY month DESC LIMIT 12`),
                safeQuery('select_status,_sum(quote_count', sql`SELECT status, SUM(quote_count) as count, SUM(total_value) as total FROM quotes_monthly_summary GROUP BY status ORDER BY total DESC`),
              ])
              if (quoteSummary.length) ctx.push(`Monthly quotes (last 12 months):\n${quoteSummary.map(q => `- ${q.month}: ${q.quotes} quotes, ₹${q.total} total, ₹${Math.round(q.avg)} avg`).join('\n')}`)
              if (quoteStatus.length) ctx.push(`Quotes by status:\n${quoteStatus.map(q => `- ${q.status}: ${q.count} quotes, ₹${q.total}`).join('\n')}`)
            }

            console.log(`Neon ctx items loaded: ${ctx.length}`)

            if (ctx.length) {
              systemParts.push('\n\n## Stellar Global Supplies — Internal Business Data (use ONLY these numbers, do not invent any figures):\n' + ctx.join('\n\n'))
            } else {
              systemParts.push('\n\n## Ent Data Status\nThe internal database was queried but returned no data for this question. Tell the user the data is not yet available and suggest running the sync or checking if the Neon database has been populated.')
            }

          } catch (e) {
            console.error('Neon error:', e.message, e.stack)
            systemParts.push('\n\n## Ent Data Status\nThe internal database query failed. Tell the user there was a data connection error and not to rely on any figures.')
          }
        }
      }

      if (fileContent) {
        systemParts.push(`\n\n## Uploaded File Content\n${fileContent.slice(0, 80000)}`)
      }

      // ── Web search via Tavily ────────────────────────────────────────────────
      if (webSearch && message) {
        const tavilyKey = await resolveSecret(env.TAVILY_API_KEY)
        if (tavilyKey) {
          sse(writer, enc, 'status', { text: 'Searching the web…' })
          try {
            const results = await tavilySearch(message, tavilyKey)
            if (results.length) {
              systemParts.push(`\n\n## Web Search Results\n${results.map(r => `**${r.title}**\n${r.content}\nSource: ${r.url}`).join('\n\n')}`)
            }
          } catch (e) { console.error('Tavily error:', e.message) }
        }
      }

      sse(writer, enc, 'status', { text: 'Thinking…' })

      // ── Build messages array ─────────────────────────────────────────────────
      const userContent = []

      // If vision model and image was uploaded, add image part first
      if (imageBase64 && VISION_MODELS.has(model)) {
        userContent.push({
          type: 'image_url',
          image_url: { url: `data:${imageMediaType};base64,${imageBase64}` }
        })
      }

      userContent.push({ type: 'text', text: message || 'Analyse the uploaded data.' })

      const messages = [
        { role: 'system', content: systemParts.join('') },
        ...history.slice(-8),
        {
          role: 'user',
          content: (imageBase64 && VISION_MODELS.has(model)) ? userContent : (message || 'Analyse the uploaded data.')
        },
      ]

      // ── Call Cloudflare Workers AI ───────────────────────────────────────────
      const aiStream = await env.AI.run(cfModel, {
        messages,
        max_tokens: 4096,
        stream: true,
      })

      if (!aiStream || typeof aiStream.getReader !== 'function') {
        sse(writer, enc, 'status', { text: 'Error: No stream returned from Workers AI' })
        writer.close()
        return
      }

      sse(writer, enc, 'status', { text: 'Preparing answer…' })

      // ── Stream Workers AI SSE response ───────────────────────────────────────
      const reader  = aiStream.getReader()
      const decoder = new TextDecoder()
      let buffer = '', fullReply = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') break
          try {
            const json  = JSON.parse(raw)
            // Workers AI streaming uses same OpenAI-compatible delta format
            const delta = json.response ?? json.choices?.[0]?.delta?.content
            if (delta) { fullReply += delta; sse(writer, enc, 'token', { delta }) }
          } catch {}
        }
      }

      const realSessionId = await persistMessages(env.DB, req.user.id, message, fullReply, model, sessionId)
      sse(writer, enc, 'done', { sessionId: realSessionId })

    } catch (err) {
      console.error('Chat error:', err.message, err.stack)
      sse(writer, enc, 'status', { text: `Error: ${err.message}` })
    } finally {
      writer.close()
    }
  })()

  return new Response(readable, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}

async function persistMessages(db, userId, userMsg, assistantMsg, model, sessionId = null) {
  try {
    let session = null

    if (sessionId) {
      session = await db.prepare(
        `SELECT id FROM sessions WHERE id = ? AND user_id = ?`
      ).bind(sessionId, userId).first()
    }

    if (!session) {
      const sid   = crypto.randomUUID()
      const title = userMsg.slice(0, 50) || 'New chat'
      await db.prepare(
        `INSERT INTO sessions (id, user_id, title) VALUES (?, ?, ?)`
      ).bind(sid, userId, title).run()
      session = { id: sid }
    }

    await db.batch([
      db.prepare(`INSERT INTO messages (id, session_id, role, content, model) VALUES (?, ?, 'user', ?, ?)`)
        .bind(crypto.randomUUID(), session.id, userMsg, model),
      db.prepare(`INSERT INTO messages (id, session_id, role, content, model) VALUES (?, ?, 'assistant', ?, ?)`)
        .bind(crypto.randomUUID(), session.id, assistantMsg, model),
      db.prepare(`UPDATE sessions SET updated_at = datetime('now') WHERE id = ?`)
        .bind(session.id),
    ])

    return session.id
  } catch (e) {
    console.error('Persist error:', e.message)
    return null
  }
}