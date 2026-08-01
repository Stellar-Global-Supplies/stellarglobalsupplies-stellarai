import { useState } from 'react'

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787'

const Logo = () => (
  <svg width="44" height="44" viewBox="0 0 56 56" fill="none">
    <defs>
      <linearGradient id="llg1" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#c9a84c"/>
        <stop offset="100%" stopColor="#3a7d44"/>
      </linearGradient>
      <linearGradient id="llg2" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#e8c96b"/>
        <stop offset="100%" stopColor="#4a9e57"/>
      </linearGradient>
    </defs>
    <path d="M28 4L51.2 17v26L28 56 4.8 43V17z" fill="url(#llg1)" opacity=".12"/>
    <path d="M28 4L51.2 17v26L28 56 4.8 43V17z" stroke="url(#llg1)" strokeWidth="2" fill="none"/>
    <path d="M28 11l4.2 10.8L43 17l-7.3 8.7 7.3 8.7-11.5-3.8L28 42l-4.2-10.8L12.5 34.4l7.3-8.7L12.5 17l11.3 4.8z" fill="url(#llg2)"/>
    <circle cx="28" cy="26" r="4" fill="#fff"/>
  </svg>
)

export default function Login({ onLogin }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`${WORKER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Invalid email or password')
        return
      }

      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      onLogin(data.token, data.user)

    } catch {
      setError('Cannot reach the server. Make sure the worker is deployed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <Logo />
          <span className="auth-logo-text">Stellar AI</span>
        </div>

        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-sub">Sign in to continue to Stellar AI</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              placeholder="you@stellarglobal.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? <span className="auth-spinner"/> : 'Sign in'}
          </button>
        </form>

        <p className="auth-switch">Contact your administrator to get access.</p>
      </div>
    </div>
  )
}