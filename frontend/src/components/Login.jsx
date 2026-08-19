import { useEffect } from 'react'

const LANDING_URL = import.meta.env.VITE_LANDING_URL || 'https://apps.stellarglobalsupplies.com'

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

// No login form — SSO handles everything via the portal
export default function Login({ onLogin }) {
  useEffect(() => {
    const callback = encodeURIComponent(window.location.origin + '/')
    window.location.replace(`${LANDING_URL}/login?callback=${callback}`)
  }, [])

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="auth-logo" style={{ justifyContent: 'center' }}>
          <Logo />
          <span className="auth-logo-text">Stellar AI</span>
        </div>
        <p style={{ color: '#888', fontSize: 14, marginTop: 8 }}>Redirecting to portal…</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'linear-gradient(135deg, #c9a84c, #3a7d44)',
              animation: 'pulse 1.2s ease-in-out infinite',
              animationDelay: `${i * 0.2}s`,
            }} />
          ))}
        </div>
      </div>
    </div>
  )
}
