import { AutoRouter, cors } from 'itty-router'
import { handleChat }                  from './routes/chat.js'
import { handleImagine }               from './routes/imagine.js'
import { handleSearch }                from './routes/search.js'
import { handleRegister, handleLogin } from './routes/auth.js'
import { handleHistory, handleDeleteSession, handleDeleteAllSessions } from './routes/history.js'
import { verifyJWT }                   from './auth.js'

const ALLOWED_ORIGINS = [
  'https://ai.stellarglobalsupplies.com',
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
router.get ('/api/history',       withAuth, handleHistory)
router.delete('/api/history/:id',  withAuth, handleDeleteSession)
router.delete('/api/history/all',   withAuth, handleDeleteAllSessions)
router.post('/api/search',  withAuth, handleSearch)
// DB checks intentionally omitted — D1 used only for cron cleanup, not request path.
// Supabase / NeonDB / external services excluded to avoid false positives on latency.
router.get('/health', async (req, env) => {
  const checks = {
    // ── Required secrets — rename to match your wrangler.toml ───────────────
    jwt_secret:     env.JWT_SECRET     ? "ok" : "missing",
    // AI provider key used by handleChat / handleImagine (e.g. OPENAI_API_KEY):
    ai_api_key:     env.AI_API_KEY     ? "ok" : "missing",
    // Search API key used by handleSearch (e.g. Brave / Serper / Tavily):
    search_api_key: env.SEARCH_API_KEY ? "ok" : "missing",
  }

  const allOk = Object.values(checks).every((v) => v === "ok")

  return new Response(
    JSON.stringify({
      service: "stellar-ai-worker",
      app: "stellar-ai-platform",
      status: allOk ? "ok" : "degraded",
      checks,
      ts: new Date().toISOString(),
    }),
    {
      status: allOk ? 200 : 503,
      headers: { "Content-Type": "application/json" },
    }
  )
})

// ── Scheduled cron ──
async function scheduled(event, env) {
  await env.DB.prepare(`DELETE FROM messages WHERE created_at < datetime('now', '-6 months')`).run()
  await env.DB.prepare(`DELETE FROM sessions WHERE id NOT IN (SELECT DISTINCT session_id FROM messages)`).run()
  console.log('Cron cleanup done:', new Date().toISOString())

  // ── Ping Better Stack heartbeat (signals cron ran successfully) ────────────
  // Create a Heartbeat monitor in Better Stack → set interval to match your cron
  // → copy the URL → add as secret: wrangler secret put BETTER_STACK_HEARTBEAT_URL
  const heartbeatUrl = typeof env.BETTER_STACK_HEARTBEAT_URL?.get === 'function'
    ? await env.BETTER_STACK_HEARTBEAT_URL.get()
    : env.BETTER_STACK_HEARTBEAT_URL
  if (heartbeatUrl) {
    try {
      await fetch(heartbeatUrl)
      console.log('[heartbeat] Better Stack pinged ✅')
    } catch (err) {
      console.warn('[heartbeat] ping failed:', err.message)
    }
  }
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
