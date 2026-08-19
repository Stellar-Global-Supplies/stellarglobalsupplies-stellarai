import { useEffect, useState } from 'react'

const WORKER_URL =
  import.meta.env.VITE_WORKER_URL || 'http://localhost:8787'

const LANDING_URL =
  import.meta.env.VITE_LANDING_URL ||
  'https://apps.stellarglobalsupplies.com'

const MAX_AGE_MS = 5 * 60 * 1000

// ── Open-redirect guard ───────────────────────────────────────
// Only allow same-origin paths.
// External URLs fall back to the application root.
function safeRedirect(redirect, fallback = '/') {
  try {
    const url = new URL(redirect, window.location.origin)

    if (url.origin !== window.location.origin) {
      return fallback
    }

    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}

const Logo = () => (
  <svg width="44" height="44" viewBox="0 0 56 56" fill="none">
    <defs>
      <linearGradient
        id="llg1"
        x1="0"
        y1="0"
        x2="56"
        y2="56"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0%" stopColor="#c9a84c" />
        <stop offset="100%" stopColor="#3a7d44" />
      </linearGradient>

      <linearGradient
        id="llg2"
        x1="0"
        y1="0"
        x2="56"
        y2="56"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0%" stopColor="#e8c96b" />
        <stop offset="100%" stopColor="#4a9e57" />
      </linearGradient>
    </defs>

    <path
      d="M28 4L51.2 17v26L28 56 4.8 43V17z"
      fill="url(#llg1)"
      opacity=".12"
    />

    <path
      d="M28 4L51.2 17v26L28 56 4.8 43V17z"
      stroke="url(#llg1)"
      strokeWidth="2"
      fill="none"
    />

    <path
      d="M28 11l4.2 10.8L43 17l-7.3 8.7 7.3 8.7-11.5-3.8L28 42l-4.2-10.8L12.5 34.4l7.3-8.7L12.5 17l11.3 4.8z"
      fill="url(#llg2)"
    />

    <circle cx="28" cy="26" r="4" fill="#fff" />
  </svg>
)

export default function SSOCallback({ onLogin }) {
  const [status, setStatus] = useState('Verifying your session…')
  const [error, setError] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    const token = params.get('token')

    // Never use the raw redirect query parameter.
    const redirect = safeRedirect(
      params.get('redirect') || '/'
    )

    /*
     * Missing-token requests must return to the portal
     * BEFORE timestamp validation.
     */
    if (!token) {
      const callback = encodeURIComponent(
        window.location.origin + redirect
      )

      window.location.replace(
        `${LANDING_URL}/login?callback=${callback}`
      )

      return
    }

    /*
     * Token is present, so ts is mandatory.
     */
    const tsRaw = params.get('ts')

    if (!tsRaw) {
      setError(
        'This sign-in link is invalid. Please return to the portal.'
      )
      return
    }

    const ts = Number(tsRaw)

    /*
     * Reject NaN, Infinity, -Infinity, zero,
     * and negative timestamps.
     */
    if (!Number.isFinite(ts) || ts <= 0) {
      setError(
        'This sign-in link is invalid. Please return to the portal.'
      )
      return
    }

    const now = Date.now()

    /*
     * Reject timestamps from the future.
     */
    if (ts > now) {
      setError(
        'This sign-in link is invalid. Please return to the portal.'
      )
      return
    }

    /*
     * Reject timestamps older than 5 minutes.
     */
    if (now - ts > MAX_AGE_MS) {
      setError(
        'This sign-in link has expired. Please return to the portal.'
      )
      return
    }

    setStatus('Exchanging credentials…')

    /*
     * Calls the Worker's /api/auth/sso endpoint.
     * The Worker remains the authoritative backend
     * for the SSO exchange.
     */
    fetch(`${WORKER_URL}/api/auth/sso`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    })
      .then(async res => {
        const data = await res.json()

        if (!res.ok) {
          throw new Error(
            data.error || `Exchange failed (${res.status})`
          )
        }

        return data
      })
      .then(({ token: workerToken, user }) => {
        setStatus('Setting up your workspace…')

        // Store exactly like the existing login flow.
        localStorage.setItem('token', workerToken)
        localStorage.setItem('user', JSON.stringify(user))

        onLogin(workerToken, user)

        // Clean the SSO parameters from the browser URL.
        window.history.replaceState({}, '', '/')
      })
      .catch(err => {
        setError(
          err?.message ||
            'Sign-in failed. Please return to the portal.'
        )
      })
  }, [onLogin])

  if (error) {
    return (
      <div className="auth-page">
        <div
          className="auth-card"
          style={{ textAlign: 'center' }}
        >
          <div
            className="auth-logo"
            style={{ justifyContent: 'center' }}
          >
            <Logo />
            <span className="auth-logo-text">
              Stellar AI
            </span>
          </div>

          <p
            style={{
              color: '#e53e3e',
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Sign-in error
          </p>

          <p
            style={{
              color: '#888',
              fontSize: 13,
              marginBottom: 20,
            }}
          >
            {error}
          </p>

          <a
            href={LANDING_URL}
            style={{
              display: 'inline-block',
              padding: '10px 28px',
              background:
                'linear-gradient(135deg, #c9a84c, #3a7d44)',
              borderRadius: 8,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Return to Portal
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div
        className="auth-card"
        style={{ textAlign: 'center' }}
      >
        <div
          className="auth-logo"
          style={{ justifyContent: 'center' }}
        >
          <Logo />

          <span className="auth-logo-text">
            Stellar AI
          </span>
        </div>

        <p
          style={{
            color: '#888',
            fontSize: 14,
            marginTop: 8,
          }}
        >
          {status}
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 6,
            marginTop: 16,
          }}
        >
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background:
                  'linear-gradient(135deg, #c9a84c, #3a7d44)',
                animation:
                  'pulse 1.2s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
