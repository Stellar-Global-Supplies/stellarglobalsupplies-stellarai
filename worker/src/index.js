import { AutoRouter, cors } from 'itty-router'
import { handleChat }    from './routes/chat.js'
import { handleImagine } from './routes/imagine.js'
import { handleHistory } from './routes/history.js'
import { handleSearch }  from './routes/search.js'
import { verifyJWT }     from './auth.js'

const { preflight, corsify } = cors({
  origin: (origin, req) => req.env?.ALLOWED_ORIGIN || '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
})

const router = AutoRouter({ before: [preflight], finally: [corsify] })

// ── Auth middleware ──
async function withAuth(req) {
  const auth = req.headers.get('Authorization') || ''
  const token = auth.replace('Bearer ', '').trim()
  if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  const user = await verifyJWT(token, req.env.JWT_SECRET)
  if (!user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 })
  req.user = user
}

// ── Routes ──
router.post('/api/chat',    withAuth, handleChat)
router.post('/api/imagine', withAuth, handleImagine)
router.get ('/api/history', withAuth, handleHistory)
router.post('/api/search',  withAuth, handleSearch)
router.get ('/api/health',  () => new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
  headers: { 'Content-Type': 'application/json' }
}))

// ── Scheduled cron: 6-month history cleanup ──
async function scheduled(event, env) {
  await env.DB.prepare(
    `DELETE FROM messages WHERE created_at < datetime('now', '-6 months')`
  ).run()
  await env.DB.prepare(
    `DELETE FROM sessions WHERE id NOT IN (SELECT DISTINCT session_id FROM messages)`
  ).run()
  console.log('Cron cleanup done:', new Date().toISOString())
}

export default {
  fetch:     (req, env, ctx) => router.fetch(req, { ...req, env, ctx }),
  scheduled: (event, env, ctx) => ctx.waitUntil(scheduled(event, env)),
}
