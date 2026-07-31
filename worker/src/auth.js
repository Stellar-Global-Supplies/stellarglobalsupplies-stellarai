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
