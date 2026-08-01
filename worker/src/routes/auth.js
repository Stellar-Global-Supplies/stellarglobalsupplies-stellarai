/**
 * Auth routes — /api/auth/register and /api/auth/login
 * Uses D1 for user storage and Web Crypto for JWT signing (HS256).
 * No external dependencies needed.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

async function hashPassword(password) {
    const enc  = new TextEncoder()
    const data = enc.encode(password)
    const hash = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
  }
  
  async function signJWT(payload, secret) {
    const enc     = new TextEncoder()
    const header  = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    const body    = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    const sigInput = `${header}.${body}`
  
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(sigInput))
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  
    return `${sigInput}.${sigB64}`
  }
  
  function makeToken(user, secret) {
    return signJWT(
      { sub: user.id, id: user.id, email: user.email, name: user.name, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 },
      secret
    )
  }
  
  function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  
  // ── Register ──────────────────────────────────────────────────────────────────
  
  export async function handleRegister(req) {
    return new Response(JSON.stringify({ error: 'Registration is not available' }), { status: 403 })
  }
  
  // ── Login ─────────────────────────────────────────────────────────────────────
  
  export async function handleLogin(req) {
    let body
    try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  
    const { email, password } = body || {}
    if (!email || !password) return json({ error: 'Email and password are required' }, 400)
  
    const db     = req.env.DB
    const secret = typeof req.env.JWT_SECRET?.get === 'function'
      ? await req.env.JWT_SECRET.get()
      : req.env.JWT_SECRET
  
    const row = await db.prepare(
      'SELECT id, email, name, role, password FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first()
  
    if (!row) return json({ error: 'Invalid email or password' }, 401)
  
    const hash = await hashPassword(password)
    if (hash !== row.password) return json({ error: 'Invalid email or password' }, 401)
  
    const user  = { id: row.id, email: row.email, name: row.name, role: row.role }
    const token = await makeToken(user, secret)
  
    return json({ token, user })
  }