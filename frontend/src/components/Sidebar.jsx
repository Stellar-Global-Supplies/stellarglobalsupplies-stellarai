import { useState } from 'react'

const Logo = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <defs>
      <linearGradient id="lg1" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#c9a84c"/>
        <stop offset="100%" stopColor="#3a7d44"/>
      </linearGradient>
      <linearGradient id="lg2" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#e8c96b"/>
        <stop offset="100%" stopColor="#4a9e57"/>
      </linearGradient>
    </defs>
    <path d="M16 2L28.12 9v14L16 30 3.88 23V9z" fill="url(#lg1)" opacity=".15"/>
    <path d="M16 2L28.12 9v14L16 30 3.88 23V9z" stroke="url(#lg1)" strokeWidth="1.5" fill="none"/>
    <path d="M16 6l2.4 6.2L25 10l-4.2 5 4.2 5-6.6-2.2L16 24l-2.4-6.2L7 20l4.2-5L7 10l6.6 2.2z" fill="url(#lg2)"/>
    <circle cx="16" cy="15" r="2.5" fill="#fff"/>
  </svg>
)

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function Sidebar({ open, history, user, onLogout, onNewChat, onSelectHistory }) {
  const [search, setSearch] = useState('')

  const filtered = history.filter(h => h.title.toLowerCase().includes(search.toLowerCase()))

  // Group by Today / Yesterday / Older
  const now   = Date.now()
  const DAY   = 86400000
  const today     = filtered.filter(h => !h.ts || now - new Date(h.ts).getTime() < DAY)
  const yesterday = filtered.filter(h => h.ts && now - new Date(h.ts).getTime() >= DAY && now - new Date(h.ts).getTime() < 2 * DAY)
  const older     = filtered.filter(h => h.ts && now - new Date(h.ts).getTime() >= 2 * DAY)

  const groups = [
    { label: 'Today',     items: today },
    { label: 'Yesterday', items: yesterday },
    { label: 'Older',     items: older },
  ]

  return (
    <aside className={`sidebar${open ? '' : ' collapsed'}`}>
      <div className="sidebar-top">
        <div className="sidebar-header">
          <a className="logo-mark" href="#">
            <Logo />
            <span className="logo-text">Stellar AI</span>
          </a>
        </div>
        <button className="new-chat-btn" onClick={onNewChat}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          New chat
        </button>
      </div>

      <div className="sidebar-search">
        <div className="search-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search chats…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="sidebar-history">
        {filtered.length === 0 && (
          <div style={{ padding: '16px 8px', fontSize: 13, color: '#aaa', textAlign: 'center' }}>
            No chat history yet
          </div>
        )}
        {groups.map(({ label, items }) => {
          if (!items.length) return null
          return (
            <div className="history-section" key={label}>
              <div className="history-label">{label}</div>
              {items.map(item => (
                <div
                  key={item.id}
                  className={`history-item${item.active ? ' active' : ''}`}
                  onClick={() => onSelectHistory(item.id)}
                >
                  <span>{item.title}</span>
                  <button className="item-menu">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <div className="sidebar-bottom">
        <div className="profile-card" onClick={onLogout} title="Sign out">
          <div className="avatar">{getInitials(user?.name || user?.email)}</div>
          <div className="profile-info">
            <div className="profile-name">{user?.name || user?.email}</div>
            <div className="profile-sub">Sign out</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </div>
      </div>
    </aside>
  )
}