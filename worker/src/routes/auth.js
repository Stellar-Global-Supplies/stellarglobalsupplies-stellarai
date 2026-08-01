async function hashPassword(password) {
    const enc  = new TextEncoder()
    const hash = await crypto.subtle.digest('SHA-256', enc.encode(password))
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
  }
  
  async function signJWT(payload, secret) {
    const enc      = new TextEncoder()
    const header   = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    const body     = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    const sigInput = `${header}.${body}`
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(sigInput))
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    return `${sigInput}.${sigB64}`
  }
  
  function json(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
  }
  
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