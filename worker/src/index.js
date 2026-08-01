import { AutoRouter, cors } from 'itty-router'
import { handleChat }                  from './routes/chat.js'
import { handleImagine }               from './routes/imagine.js'
import { handleHistory }               from './routes/history.js'
import { handleSearch }                from './routes/search.js'
import { handleRegister, handleLogin } from './routes/auth.js'
import { verifyJWT }                   from './auth.js'

const ALLOWED_ORIGINS = [
  'https://stellarglobalsupplies-stellarai.pages.dev',
  'http://localhost:5173',
  'http://localhost:4173',
]

const { preflight, corsify } = cors({
  origin: (origin) => ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
})

const router = AutoRouter({ before: [preflight], finally: [corsify] })

// ── Auth middleware ──
// itty-router passes (req, env, ctx) to every handler matching router.fetch(req, env, ctx)
async function withAuth(req, env) {
  const auth  = req.headers.get('Authorization') || ''
  const token = auth.replace('Bearer ', '').trim()
  if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  const secret = typeof env.JWT_SECRET?.get === 'function'
    ? await env.JWT_SECRET.get()
    : env.JWT_SECRET
  const user = await verifyJWT(token, secret)
  if (!user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 })
  req.user = user
}

// ── Routes ──
router.post('/api/auth/register', handleRegister)
router.post('/api/auth/login',    handleLogin)
router.post('/api/chat',    withAuth, handleChat)
router.post('/api/imagine', withAuth, handleImagine)
router.get ('/api/history', withAuth, handleHistory)
router.post('/api/search',  withAuth, handleSearch)
router.get ('/api/health',  () => new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
  headers: { 'Content-Type': 'application/json' }
}))

// ── Scheduled cron ──
async function scheduled(event, env) {
  await env.DB.prepare(`DELETE FROM messages WHERE created_at < datetime('now', '-6 months')`).run()
  await env.DB.prepare(`DELETE FROM sessions WHERE id NOT IN (SELECT DISTINCT session_id FROM messages)`).run()
  console.log('Cron cleanup done:', new Date().toISOString())
}

export default {
  fetch: async (req, env, ctx) => {
    try {
      // Pass env and ctx as extra args — itty-router forwards them to every handler as (req, env, ctx)
      return await router.fetch(req, env, ctx)
    } catch (err) {
      console.error('Worker error:', err?.message, err?.stack)
      return new Response(JSON.stringify({ error: 'Internal server error', detail: err?.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0] }
      })
    }
  },
  scheduled: (event, env, ctx) => ctx.waitUntil(scheduled(event, env)),
}