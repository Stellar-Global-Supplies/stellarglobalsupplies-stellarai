/**
 * Verify JWT internally using Web Crypto API (no Neon call needed).
 * Your existing auth system must sign tokens with HS256 + the same JWT_SECRET.
 */
export async function verifyJWT(token, secret) {
  try {
    const [headerB64, payloadB64, sigB64] = token.split('.')
    if (!headerB64 || !payloadB64 || !sigB64) return null

    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    const data = enc.encode(`${headerB64}.${payloadB64}`)
    const sig  = base64urlDecode(sigB64)

    const valid = await crypto.subtle.verify('HMAC', key, sig, data)
    if (!valid) return null

    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null

    return { id: payload.sub || payload.id, email: payload.email, name: payload.name }
  } catch {
    return null
  }
}

function base64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - b64.length % 4)
  return Uint8Array.from(atob(b64 + pad), c => c.charCodeAt(0))
}

// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// routes/auth.js
// Existing login + new /api/auth/sso endpoint
// ─────────────────────────────────────────────────────────────

async function hashPassword(password) {
  const enc = new TextEncoder()
  const hash = await crypto.subtle.digest(
    'SHA-256',
    enc.encode(password)
  )

  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function signJWT(payload, secret) {
  const enc = new TextEncoder()

  const header = btoa(
    JSON.stringify({
      alg: 'HS256',
      typ: 'JWT',
    })
  )
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  const body = btoa(JSON.stringify(payload))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  const sigInput = `${header}.${body}`

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  )

  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(sigInput)
  )

  const sigB64 = btoa(
    String.fromCharCode(...new Uint8Array(sig))
  )
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `${sigInput}.${sigB64}`
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

// ── b64url decode helper ──────────────────────────────────────

function b64url(str) {
  const base64 = str
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const padded = base64.padEnd(
    base64.length +
      (4 - (base64.length % 4)) % 4,
    '='
  )

  return atob(padded)
}

// ── Algorithm params for JWKS verification ────────────────────

function getCryptoParams(alg) {
  switch (alg) {
    case 'RS256':
      return {
        importAlgo: {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256',
        },
        verifyAlgo: {
          name: 'RSASSA-PKCS1-v1_5',
        },
      }

    case 'RS384':
      return {
        importAlgo: {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-384',
        },
        verifyAlgo: {
          name: 'RSASSA-PKCS1-v1_5',
        },
      }

    case 'RS512':
      return {
        importAlgo: {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-512',
        },
        verifyAlgo: {
          name: 'RSASSA-PKCS1-v1_5',
        },
      }

    case 'ES256':
      return {
        importAlgo: {
          name: 'ECDSA',
          namedCurve: 'P-256',
        },
        verifyAlgo: {
          name: 'ECDSA',
          hash: 'SHA-256',
        },
      }

    case 'ES384':
      return {
        importAlgo: {
          name: 'ECDSA',
          namedCurve: 'P-384',
        },
        verifyAlgo: {
          name: 'ECDSA',
          hash: 'SHA-384',
        },
      }

    case 'ES512':
      return {
        importAlgo: {
          name: 'ECDSA',
          namedCurve: 'P-521',
        },
        verifyAlgo: {
          name: 'ECDSA',
          hash: 'SHA-512',
        },
      }

    default:
      throw new Error(`Unsupported algorithm: ${alg}`)
  }
}

// Cache JWKS in memory for worker lifetime
let jwksCache = null

// ── Existing routes ───────────────────────────────────────────

export async function handleRegister() {
  return json(
    { error: 'Registration is not available' },
    403
  )
}

export async function handleLogin(req, env) {
  let body

  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { email, password } = body || {}

  if (!email || !password) {
    return json(
      { error: 'Email and password are required' },
      400
    )
  }

  const secret =
    typeof env.JWT_SECRET?.get === 'function'
      ? await env.JWT_SECRET.get()
      : env.JWT_SECRET

  const row = await env.DB.prepare(
    'SELECT id, email, name, role, password FROM users WHERE email = ?'
  )
    .bind(email.toLowerCase())
    .first()

  if (!row) {
    return json(
      { error: 'Invalid email or password' },
      401
    )
  }

  const hash = await hashPassword(password)

  if (hash !== row.password) {
    return json(
      { error: 'Invalid email or password' },
      401
    )
  }

  const user = {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
  }

  const token = await signJWT(
    {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.name,
      exp:
        Math.floor(Date.now() / 1000) +
        60 * 60 * 24 * 30,
    },
    secret
  )

  return json({ token, user })
}

// ── SSO route ─────────────────────────────────────────────────
// Called by SSOCallback.jsx with the Casdoor JWT.
// Verifies the JWT signature FIRST, then enforces the
// signed exp claim, then finds/creates the D1 user.

export async function handleSSOLogin(req, env) {
  let body

  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { token } = body || {}

  if (!token || typeof token !== 'string') {
    return json({ error: 'Missing token' }, 400)
  }

  // ── 1. Decode JWT structure ────────────────────────────────

  const parts = token.split('.')

  if (parts.length !== 3) {
    return json({ error: 'Malformed token' }, 400)
  }

  const [h, p, s] = parts

  let header
  let payload

  try {
    header = JSON.parse(b64url(h))
    payload = JSON.parse(b64url(p))
  } catch {
    return json(
      { error: 'Failed to decode token' },
      400
    )
  }

  // ── 2. Validate JWT header BEFORE verification ─────────────

  if (!header || typeof header !== 'object') {
    return json({ error: 'Invalid token header' }, 400)
  }

  if (!header.alg) {
    return json(
      { error: 'Token algorithm missing' },
      400
    )
  }

  if (!header.kid) {
    return json(
      { error: 'Token key ID missing' },
      400
    )
  }

  // Explicitly reject algorithms that this endpoint does not
  // support. Never accept "none" or an attacker-selected HMAC
  // algorithm for a JWKS-backed public-key token.
  let cryptoParams

  try {
    cryptoParams = getCryptoParams(header.alg)
  } catch {
    return json(
      { error: `Unsupported algorithm: ${header.alg}` },
      401
    )
  }

  // ── 3. Fetch JWKS ──────────────────────────────────────────

  if (!jwksCache) {
    const jwksUrl = env.CASDOOR_JWKS_URL

    if (!jwksUrl) {
      return json(
        { error: 'CASDOOR_JWKS_URL not configured' },
        500
      )
    }

    const res = await fetch(jwksUrl)

    if (!res.ok) {
      return json(
        { error: `JWKS fetch failed: ${res.status}` },
        502
      )
    }

    jwksCache = await res.json()
  }

  // ── 4. Match signing key ──────────────────────────────────

  const jwk = jwksCache.keys?.find(
    k => k.kid === header.kid
  )

  if (!jwk) {
    return json(
      { error: 'No matching key in JWKS' },
      401
    )
  }

  // Make sure the selected key is compatible with the
  // algorithm declared by the signed token.
  if (jwk.alg && jwk.alg !== header.alg) {
    return json(
      { error: 'Signing key algorithm mismatch' },
      401
    )
  }

  // ── 5. Verify JWT signature ────────────────────────────────
  //
  // IMPORTANT:
  // payload.exp is NOT trusted until this succeeds.

  let pubKey

  try {
    pubKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      cryptoParams.importAlgo,
      false,
      ['verify']
    )
  } catch {
    return json(
      { error: 'Failed to import signing key' },
      401
    )
  }

  let sigBytes

  try {
    sigBytes = Uint8Array.from(
      b64url(s),
      c => c.charCodeAt(0)
    )
  } catch {
    return json(
      { error: 'Invalid token signature encoding' },
      400
    )
  }

  const dataBytes = new TextEncoder().encode(
    `${h}.${p}`
  )

  let valid

  try {
    valid = await crypto.subtle.verify(
      cryptoParams.verifyAlgo,
      pubKey,
      sigBytes,
      dataBytes
    )
  } catch {
    return json(
      { error: 'Token signature verification failed' },
      401
    )
  }

  if (!valid) {
    return json(
      {
        error: `Signature invalid — alg=${header.alg}`,
      },
      401
    )
  }

  // ── 6. NOW validate the SIGNED expiry claim ────────────────
  //
  // This happens only AFTER cryptographic verification.
  // Query-string ts is never trusted here.

  if (
    typeof payload.exp !== 'number' ||
    !Number.isFinite(payload.exp) ||
    payload.exp <= 0
  ) {
    return json(
      { error: 'Token expiry claim is missing or invalid' },
      401
    )
  }

  const nowSeconds = Math.floor(Date.now() / 1000)

  if (payload.exp <= nowSeconds) {
    return json(
      {
        error:
          'Token expired — sign in again from the portal',
      },
      401
    )
  }

  // ── 7. Extract identity ───────────────────────────────────

  const sub = payload.sub

  if (!sub || typeof sub !== 'string') {
    return json(
      { error: 'Token missing sub claim' },
      400
    )
  }

  const name =
    payload.name ||
    payload.preferred_username ||
    sub

  const email =
    typeof payload.email === 'string' &&
    payload.email.trim()
      ? payload.email.trim()
      : `${sub.replace(
          /[^a-zA-Z0-9]/g,
          '_'
        )}@internal.sgs`

  // ── 8. Find or create user in D1 ──────────────────────────

  let row = await env.DB.prepare(
    'SELECT id, email, name, role FROM users WHERE id = ?'
  )
    .bind(sub)
    .first()

  if (!row) {
    row = await env.DB.prepare(
      'SELECT id, email, name, role FROM users WHERE email = ?'
    )
      .bind(email)
      .first()
  }

  if (!row) {
    await env.DB.prepare(
      'INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)'
    )
      .bind(
        sub,
        email,
        name,
        'user'
      )
      .run()

    row = {
      id: sub,
      email,
      name,
      role: 'user',
    }
  }

  const user = {
    id: row.id,
    email: row.email,
    name: row.name || name,
    role: row.role,
  }

  // ── 9. Sign worker JWT ────────────────────────────────────

  const secret =
    typeof env.JWT_SECRET?.get === 'function'
      ? await env.JWT_SECRET.get()
      : env.JWT_SECRET

  const workerToken = await signJWT(
    {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.name,
      exp:
        Math.floor(Date.now() / 1000) +
        60 * 60 * 24 * 30,
    },
    secret
  )

  return json({
    token: workerToken,
    user,
  })
}
