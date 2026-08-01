import { neon } from '@neondatabase/serverless'
import { parseFile } from '../fileParser.js'
import { tavilySearch } from '../tavily.js'

const SYSTEM_PROMPT = `You are Stellar AI, an intelligent assistant for Stellar Global Supplies — 
an industrial supply company. You help with procurement analysis, supplier evaluation, 
pricing intelligence, inventory management, and data analysis. 
Be concise, precise, and professional. Use markdown for structured responses.`

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
      let message = '', history = [], entData = false, webSearch = false, model = 'llama-3.3-70b-versatile', fileContent = ''
      const ct = req.headers.get('content-type') || ''

      if (ct.includes('multipart/form-data')) {
        const form = await req.formData()
        message    = form.get('message') || ''
        model      = form.get('model')   || model
        entData    = form.get('entData') === 'true'
        webSearch  = form.get('webSearch') === 'true'
        history    = JSON.parse(form.get('history') || '[]')
        const file = form.get('file')
        if (file) {
          sse(writer, enc, 'status', { text: 'Parsing file…' })
          fileContent = await parseFile(file)
        }
      } else {
        const body = await req.json()
        message   = body.message || ''
        model     = body.model   || model
        entData   = !!body.entData
        webSearch = !!body.webSearch
        history   = body.history || []
      }

      sse(writer, enc, 'status', { text: 'Launching worker…' })

      const systemParts = [SYSTEM_PROMPT]

      // Ent data: query Neon read-only analytics DB
      if (entData) {
        const neonUrl = await resolveSecret(env.NEON_DATABASE_URL)
        if (neonUrl) {
          sse(writer, enc, 'status', { text: 'Querying org data…' })
          try {
            const sql = neon(neonUrl)
            const q   = message.toLowerCase()
            const ctx = []

            // Always load summary stats
            const [salesSummary, purchaseSummary] = await Promise.all([
              sql`SELECT COUNT(*) as invoices, SUM(total_amount) as total, MIN(invoice_date) as from_date, MAX(invoice_date) as to_date FROM sales`.catch(() => []),
              sql`SELECT COUNT(*) as invoices, SUM(total_amount) as total, MIN(invoice_date) as from_date, MAX(invoice_date) as to_date FROM purchases`.catch(() => []),
            ])
            if (salesSummary[0]) ctx.push(`Sales summary: ${salesSummary[0].invoices} invoices, ₹${salesSummary[0].total} total (${salesSummary[0].from_date} to ${salesSummary[0].to_date})`)
            if (purchaseSummary[0]) ctx.push(`Purchase summary: ${purchaseSummary[0].invoices} invoices, ₹${purchaseSummary[0].total} total (${purchaseSummary[0].from_date} to ${purchaseSummary[0].to_date})`)

            // Supplier queries
            if (q.match(/supplier|vendor|purchase|buy|bought|procur/)) {
              const [suppliers, topPurchase] = await Promise.all([
                sql`SELECT supplier_name, gstin FROM suppliers ORDER BY supplier_name LIMIT 50`.catch(() => []),
                sql`SELECT supplier_name, COUNT(*) as invoices, SUM(total_amount) as total FROM purchases GROUP BY supplier_name ORDER BY total DESC LIMIT 20`.catch(() => []),
              ])
              if (suppliers.length) ctx.push(`Suppliers (${suppliers.length}):\n${suppliers.map(s => `- ${s.supplier_name}${s.gstin ? ' (GST: '+s.gstin+')' : ''}`).join('\n')}`)
              if (topPurchase.length) ctx.push(`Top suppliers by purchase value:\n${topPurchase.map(s => `- ${s.supplier_name}: ₹${s.total} (${s.invoices} invoices)`).join('\n')}`)
            }

            // Customer / sales queries
            if (q.match(/customer|client|sale|sold|revenue|invoice/)) {
              const [customers, topSales] = await Promise.all([
                sql`SELECT customer_name, gstin FROM customers ORDER BY customer_name LIMIT 50`.catch(() => []),
                sql`SELECT customer_name, COUNT(*) as invoices, SUM(total_amount) as total FROM sales GROUP BY customer_name ORDER BY total DESC LIMIT 20`.catch(() => []),
              ])
              if (customers.length) ctx.push(`Customers (${customers.length}):\n${customers.map(c => `- ${c.customer_name}${c.gstin ? ' (GST: '+c.gstin+')' : ''}`).join('\n')}`)
              if (topSales.length) ctx.push(`Top customers by sales value:\n${topSales.map(c => `- ${c.customer_name}: ₹${c.total} (${c.invoices} invoices)`).join('\n')}`)
            }

            // Product / item / SKU queries
            if (q.match(/product|item|material|sku|stock|quantity|qty/)) {
              const [skus, topItems] = await Promise.all([
                sql`SELECT sku, material_type, hsn_sac FROM top_sku ORDER BY sku LIMIT 100`.catch(() => []),
                sql`SELECT item_name, material_type, SUM(quantity) as total_qty, SUM(total_amount) as total_value FROM sales_items GROUP BY item_name, material_type ORDER BY total_value DESC LIMIT 20`.catch(() => []),
              ])
              if (skus.length) ctx.push(`Product catalogue (${skus.length} SKUs):\n${skus.map(s => `- ${s.sku}${s.material_type ? ' ['+s.material_type+']' : ''}${s.hsn_sac ? ' HSN:'+s.hsn_sac : ''}`).join('\n')}`)
              if (topItems.length) ctx.push(`Top items by sales value:\n${topItems.map(i => `- ${i.item_name}: qty ${i.total_qty}, ₹${i.total_value}`).join('\n')}`)
            }

            // GST / tax queries
            if (q.match(/gst|tax|cgst|sgst|igst/)) {
              const gstSummary = await sql`
                SELECT gst_rate, SUM(gst_amount) as total_gst, SUM(base_amount) as base, COUNT(*) as items
                FROM sales_items GROUP BY gst_rate ORDER BY gst_rate`.catch(() => [])
              if (gstSummary.length) ctx.push(`GST breakdown (sales):\n${gstSummary.map(g => `- ${g.gst_rate}% rate: ₹${g.total_gst} GST on ₹${g.base} base (${g.items} items)`).join('\n')}`)
            }

            // Date / trend queries
            if (q.match(/month|year|trend|growth|2024|2025|quarter|period/)) {
              const monthly = await sql`
                SELECT TO_CHAR(invoice_date, 'YYYY-MM') as month, SUM(total_amount) as sales
                FROM sales WHERE invoice_date >= NOW() - INTERVAL '12 months'
                GROUP BY month ORDER BY month`.catch(() => [])
              if (monthly.length) ctx.push(`Monthly sales (last 12 months):\n${monthly.map(m => `- ${m.month}: ₹${m.sales}`).join('\n')}`)
            }

            // Order summary queries
            if (q.match(/order|dispatch|deliver|execut|fulfill/)) {
              const [orderSummary, orderStatus] = await Promise.all([
                sql`SELECT month, SUM(order_count) as orders, SUM(grand_total) as total FROM orders_monthly_summary GROUP BY month ORDER BY month DESC LIMIT 12`.catch(() => []),
                sql`SELECT status, payment_status, SUM(order_count) as count, SUM(grand_total) as total FROM orders_monthly_summary GROUP BY status, payment_status ORDER BY total DESC`.catch(() => []),
              ])
              if (orderSummary.length) ctx.push(`Monthly orders (last 12 months):\n${orderSummary.map(o => `- ${o.month}: ${o.orders} orders, \u20b9${o.total}`).join('\n')}`)
              if (orderStatus.length) ctx.push(`Orders by status:\n${orderStatus.map(o => `- ${o.status} / ${o.payment_status}: ${o.count} orders, \u20b9${o.total}`).join('\n')}`)
            }

            // Quote summary queries
            if (q.match(/quote|quotation|proposal|bid|prospect/)) {
              const [quoteSummary, quoteStatus] = await Promise.all([
                sql`SELECT month, SUM(quote_count) as quotes, SUM(total_value) as total, AVG(avg_quote_value) as avg FROM quotes_monthly_summary GROUP BY month ORDER BY month DESC LIMIT 12`.catch(() => []),
                sql`SELECT status, SUM(quote_count) as count, SUM(total_value) as total FROM quotes_monthly_summary GROUP BY status ORDER BY total DESC`.catch(() => []),
              ])
              if (quoteSummary.length) ctx.push(`Monthly quotes (last 12 months):\n${quoteSummary.map(q => `- ${q.month}: ${q.quotes} quotes, \u20b9${q.total} total, \u20b9${Math.round(q.avg)} avg`).join('\n')}`)
              if (quoteStatus.length) ctx.push(`Quotes by status:\n${quoteStatus.map(q => `- ${q.status}: ${q.count} quotes, \u20b9${q.total}`).join('\n')}`)
            }

            if (ctx.length) {
              systemParts.push('\n\n## Stellar Global Supplies — Internal Business Data\n' + ctx.join('\n\n'))
            }

          } catch (e) { console.error('Neon error:', e.message) }
        }
      }

      if (fileContent) {
        systemParts.push(`\n\n## Uploaded File Content\n${fileContent.slice(0, 80000)}`)
      }

      // Web search via Tavily
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

      const groqKey = await resolveSecret(env.GROQ_API_KEY)
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: true,
          max_tokens: 4096,
          messages: [
            { role: 'system', content: systemParts.join('') },
            ...history.slice(-8),
            { role: 'user', content: message || 'Analyse the uploaded data.' },
          ],
        }),
      })

      if (!groqRes.ok) {
        const err = await groqRes.text()
        sse(writer, enc, 'status', { text: `Groq error: ${err}` })
        writer.close()
        return
      }

      sse(writer, enc, 'status', { text: 'Preparing answer…' })

      const reader  = groqRes.body.getReader()
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
            const delta = json.choices?.[0]?.delta?.content
            if (delta) { fullReply += delta; sse(writer, enc, 'token', { delta }) }
          } catch {}
        }
      }

      sse(writer, enc, 'done', {})
      ctx?.waitUntil(persistMessages(env.DB, req.user.id, message, fullReply, model))

    } catch (err) {
      console.error('Chat error:', err.message, err.stack)
      sse(writer, enc, 'status', { text: `Error: ${err.message}` })
    } finally {
      writer.close()
    }
  })()

  return new Response(readable, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}

async function persistMessages(db, userId, userMsg, assistantMsg, model) {
  try {
    let session = await db.prepare(
      `SELECT id FROM sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1`
    ).bind(userId).first()

    if (!session) {
      const sid = crypto.randomUUID()
      const title = userMsg.slice(0, 50) || 'New chat'
      await db.prepare(`INSERT INTO sessions (id, user_id, title) VALUES (?, ?, ?)`).bind(sid, userId, title).run()
      session = { id: sid }
    }

    await db.batch([
      db.prepare(`INSERT INTO messages (id, session_id, role, content, model) VALUES (?, ?, 'user', ?, ?)`)
        .bind(crypto.randomUUID(), session.id, userMsg, model),
      db.prepare(`INSERT INTO messages (id, session_id, role, content, model) VALUES (?, ?, 'assistant', ?, ?)`)
        .bind(crypto.randomUUID(), session.id, assistantMsg, model),
      db.prepare(`UPDATE sessions SET updated_at = datetime('now') WHERE id = ?`).bind(session.id),
    ])
  } catch (e) { console.error('Persist error:', e.message) }
}