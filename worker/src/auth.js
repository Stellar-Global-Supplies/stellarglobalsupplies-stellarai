// ─────────────────────────────────────────────────────────────
// routes/auth.js
// Existing login + new /api/auth/sso endpoint
// ─────────────────────────────────────────────────────────────

async function hashPassword(password) {
  const enc  = new TextEncoder()
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(password))
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function signJWT(payload, secret) {
  const enc      = new TextEncoder()
  const header   = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const body     = btoa(JSON.stringify(payload)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const sigInput = `${header}.${body}`
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(sigInput))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  return `${sigInput}.${sigB64}`
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

// ── b64url decode helper ──────────────────────────────────────
function b64url(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded  = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=')
  return atob(padded)
}

// ── Algorithm params for JWKS verification ────────────────────
function getCryptoParams(alg) {
  switch (alg) {
    case 'RS256': return { importAlgo: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verifyAlgo: { name: 'RSASSA-PKCS1-v1_5' } }
    case 'RS384': return { importAlgo: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' }, verifyAlgo: { name: 'RSASSA-PKCS1-v1_5' } }
    case 'RS512': return { importAlgo: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' }, verifyAlgo: { name: 'RSASSA-PKCS1-v1_5' } }
    case 'ES256': return { importAlgo: { name: 'ECDSA', namedCurve: 'P-256' }, verifyAlgo: { name: 'ECDSA', hash: 'SHA-256' } }
    case 'ES384': return { importAlgo: { name: 'ECDSA', namedCurve: 'P-384' }, verifyAlgo: { name: 'ECDSA', hash: 'SHA-384' } }
    case 'ES512': return { importAlgo: { name: 'ECDSA', namedCurve: 'P-521' }, verifyAlgo: { name: 'ECDSA', hash: 'SHA-512' } }
    default: throw new Error(`Unsupported algorithm: ${alg}`)
  }
}

// Cache JWKS in memory for worker lifetime
let jwksCache = null

// ── Existing routes ───────────────────────────────────────────

export async function handleRegister() {
  return json({ error: 'Registration is not available' }, 403)
}

export async function handleLogin(req, env) {
  let body
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { email, password } = body || {}
  if (!email || !password) return json({ error: 'Email and password are required' }, 400)

  const secret = typeof env.JWT_SECRET?.get === 'function' ? await env.JWT_SECRET.get() : env.JWT_SECRET

  const row = await env.DB.prepare(
    'SELECT id, email, name, role, password FROM users WHERE email = ?'
  ).bind(email.toLowerCase()).first()

  if (!row) return json({ error: 'Invalid email or password' }, 401)

  const hash = await hashPassword(password)
  if (hash !== row.password) return json({ error: 'Invalid email or password' }, 401)

  const user  = { id: row.id, email: row.email, name: row.name, role: row.role }
  const token = await signJWT(
    { sub: user.id, id: user.id, email: user.email, name: user.name, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 },
    secret
  )

  return json({ token, user })
}

// ── New SSO route ─────────────────────────────────────────────
// Called by SSOCallback.jsx with the Casdoor JWT from the portal.
// Verifies the JWT, finds/creates user in D1, returns worker token.
export async function handleSSOLogin(req, env) {
  let body
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { token } = body || {}
  if (!token) return json({ error: 'Missing token' }, 400)

  // ── 1. Decode JWT ─────────────────────────────────────────
  const parts = token.split('.')
  if (parts.length !== 3) return json({ error: 'Malformed token' }, 400)
  const [h, p, s] = parts

  let header, payload
  try {
    header  = JSON.parse(b64url(h))
    payload = JSON.parse(b64url(p))
  } catch (e) {
    return json({ error: `Failed to decode token: ${e}` }, 400)
  }

  // ── 2. Check expiry ───────────────────────────────────────
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    return json({ error: 'Token expired — sign in again from the portal' }, 401)
  }

  // ── 3. Fetch JWKS (cached) ────────────────────────────────
  if (!jwksCache) {
    const jwksUrl = env.CASDOOR_JWKS_URL
    if (!jwksUrl) return json({ error: 'CASDOOR_JWKS_URL not configured' }, 500)
    const res = await fetch(jwksUrl)
    if (!res.ok) return json({ error: `JWKS fetch failed: ${res.status}` }, 502)
    jwksCache = await res.json()
  }

  // ── 4. Match key ──────────────────────────────────────────
  const jwk =
    jwksCache.keys?.find(k => k.kid === header.kid) ??
    jwksCache.keys?.find(k => k.alg === header.alg) ??
    jwksCache.keys?.[0]

  if (!jwk) return json({ error: 'No matching key in JWKS' }, 401)

  // ── 5. Verify signature ───────────────────────────────────
  let cryptoParams
  try { cryptoParams = getCryptoParams(header.alg) }
  catch (e) { return json({ error: String(e) }, 400) }

  const pubKey = await crypto.subtle.importKey('jwk', jwk, cryptoParams.importAlgo, false, ['verify'])
  const dataBytes = new TextEncoder().encode(`${h}.${p}`)
  const sigBytes  = Uint8Array.from(b64url(s), c => c.charCodeAt(0))
  const valid     = await crypto.subtle.verify(cryptoParams.verifyAlgo, pubKey, sigBytes, dataBytes)

  if (!valid) return json({ error: `Signature invalid — alg=${header.alg}` }, 401)

  // ── 6. Extract identity ───────────────────────────────────
  const sub   = payload.sub
  const name  = (payload.name || payload.preferred_username || sub)
  const email = (payload.email?.trim()) || `${sub.replace(/[^a-zA-Z0-9]/g, '_')}@internal.sgs`

  if (!sub) return json({ error: 'Token missing sub claim' }, 400)

  // ── 7. Find or create user in D1 ─────────────────────────
  // First try by ID (sub) — handles returning SSO users
  let row = await env.DB.prepare(
    'SELECT id, email, name, role FROM users WHERE id = ?'
  ).bind(sub).first()

  if (!row) {
    // Try by email — handles users who previously had email/password login
    row = await env.DB.prepare(
      'SELECT id, email, name, role FROM users WHERE email = ?'
    ).bind(email).first()
  }

  if (!row) {
    // Create new SSO user
    await env.DB.prepare(
      'INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)'
    ).bind(sub, email, name, 'user').run()
    row = { id: sub, email, name, role: 'user' }
  }

  const user = { id: row.id, email: row.email, name: row.name || name, role: row.role }

  // ── 8. Sign worker JWT — same shape as handleLogin ────────
  const secret = typeof env.JWT_SECRET?.get === 'function' ? await env.JWT_SECRET.get() : env.JWT_SECRET
  const workerToken = await signJWT(
    { sub: user.id, id: user.id, email: user.email, name: user.name, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 },
    secret
  )

  return json({ token: workerToken, user })
}
