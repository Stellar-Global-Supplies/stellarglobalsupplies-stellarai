import { neon } from '@neondatabase/serverless'
import { parseFile } from '../fileParser.js'
import { tavilySearch } from '../tavily.js'

const SYSTEM_PROMPT = `You are Stellar AI, an intelligent assistant for Stellar Global Supplies — 
an industrial supply company. You help with procurement analysis, supplier evaluation, 
pricing intelligence, inventory management, and data analysis. 
Be concise, precise, and professional. Use markdown for structured responses.`

function sse(writer, enc, event, data) {
  writer.write(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
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

      // Ent data: query Neon
      if (entData) {
        const neonUrl = await resolveSecret(env.NEON_DATABASE_URL)
        if (neonUrl) {
          sse(writer, enc, 'status', { text: 'Querying org data…' })
          try {
            const sql = neon(neonUrl)
            const rows = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' LIMIT 20`
            systemParts.push(`\n\n## Internal Org Data Available\nTables: ${rows.map(r => r.table_name).join(', ')}`)
            if (message.toLowerCase().match(/price|cost|rate/)) {
              const prices = await sql`SELECT * FROM products LIMIT 50`.catch(() => [])
              if (prices.length) systemParts.push(`\nProduct data:\n${JSON.stringify(prices, null, 2)}`)
            }
            if (message.toLowerCase().match(/supplier|vendor/)) {
              const suppliers = await sql`SELECT * FROM suppliers LIMIT 50`.catch(() => [])
              if (suppliers.length) systemParts.push(`\nSupplier data:\n${JSON.stringify(suppliers, null, 2)}`)
            }
            if (message.toLowerCase().match(/inventory|stock/)) {
              const inv = await sql`SELECT * FROM inventory LIMIT 50`.catch(() => [])
              if (inv.length) systemParts.push(`\nInventory data:\n${JSON.stringify(inv, null, 2)}`)
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

      // Load D1 history
      const dbHistory = await env.DB.prepare(
        `SELECT role, content FROM messages
         WHERE session_id = (
           SELECT id FROM sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1
         )
         ORDER BY created_at DESC LIMIT 10`
      ).bind(req.user.id).all().catch(() => ({ results: [] }))

      const chatHistory = (dbHistory.results || []).reverse().map(r => ({ role: r.role, content: r.content }))

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
            ...chatHistory,
            ...history.slice(-4),
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